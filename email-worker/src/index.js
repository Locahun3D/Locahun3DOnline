import PostalMime from "postal-mime";

/**
 * 問い合わせメール受信 Worker。
 *
 * 経路: 顧客/運営のメール → contact@locahun3d.com（Google Workspace 受信箱）
 *   → Gmail の自動転送 → reply@inbox.locahun3d.com（Cloudflare Email Routing）
 *   → この Worker → D1 contact_messages へ INSERT
 *   → /admin/contact-requests がスレッド表示（相手メールで contact_requests と突合）
 *
 * 運営が Gmail から返信する場合は reply@inbox.locahun3d.com を BCC に入れると
 * 「運営 → 相手」(outbound) として取り込まれる。管理画面からの返信はアプリ側
 * (replyToContactRequestAction) が直接 D1 に追記するのでこの Worker を通らない。
 *
 * ⚠ INSERT の列と data(JSON) の形状は src/lib/contact-messages.ts の
 *    contactMessageSchema と手動で一致させること（この Worker は Next.js の
 *    コードを import できない）。
 */

// この集合に from が含まれるメールは「運営からの送信」(outbound) と分類する。
const OPERATOR_ADDRS = new Set([
  "contact@locahun3d.com",
  "admin@locahun3d.com",
  "noreply@locahun3d.com",
  "nakamurakou1108@gmail.com",
]);

// 自ドメイン系の宛先（counterpart 判定から除外する）。
function isOwnAddress(addr) {
  return (
    OPERATOR_ADDRS.has(addr) ||
    addr.endsWith("@locahun3d.com") ||
    addr.endsWith("@inbox.locahun3d.com")
  );
}

export default {
  async email(message, env, ctx) {
    let parsed;
    try {
      parsed = await PostalMime.parse(message.raw);
    } catch (e) {
      console.error("[email-worker] MIME parse failed:", e);
      // 解析不能でも最低限転送だけは試みる（メールを黙って握り潰さない）
      if (env.FORWARD_TO) await message.forward(env.FORWARD_TO).catch(() => {});
      return;
    }

    const from = (parsed.from?.address || message.from || "").toLowerCase();
    const toAll = [
      ...(parsed.to ?? []),
      ...(parsed.cc ?? []),
    ]
      .map((a) => (a.address || "").toLowerCase())
      .filter(Boolean);

    const isOutbound = OPERATOR_ADDRS.has(from);
    // 相手側アドレス: outbound は宛先のうち自ドメイン以外の先頭、inbound は from。
    const counterpart = isOutbound
      ? (toAll.find((a) => !isOwnAddress(a)) ?? "")
      : from;

    // 本文はプレーンテキスト優先、無ければHTMLのタグ除去（先頭20,000字まで）。
    let bodyText = parsed.text ?? "";
    if (!bodyText && parsed.html) {
      bodyText = parsed.html
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    bodyText = bodyText.slice(0, 20000);

    // Message-ID をIDに使い、Gmail転送とBCCの二重配送でも重複INSERTしない
    //（ON CONFLICT DO NOTHING）。無ければランダムUUID。
    const id = (parsed.messageId || "").replace(/[<>]/g, "") || crypto.randomUUID();
    const createdAt = new Date().toISOString();

    // src/lib/contact-messages.ts contactMessageSchema と同形状の JSON
    const data = {
      id,
      direction: isOutbound ? "outbound" : "inbound",
      counterpart,
      fromEmail: from,
      toEmail: toAll[0] ?? "",
      subject: (parsed.subject ?? "").slice(0, 300),
      bodyText,
      source: "email",
      createdAt,
    };

    if (counterpart) {
      try {
        await env.DB.prepare(
          "INSERT INTO contact_messages (id, direction, counterpart, created_at, data) " +
            "VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
        )
          .bind(id, data.direction, counterpart, createdAt, JSON.stringify(data))
          .run();
      } catch (e) {
        // D1障害でメールを失わないよう、保存失敗は転送へフォールスルー
        console.error("[email-worker] D1 insert failed:", e);
      }
    } else {
      console.warn("[email-worker] counterpart不明のためスキップ:", from, toAll.join(","));
    }

    // 転送ポリシー:
    //  - Gmail の自動転送で来たメール（X-Forwarded-To あり）は原本が受信箱に
    //    残っているので再転送しない（転送ループ防止も兼ねる）。
    //  - 運営自身の BCC コピー(outbound)も転送不要。
    //  - それ以外（Gmail転送設定の確認メールなど直接届いたもの）は FORWARD_TO へ。
    const wasAutoForwarded = !!message.headers.get("x-forwarded-to");
    if (env.FORWARD_TO && !wasAutoForwarded && !isOutbound) {
      try {
        await message.forward(env.FORWARD_TO);
      } catch (e) {
        console.error("[email-worker] forward failed:", e);
      }
    }
  },
};
