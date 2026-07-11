"use client";

import { useCallback, useRef, useState } from "react";
import { uploadAsset } from "./upload-client";

export interface UploadedFile {
  url: string;
  size: number;
  contentType: string;
}

interface Props {
  propertyId: string;
  kind: "image" | "splat" | "zip" | "document";
  /** Accept attribute, e.g. "image/*" or ".splat,.ply,.ksplat" */
  accept: string;
  multiple?: boolean;
  /** Called once per successfully uploaded file. */
  onUploaded: (f: UploadedFile, originalName: string) => void;
  label?: string;
  hint?: string;
  /** Optional child content to render below the drop area (e.g. previews). */
  children?: React.ReactNode;
}

interface InFlight {
  id: string;
  name: string;
  size: number;
  progress: number;
  error?: string;
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function FileDropzone({
  // propertyId kept in Props for caller compatibility; assets self-bucket by id now.
  kind,
  accept,
  multiple = false,
  onUploaded,
  label,
  hint,
  children,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [inFlight, setInFlight] = useState<InFlight[]>([]);

  const uploadOne = useCallback(
    (file: File) => {
      const localId = `${file.name}-${file.size}-${Date.now()}`;
      setInFlight((prev) => [
        ...prev,
        { id: localId, name: file.name, size: file.size, progress: 0 },
      ]);
      uploadAsset(file, kind, {
        onProgress: (pct) =>
          setInFlight((prev) =>
            prev.map((f) => (f.id === localId ? { ...f, progress: pct } : f)),
          ),
      })
        .then((asset) => {
          onUploaded(
            { url: asset.url, size: asset.size, contentType: asset.contentType },
            file.name,
          );
          setInFlight((prev) => prev.filter((f) => f.id !== localId));
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          setInFlight((prev) =>
            prev.map((f) => (f.id === localId ? { ...f, error: msg } : f)),
          );
        });
    },
    [kind, onUploaded],
  );

  const handleFiles = useCallback(
    (list: FileList | File[]) => {
      const files = Array.from(list);
      const subset = multiple ? files : files.slice(0, 1);
      subset.forEach(uploadOne);
    },
    [multiple, uploadOne],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`relative border-2 border-dashed transition cursor-pointer p-6 text-center ${
          drag
            ? "border-accent bg-[#1a0f00]"
            : "border-line bg-[#222] hover:border-ink"
        }`}
      >
        <div className="mono text-[10px] tracking-[0.32em] uppercase opacity-60">
          {label ?? (kind === "image" ? "Drop images here" : "Drop splat file here")}
        </div>
        <div className="text-[13px] mt-2">
          ドラッグ＆ドロップ または{" "}
          <span className="text-accent underline">クリックして選択</span>
        </div>
        {hint && (
          <div className="mono text-[10px] text-muted mt-2">{hint}</div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          hidden
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = ""; // allow re-selecting same file
          }}
        />
      </div>

      {inFlight.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {inFlight.map((f) => (
            <div
              key={f.id}
              className="border border-line bg-[#222] px-3 py-2 mono text-[11px]"
            >
              <div className="flex justify-between items-baseline gap-3">
                <span className="truncate flex-1">{f.name}</span>
                <span className="opacity-60 shrink-0">{fmtBytes(f.size)}</span>
                <span
                  className={`shrink-0 ${
                    f.error
                      ? "text-accent"
                      : f.progress === 100
                        ? "text-accent"
                        : "opacity-60"
                  }`}
                >
                  {f.error ? "✕" : `${f.progress}%`}
                </span>
              </div>
              {!f.error && (
                <div className="mt-1 h-0.5 bg-line relative overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-accent transition-all"
                    style={{ width: `${f.progress}%` }}
                  />
                </div>
              )}
              {f.error && (
                <div className="mt-1 text-accent text-[10px]">{f.error}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
