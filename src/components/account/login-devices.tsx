import { revokeMySessionAction } from "@/lib/auth-actions";
import type { ActiveDeviceSession } from "@/lib/device-limit";
import type { Locale } from "@/lib/i18n/dictionaries";

/**
 * マイページの「ログイン端末」セクション。会員が自分のログイン中の端末
 * (Clerkのアクティブセッション) を一覧し、不要な端末を個別にログアウト
 * させられる。現在使用中の端末には「この端末」バッジを付け、ログアウト
 * ボタンは出さない（誤って自分をサインアウトさせないため — 通常のログアウト
 * 導線は別にある）。有料プランは上限を併記し、超過分を明示する。
 *
 * 失効の所有権チェックは revokeMySessionAction 側で担保（本人のセッション
 * 一覧に無い sessionId は拒否）。
 */
function fmtDate(ms: number, en: boolean): string {
  try {
    return new Date(ms).toLocaleString(en ? "en-US" : "ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ms);
  }
}

export default function LoginDevices({
  sessions,
  currentSessionId,
  limit,
  locale,
}: {
  sessions: ActiveDeviceSession[];
  currentSessionId: string | null;
  limit: number | null;
  locale: Locale;
}) {
  const en = locale === "en";
  const overLimit = limit !== null && sessions.length > limit;

  return (
    <div className="bg-white border border-[#e2e7ec] p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="mono text-[10px] tracking-[0.24em] uppercase text-[#7b8794]">
          {en ? "Login devices" : "ログイン端末"}
        </div>
        {limit !== null && (
          <span
            className={`mono text-[11px] font-bold ${overLimit ? "text-red-600" : "text-[#1ea0c4]"}`}
          >
            {sessions.length} / {limit}
          </span>
        )}
      </div>
      <p className="text-[11.5px] text-[#7b8794] leading-relaxed mb-4">
        {limit !== null ? (
          en ? (
            <>
              Your plan allows up to <strong>{limit} devices</strong> signed in at once.
              When you exceed it, the oldest device is signed out automatically.
              You can also sign out any device here.
            </>
          ) : (
            <>
              ご利用中のプランは同時に <strong>{limit} 台</strong>までログインできます。
              超過すると最も古い端末が自動でログアウトされます。ここから手動で
              ログアウトすることもできます。
            </>
          )
        ) : en ? (
          "Devices currently signed in to your account. You can sign out any device here."
        ) : (
          "現在アカウントにログインしている端末です。ここから個別にログアウトできます。"
        )}
      </p>

      {sessions.length === 0 ? (
        <div className="border border-[#e2e7ec] rounded-md p-6 text-center text-[#7b8794] text-[13px]">
          {en ? "No active devices." : "アクティブな端末がありません。"}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {sessions.map((s, i) => {
            const isCurrent = currentSessionId != null && s.id === currentSessionId;
            const isExcess = limit !== null && i >= limit;
            const loc = [s.city, s.country].filter(Boolean).join(" ");
            return (
              <div
                key={s.id}
                className={`border rounded-md p-3.5 flex flex-wrap items-center gap-3 ${
                  isExcess ? "border-red-300 bg-red-50" : "border-[#e2e7ec]"
                }`}
              >
                <div className="flex-1 min-w-[200px]">
                  <div className="text-[13.5px] font-medium text-ink flex items-center gap-2 flex-wrap">
                    {s.browserName ?? (en ? "Unknown browser" : "不明なブラウザ")}
                    {s.deviceType ? ` · ${s.deviceType}` : ""}
                    {s.isMobile ? (en ? " · Mobile" : " · モバイル") : ""}
                    {isCurrent && (
                      <span className="mono text-[9px] tracking-[0.14em] uppercase bg-[#e6f6fb] text-[#1ea0c4] px-1.5 py-0.5 rounded-sm">
                        {en ? "This device" : "この端末"}
                      </span>
                    )}
                    {isExcess && (
                      <span className="mono text-[9px] tracking-[0.14em] uppercase text-red-600 border border-red-300 px-1.5 py-0.5 rounded-sm">
                        {en ? "Over limit" : "上限超過分"}
                      </span>
                    )}
                  </div>
                  <div className="mono text-[10.5px] text-[#7b8794] mt-1">
                    {loc ? `${loc} · ` : ""}
                    {en ? "Last active " : "最終アクティブ "}
                    {fmtDate(s.lastActiveAt, en)}
                  </div>
                </div>
                {isCurrent ? (
                  <span className="text-[11px] text-[#7b8794] mono">
                    {en ? "In use" : "使用中"}
                  </span>
                ) : (
                  <form action={revokeMySessionAction}>
                    <input type="hidden" name="sessionId" value={s.id} />
                    <button className="text-[12px] border border-red-300 text-red-600 px-3 py-1.5 rounded-sm hover:bg-red-100 transition whitespace-nowrap">
                      {en ? "Sign out" : "ログアウト"}
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
