# 受信メール取り込み（contact@ → D1）を作らない判断 — 2026-07-28

**結論: 実装しない。`email-worker` は撤去した。** 必要になったら本書の「将来やるなら」に従って作る。

## 何が動いていて、何が動いていなかったか

`contact@locahun3d.com` まわりは**取り込み以外すべて正常**だった。

| 機能 | 状態 | 経路 |
|---|---|---|
| contact@ で受信 | 正常 | Google Workspace。contact@ は `l3dtools@locahun3d.com` の**エイリアス**（ログイン不可・受信箱は l3dtools@） |
| Gmail から手で返信 | 正常 | 「アカウント」設定で contact@ が送信元の**デフォルト**、返信モードも常にデフォルト |
| アプリからの送信 | 正常 | Resend。`RESEND_API_KEY` は本番Workerに設定済み |
| 管理画面からの返信 | 正常 | 送信=Resend、スレッド追記=アプリが直接D1へ（`admin-actions.ts` の `contactMessageRepo.append`）。**worker を通らない** |
| **お客様の返信の取り込み** | **不動** | 入口 `inbox.locahun3d.com` が存在せず、1件も処理していなかった |

判断時点の本番D1: `contact_messages` **0件** / `contact_requests` **1件** / `inquiries` 0件。
2026-07-23 の worker 構築以来、取り込みの実績はゼロ。

## なぜ作らないか

- 問い合わせは**通算1件**。運用は実質1人で、Gmail を見れば完結する規模
- 取り込みを足すと「Gmail と admin 画面のどちらが正か」という**運用の分岐**が生まれる
- 実装は最低6〜7工程（MX追加／Webhook登録／署名検証／本文取得API／Gmail転送／worker廃止／疎通）

## Cloudflare Email Routing は使えない（調査済み・再調査不要）

`email-worker/wrangler.jsonc` が前提にしていた「`inbox.locahun3d.com` で Email Routing」は**成立しない**。

1. Email Routing を有効化すると **MX・SPF・DKIM を root domain に追加する**仕様
   → https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/
   `locahun3d.com` の MX は Google Workspace なので、**有効化した瞬間に受信が全滅する**
2. 回避策の「サブドメインを別ゾーンとして登録」は **Enterprise プラン限定**
   → https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/

> **ルートドメインの MX（Google 5件）には絶対に触らないこと。** 触ると全社のメール受信が止まる。

## 将来やるなら: Resend Inbound

Resend が2025-11に受信機能を提供。**「ルートに既存MXがある場合はサブドメインを作ってそこにMXを置く」と公式が明記**しており、今回の構成がそのまま想定ケース。送信で既にResendを使っているのでベンダーは増えない。

- https://resend.com/docs/dashboard/receiving/introduction
- https://resend.com/features/inbound

```
お客様の返信 → contact@（Gmail・現状維持）
              → Gmailのフィルタで自動転送 → inbox.locahun3d.com（MXはResendのみ）
              → email.received Webhook → /api/inbound-email → D1 contact_messages
              → /admin/contact-requests がスレッド表示
```

**注意点**
- Webhook のペイロードは**メタデータのみ**。本文は `email_id` で受信APIを叩いて取得する（既存の `RESEND_API_KEY` で可）
- **受信の課金・上限は未確認**。着手前にダッシュボードで現行プランの可否を確認すること
- 有料で見合わないなら、DNSを触らない **Gmail API ポーリング**（cron で受信箱を読んで D1 へ）が代替

**残してあるもの**: `contact_messages` テーブル、`src/lib/contact-messages.ts`、管理画面のスレッド表示。
管理画面からの返信がこれらを使っているため。将来足すのは**入口だけ**でよい。

**削除したもの**: `email-worker/`（git履歴から復元可能）、Cloudflare Worker `locahun3d-email`。

## 同日ついでに入れたもの

`_dmarc.locahun3d.com` TXT `v=DMARC1; p=none; rua=mailto:contact@locahun3d.com`

SPF・DKIM は既にあったが DMARC が無く、Gmail/Yahoo の一括送信要件を満たしていなかった（営業リスト373件の送信前提）。`p=none` は監視のみで配送に影響しない。**1〜2週間 rua レポートを見て偽装が無いことを確認してから `p=quarantine` へ上げること。**
