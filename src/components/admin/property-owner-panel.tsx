"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getPropertyOwnershipAction,
  findUserByEmailAction,
  setPropertyOwnerAction,
  clearPropertyOwnerAction,
  addPropertyLinkAction,
  removePropertyLinkAction,
  type PropertyOwnershipInfo,
  type OwnerUserInfo,
} from "@/app/admin/properties/owner-actions";
import { ROLE_LABEL, type AccountRole } from "@/lib/account-schema";

function roleLabel(role: string): string {
  return ROLE_LABEL[role as AccountRole] ?? role;
}

/**
 * 物件⇄アカウントの紐付け設定（admin専用）。
 *
 * 当社がスキャンして掲載した物件を、後からスタジオのアカウントへ引き渡す運用が
 * ある。assertPropertyAccess（src/lib/dal.ts）は ownerId===user.id ||
 * linkedPropertyIds.includes(id) で編集権限を判定しており、データ構造は前からあるが
 * 設定 UI が無く DB 直接編集しかできなかった。このパネルでそれを操作する。
 */
export default function PropertyOwnerPanel({ propertyId }: { propertyId: string }) {
  const [info, setInfo] = useState<PropertyOwnershipInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [found, setFound] = useState<OwnerUserInfo | null>(null);

  const refresh = () => {
    getPropertyOwnershipAction(propertyId)
      .then((r) => {
        setInfo(r);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const search = () => {
    const target = email.trim();
    if (!target) return;
    setError(null);
    setSearching(true);
    findUserByEmailAction(target)
      .then((u) => {
        setFound(u);
        setSearched(true);
      })
      .finally(() => setSearching(false));
  };

  const makeOwner = (userId: string) => {
    setError(null);
    start(async () => {
      const r = await setPropertyOwnerAction(propertyId, userId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setFound(null);
      setSearched(false);
      setEmail("");
      refresh();
    });
  };

  const addLink = (userId: string) => {
    setError(null);
    start(async () => {
      const r = await addPropertyLinkAction(propertyId, userId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setFound(null);
      setSearched(false);
      setEmail("");
      refresh();
    });
  };

  const removeLink = (userId: string) => {
    setError(null);
    start(async () => {
      const r = await removePropertyLinkAction(propertyId, userId);
      if (!r.ok) setError(r.error);
      refresh();
    });
  };

  const clearOwner = () => {
    setError(null);
    start(async () => {
      const r = await clearPropertyOwnerAction(propertyId);
      if (!r.ok) setError(r.error);
      refresh();
    });
  };

  return (
    <div className="border border-neutral-300 bg-white px-4 py-3 rounded-md shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <span className="mono text-[11px] font-semibold tracking-[0.22em] uppercase text-neutral-500">
          アカウント紐付け（社内運用）
        </span>
      </div>

      {!loaded ? (
        <div className="text-[12px] text-neutral-500">読み込み中…</div>
      ) : (
        <>
          {/* 現在の所有者 */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[13px] text-neutral-800">
              <span className="text-neutral-500">所有者: </span>
              {info?.owner ? (
                <span className="font-medium">
                  {info.owner.email}
                  <span className="ml-1.5 text-[11px] text-neutral-500">
                    ({roleLabel(info.owner.role)})
                  </span>
                </span>
              ) : (
                <span className="text-neutral-400">未設定</span>
              )}
            </div>
            {info?.owner && (
              <button
                type="button"
                onClick={clearOwner}
                disabled={pending}
                className="text-[12px] font-medium border border-neutral-300 text-neutral-600 px-3 py-1 rounded-md hover:text-red-600 hover:border-red-300 transition disabled:opacity-50"
              >
                所有者をクリア
              </button>
            )}
          </div>

          {/* 紐付け済みアカウント一覧 */}
          <div>
            <div className="text-[11px] text-neutral-500 mb-1">
              紐付けアカウント（linkedPropertyIds）
            </div>
            {info && info.linkedUsers.length > 0 ? (
              <ul className="space-y-1">
                {info.linkedUsers.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between gap-3 text-[13px] border border-neutral-200 rounded-md px-2.5 py-1.5"
                  >
                    <span>
                      {u.email}
                      <span className="ml-1.5 text-[11px] text-neutral-500">
                        ({roleLabel(u.role)})
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLink(u.id)}
                      disabled={pending}
                      className="text-[11px] text-neutral-500 hover:text-red-600 transition shrink-0 disabled:opacity-50"
                    >
                      解除
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-[12px] text-neutral-400">紐付けなし</div>
            )}
          </div>

          {/* メール検索 → 所有者にする / 紐付けを追加 */}
          <div className="pt-2 border-t border-neutral-200">
            <div className="text-[11px] text-neutral-500 mb-1.5">
              メールアドレスで検索して所有者に設定、または紐付けを追加
            </div>
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setSearched(false);
                  setFound(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    search();
                  }
                }}
                placeholder="studio@example.com"
                className="flex-1 min-w-0 bg-white text-neutral-900 border border-neutral-300 rounded-md px-3 py-1.5 text-[13px] mono focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
              />
              <button
                type="button"
                onClick={search}
                disabled={searching || !email.trim()}
                className="shrink-0 text-[12px] font-medium border border-neutral-300 text-neutral-700 px-3 py-1.5 rounded-md hover:border-accent hover:text-accent transition disabled:opacity-50"
              >
                {searching ? "検索中…" : "検索"}
              </button>
            </div>

            {searched && (
              <div className="mt-2 text-[12.5px]">
                {found ? (
                  <div className="flex items-center justify-between gap-2 flex-wrap border border-neutral-200 rounded-md px-2.5 py-1.5">
                    <span>
                      {found.email}
                      <span className="ml-1.5 text-[11px] text-neutral-500">
                        ({roleLabel(found.role)})
                      </span>
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => makeOwner(found.id)}
                        disabled={pending}
                        className="text-[11px] font-medium border border-accent text-accent px-2.5 py-1 rounded-md hover:bg-accent hover:text-white transition disabled:opacity-50"
                      >
                        所有者にする
                      </button>
                      <button
                        type="button"
                        onClick={() => addLink(found.id)}
                        disabled={pending}
                        className="text-[11px] font-medium border border-neutral-300 text-neutral-700 px-2.5 py-1 rounded-md hover:border-accent hover:text-accent transition disabled:opacity-50"
                      >
                        紐付けを追加
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-neutral-400">
                    該当するユーザーが見つかりませんでした。
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <p className="text-[12px] text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}
