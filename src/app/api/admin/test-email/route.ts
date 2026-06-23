import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { notifySubscription } from "@/lib/email";

export const runtime = "nodejs";

/**
 * 管理者用テスト送信。Resendの応答（200/送信ID or エラー）をそのまま返すので、
 * 送信ドメイン認証や送信元アドレスの可否を確定診断できる。
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, error: "RESEND_API_KEY 未設定" }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as { to?: string; type?: string };
  const to = body.to || admin.email;
  const from = process.env.EMAIL_FROM || "ロケハン3D <noreply@locahun3d.com>";

  // サブスク開始メール（領収書相当）の実テンプレートで送信し、結果を返す。
  if (body.type === "subscription") {
    const sent = await notifySubscription({
      to,
      plan: "individual",
      amountYen: 3300,
      interval: "monthly",
      viaStripe: true,
    });
    return NextResponse.json({ ok: sent, to, from, type: "subscription" });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "【ロケハン3D】テストメール",
        html: "<p>Resend 連携テスト送信です。このメールが届いていれば、購入・返金・領収書メールも届きます。</p>",
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      to,
      from,
      id: json.id ?? null,
      error: res.ok ? null : json.message || json.name || "unknown",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
