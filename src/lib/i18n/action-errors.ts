/**
 * サーバーアクションが返す日本語のエラーメッセージを、英語版の画面で英語にする（2026-09-20 翻訳監査）。
 * アクション側（問い合わせ・持ち込みスキャン等）は管理通知やメールと同じファイルにあり、文言は日本語固定。
 * 画面側で対応表を引いて出し分ける。表に無い文言はそのまま返す（握りつぶさない）。
 * 数値入りの文言は正規表現で拾う。
 */
const EXACT: Record<string, string> = {
  "メールアドレスの形式が正しくありません": "Please enter a valid email address.",
  "メールアドレスを入力してください": "Please enter your email address.",
  "お問い合わせ内容を入力してください": "Please enter your message.",
  "ご担当者名を入力してください": "Please enter your name.",
  "お名前を入力してください": "Please enter your name.",
  "入力内容をご確認ください。": "Please check the form and try again.",
  "フォームの有効期限が切れました。ページを再読み込みのうえ再度お試しください。": "This form has expired. Please reload the page and try again.",
  "短時間に送信が集中しています。しばらく時間をおいて再度お試しください。": "Too many submissions in a short time. Please wait a moment and try again.",
  "送信に失敗しました。お手数ですが時間をおいて再度お試しください。": "Sending failed. Please try again in a little while.",
  "対象のスタジオが見つかりませんでした。": "We couldn't find that location.",
  "施設・場所名を入力してください": "Please enter the venue or place name.",
  "空間の説明・撮影範囲を入力してください": "Please describe the space and what you captured.",
  "使用した機材を入力してください": "Please enter the equipment you used.",
  "撮影年月は YYYY-MM 形式で入力してください": "Enter the capture month as YYYY-MM.",
  "サインインが必要です。ページを再読み込みしてください。": "Please sign in. Reload the page and try again.",
  "サインインが必要です。": "Please sign in.",
  "サインインが必要です": "Please sign in.",
  "同意事項へのチェックが必要です。": "Please tick every agreement box.",
  "サンプル画像を1枚以上添付してください。": "Please attach at least one sample image.",
  "添付できるのは画像（JPEG / PNG / WebP / GIF）のみです。": "Only images (JPEG / PNG / WebP / GIF) can be attached.",
  "画像の保存に失敗しました。時間をおいて再度お試しください。": "We couldn't save the images. Please try again in a little while.",
  "NDA への同意が必要です": "You need to agree to the NDA.",
  "制作会社（NDA）アカウントの登録には会社のメールアドレスが必要です。Gmail・Outlook・Yahooメール等の個人向けメールアドレスでは登録できません。":
    "A production (NDA) account needs a company email address. Personal addresses such as Gmail, Outlook or Yahoo Mail can't be used.",
  "表示名は1〜30文字で入力してください。": "Display names must be 1–30 characters.",
  "フォルダが指定されていません": "No board was specified.",
  "Studio以上のプランで共有できます": "Sharing is available on the Studio plan and above.",
  "対象のフォルダが見つかりませんでした": "We couldn't find that board.",
  // 購入API（/api/purchase, /api/purchase/cart）— カートとデータ販売パネルの alert に出る
  "ログインが必要です": "Please sign in.",
  "カートが空です": "Your cart is empty.",
  "3Dデータ利用規約への同意が必要です": "Please agree to the 3D data terms.",
  "購入可能な項目がありません（購入済み/販売停止の可能性）": "Nothing in the cart can be purchased (already purchased, or no longer on sale).",
  "撮影スタジオアカウントはデータ購入の対象外です": "Studio accounts can't purchase data.",
  "物件が見つかりません": "We couldn't find that location.",
  "このデータは販売されていません": "This data isn't for sale.",
  "このデータは現在販売を停止しています": "Sales of this data are currently paused.",
  "このデータはダウンロードファイルが未設定のため購入できません": "This data can't be purchased yet because its download file isn't ready.",
  "すでに購入済みです": "You've already purchased this.",
  "指定されたライセンス区分は選択できません": "That license type isn't available.",
};
const PATTERNS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^サンプル画像は最大 (\d+) 枚までです。$/, (m) => `You can attach up to ${m[1]} sample images.`],
  [/^画像1枚あたりのサイズ上限は (\d+)MB です。$/, (m) => `Each image can be up to ${m[1]} MB.`],
];

export function localizeActionError(message: string | undefined | null, en: boolean): string {
  const msg = message ?? "";
  if (!en || !msg) return msg;
  if (EXACT[msg]) return EXACT[msg];
  for (const [re, fn] of PATTERNS) {
    const m = re.exec(msg);
    if (m) return fn(m);
  }
  return msg;
}
