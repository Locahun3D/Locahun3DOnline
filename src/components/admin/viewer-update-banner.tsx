"use client";

import { useCallback, useEffect, useState } from "react";

interface VersionInfo {
  localVersion: string;
  remoteVersion: string;
  updateAvailable: boolean;
  notes: string;
}

export default function ViewerUpdateBanner() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const check = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/viewer-update");
      if (!res.ok) throw new Error(`${res.status}`);
      setInfo(await res.json());
    } catch {
      setError("バージョン確認に失敗しました");
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  const update = async () => {
    setUpdating(true);
    setError("");
    try {
      const res = await fetch("/api/admin/viewer-update", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "update failed");
      if (data.manualRequired) {
        setDone(
          `v${data.version} が利用可能です。GitHub pull + 再デプロイで反映されます。`,
        );
      } else {
        setDone(`v${data.version} に更新しました`);
        setInfo((prev) => prev ? { ...prev, localVersion: data.version, updateAvailable: false } : prev);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setUpdating(false);
    }
  };

  if (!info && !error) {
    return (
      <div className="border border-line bg-[#141414] px-4 py-2 mono text-[10px] opacity-60">
        ビューアーバージョン確認中…
      </div>
    );
  }

  return (
    <div className="border border-line bg-[#141414] px-4 py-3 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="mono text-[10px] tracking-[0.22em] uppercase opacity-60">
          Viewer
        </span>
        <span className="mono text-[11px]">
          v{info?.localVersion ?? "?"}
        </span>
        {info?.updateAvailable && (
          <>
            <span className="mono text-[10px] text-[#5ec8e8]">
              → v{info.remoteVersion} 利用可能
            </span>
            <button
              type="button"
              disabled={updating}
              onClick={update}
              className="mono text-[10px] tracking-[0.22em] uppercase border border-[#5ec8e8] text-[#5ec8e8] px-3 py-1 hover:bg-[#5ec8e8]/10 transition disabled:opacity-40"
            >
              {updating ? "更新中…" : "更新する"}
            </button>
          </>
        )}
        {!info?.updateAvailable && !done && (
          <span className="mono text-[10px] text-green-500">最新</span>
        )}
        {done && (
          <span className="mono text-[10px] text-green-500">{done}</span>
        )}
        <button
          type="button"
          onClick={check}
          className="mono text-[10px] opacity-40 hover:opacity-80 transition ml-auto"
        >
          再確認
        </button>
      </div>
      {info?.updateAvailable && info.notes && (
        <div className="text-[11px] text-muted leading-[1.7] pl-1">
          {info.notes}
        </div>
      )}
      {error && (
        <div className="text-[11px] text-red-400">{error}</div>
      )}
    </div>
  );
}
