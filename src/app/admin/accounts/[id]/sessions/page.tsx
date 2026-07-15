import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/dal";
import { userRepo } from "@/lib/users";
import { listActiveSessions, deviceLimitForPlan } from "@/lib/device-limit";
import { revokeUserSessionAction } from "@/lib/admin-actions";
import { fmtDateTimeLocaleJST } from "@/lib/date-format";

export const metadata = { title: "ログイン端末" };

function fmtDate(ms: number) {
  return fmtDateTimeLocaleJST(ms);
}

export default async function AdminUserSessionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const user = await userRepo.get(id);
  if (!user) notFound();

  const limit = deviceLimitForPlan(user.plan);
  const sessions = await listActiveSessions(id).catch(() => []);
  const overLimit = limit !== null && sessions.length > limit;

  return (
    <div className="theme-online p-8">
      <div className="mb-6">
        <Link
          href="/admin/accounts"
          className="mono text-[10px] tracking-[0.2em] uppercase text-muted hover:text-accent transition"
        >
          ← アカウント一覧に戻る
        </Link>
        <div className="mono text-[10px] tracking-[0.32em] uppercase opacity-50 mt-3 mb-1">
          Active sessions
        </div>
        <h1 className="serif text-3xl">
          {user.name}
          <span className="mono text-[13px] text-muted ml-3">{user.email}</span>
        </h1>
        <p className="text-[13px] text-muted mt-2 leading-relaxed">
          プラン <span className="text-accent font-bold">{user.plan.toUpperCase()}</span>
          {limit !== null ? (
            <>
              {" "}の上限は <strong>{limit} 端末</strong>。現在のアクティブセッションは{" "}
              <strong>{sessions.length} 件</strong>
              {overLimit && (
                <span className="text-red-600 font-bold">
                  {" "}
                  — 上限超過（次回アクセス時に古い端末から自動失効します。今すぐ手動で失効させることもできます）
                </span>
              )}
              。
            </>
          ) : (
            <>（このプランは端末数の上限を設けていません）</>
          )}
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="border border-line rounded-md p-10 text-center text-muted text-[14px]">
          アクティブなセッションがありません。
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map((s, i) => (
            <div
              key={s.id}
              className={`border rounded-md p-4 flex flex-wrap items-center gap-3 ${
                limit !== null && i >= limit ? "border-red-300 bg-red-50" : "border-line"
              }`}
            >
              <div className="flex-1 min-w-[220px]">
                <div className="text-[14px] font-medium text-ink">
                  {s.browserName ?? "不明なブラウザ"}
                  {s.deviceType ? ` · ${s.deviceType}` : ""}
                  {s.isMobile ? " · モバイル" : ""}
                </div>
                <div className="mono text-[11px] text-muted mt-0.5">
                  {s.city || s.country ? `${s.city ?? ""} ${s.country ?? ""}`.trim() + " · " : ""}
                  最終アクティブ {fmtDate(s.lastActiveAt)} · 作成 {fmtDate(s.createdAt)}
                </div>
              </div>
              {limit !== null && i >= limit && (
                <span className="mono text-[10px] tracking-[0.16em] uppercase text-red-600 border border-red-300 px-2 py-0.5 rounded-sm">
                  上限超過分
                </span>
              )}
              <form action={revokeUserSessionAction}>
                <input type="hidden" name="userId" value={id} />
                <input type="hidden" name="sessionId" value={s.id} />
                <button className="text-[12px] border border-red-300 text-red-600 px-3 py-1.5 rounded-sm hover:bg-red-100 transition">
                  この端末をログアウト
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
