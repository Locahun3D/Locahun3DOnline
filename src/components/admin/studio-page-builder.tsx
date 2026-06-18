"use client";

import { useState } from "react";
import { nanoid } from "nanoid";
import Link from "next/link";
import {
  PAGE_BLOCK_KINDS,
  PAGE_BLOCK_LABEL,
  type PageBlock,
  type PageBlockKind,
  type Property,
  type Asset,
} from "@/lib/schemas";
import { saveStudioPageAction } from "@/app/admin/_actions";
import StudioPageBlocks from "@/components/studio/studio-page-blocks";
import AssetPickerModal from "./asset-picker-modal";

const FIELD =
  "w-full bg-bg border border-line px-3 py-2 text-[13px] text-ink placeholder:text-muted focus:border-accent focus:outline-none transition";
const SUBLABEL = "mono text-[9px] tracking-[0.22em] uppercase text-muted mb-1 block";

function makeBlock(kind: PageBlockKind): PageBlock {
  const id = nanoid(6);
  switch (kind) {
    case "heading":
      return { id, kind, eyebrow: "", text: "" };
    case "text":
      return { id, kind, body: "" };
    case "image":
      return { id, kind, src: "", alt: "", caption: "" };
    case "splat":
      return { id, kind, caption: "" };
    case "cta":
      return { id, kind, label: "見積もり依頼", href: "/pricing", note: "" };
    case "gallery":
    case "specs":
    case "divider":
      return { id, kind };
  }
}

export default function StudioPageBuilder({ property }: { property: Property }) {
  const [blocks, setBlocks] = useState<PageBlock[]>(property.pageBlocks ?? []);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function add(kind: PageBlockKind) {
    setBlocks((bs) => [...bs, makeBlock(kind)]);
    setSavedAt(null);
  }
  function patch(id: string, partial: Record<string, unknown>) {
    setBlocks((bs) =>
      bs.map((b) => (b.id === id ? ({ ...b, ...partial } as PageBlock) : b)),
    );
    setSavedAt(null);
  }
  function remove(id: string) {
    setBlocks((bs) => bs.filter((b) => b.id !== id));
    setSavedAt(null);
  }
  function move(id: string, dir: -1 | 1) {
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= bs.length) return bs;
      const next = [...bs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setSavedAt(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await saveStudioPageAction(property.id, blocks);
      if (res.ok) setSavedAt(new Date().toLocaleTimeString("ja-JP"));
      else setError("保存に失敗しました（物件が見つかりません）");
    } catch {
      setError("保存中にエラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_1fr] gap-8">
      {/* ── Editor column ── */}
      <div>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="serif text-xl">ページ構成</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPreview((p) => !p)}
              className="mono text-[10px] tracking-[0.2em] uppercase border border-line px-3 py-1.5 hover:border-accent hover:text-accent transition lg:hidden"
            >
              {preview ? "編集に戻る" : "プレビュー"}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="mono text-[10px] tracking-[0.2em] uppercase border border-accent text-accent px-4 py-1.5 hover:bg-accent hover:text-bg transition disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>

        {savedAt && (
          <p className="text-[11px] text-green-400 mb-3">✓ {savedAt} に保存しました</p>
        )}
        {error && <p className="text-[11px] text-red-400 mb-3">{error}</p>}

        <p className="text-[11px] text-muted leading-[1.7] mb-4">
          ブロックを追加して並べ替え、公開ページ（/properties/{property.id}）の本文を組み立てます。
          ブロックが 0 件のときは従来の標準レイアウトで表示されます。
        </p>

        {/* Add block menu */}
        <div className="flex flex-wrap gap-2 mb-6">
          {PAGE_BLOCK_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => add(k)}
              className="mono text-[10px] tracking-[0.16em] border border-line px-2.5 py-1.5 text-muted hover:border-accent hover:text-accent transition"
            >
              ＋ {PAGE_BLOCK_LABEL[k]}
            </button>
          ))}
        </div>

        {blocks.length === 0 ? (
          <div className="border border-dashed border-line p-8 text-center text-[12px] text-muted">
            ブロックがありません。上のボタンから追加してください。
          </div>
        ) : (
          <ol className="space-y-3">
            {blocks.map((b, i) => (
              <li key={b.id} className="border border-line bg-[#1c1c1c]">
                <div className="flex items-center justify-between px-3 py-2 border-b border-line bg-[#222]">
                  <span className="mono text-[10px] tracking-[0.2em] uppercase text-accent">
                    {i + 1}. {PAGE_BLOCK_LABEL[b.kind]}
                  </span>
                  <div className="flex items-center gap-1">
                    <IconBtn label="上へ" onClick={() => move(b.id, -1)} disabled={i === 0}>
                      ↑
                    </IconBtn>
                    <IconBtn
                      label="下へ"
                      onClick={() => move(b.id, 1)}
                      disabled={i === blocks.length - 1}
                    >
                      ↓
                    </IconBtn>
                    <IconBtn label="削除" onClick={() => remove(b.id)} danger>
                      ✕
                    </IconBtn>
                  </div>
                </div>
                <div className="p-3">
                  <BlockFields block={b} patch={patch} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* ── Preview column ── */}
      <div className={preview ? "" : "hidden lg:block"}>
        <div className="mono text-[10px] tracking-[0.2em] uppercase text-muted mb-4">
          ● ライブプレビュー
        </div>
        <div className="border border-line bg-bg p-6">
          {blocks.length === 0 ? (
            <p className="text-[12px] text-muted">
              ブロックを追加するとここに表示されます。
            </p>
          ) : (
            <StudioPageBlocks blocks={blocks} property={property} />
          )}
        </div>
        <Link
          href={`/properties/${property.id}`}
          target="_blank"
          className="mt-3 inline-block mono text-[10px] tracking-[0.2em] uppercase text-accent hover:underline"
        >
          実際の公開ページを開く ↗
        </Link>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
  danger,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`w-6 h-6 flex items-center justify-center text-[12px] border border-line transition disabled:opacity-30 ${
        danger ? "hover:border-red-400 hover:text-red-400" : "hover:border-accent hover:text-accent"
      }`}
    >
      {children}
    </button>
  );
}

function BlockFields({
  block,
  patch,
}: {
  block: PageBlock;
  patch: (id: string, partial: Record<string, unknown>) => void;
}) {
  const [pickOpen, setPickOpen] = useState(false);
  switch (block.kind) {
    case "heading":
      return (
        <div className="space-y-2">
          <div>
            <span className={SUBLABEL}>エイブロウ（小見出し・任意）</span>
            <input
              className={FIELD}
              value={block.eyebrow}
              placeholder="3DGS"
              onChange={(e) => patch(block.id, { eyebrow: e.target.value })}
            />
          </div>
          <div>
            <span className={SUBLABEL}>見出し</span>
            <input
              className={FIELD}
              value={block.text}
              placeholder="Virtual Walkthrough"
              onChange={(e) => patch(block.id, { text: e.target.value })}
            />
          </div>
        </div>
      );
    case "text":
      return (
        <div>
          <span className={SUBLABEL}>本文</span>
          <textarea
            className={`${FIELD} min-h-[100px] resize-y`}
            value={block.body}
            placeholder="このスタジオの紹介文…"
            onChange={(e) => patch(block.id, { body: e.target.value })}
          />
        </div>
      );
    case "image":
      return (
        <div className="space-y-2">
          <div>
            <span className={SUBLABEL}>画像 URL</span>
            <div className="flex gap-2">
              <input
                className={FIELD}
                value={block.src}
                placeholder="https://… または /uploads/…"
                onChange={(e) => patch(block.id, { src: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setPickOpen(true)}
                className="shrink-0 mono text-[10px] tracking-[0.18em] uppercase border border-line px-3 hover:border-accent hover:text-accent transition"
              >
                ライブラリ
              </button>
            </div>
            {block.src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={block.src}
                alt=""
                className="mt-2 max-h-32 border border-line object-contain"
              />
            )}
            <AssetPickerModal
              kind="image"
              open={pickOpen}
              onClose={() => setPickOpen(false)}
              onPick={(a: Asset) =>
                patch(block.id, { src: a.url, alt: block.alt || a.label })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className={SUBLABEL}>代替テキスト</span>
              <input
                className={FIELD}
                value={block.alt}
                onChange={(e) => patch(block.id, { alt: e.target.value })}
              />
            </div>
            <div>
              <span className={SUBLABEL}>キャプション（任意）</span>
              <input
                className={FIELD}
                value={block.caption}
                onChange={(e) => patch(block.id, { caption: e.target.value })}
              />
            </div>
          </div>
        </div>
      );
    case "splat":
      return (
        <div>
          <span className={SUBLABEL}>キャプション（任意）</span>
          <input
            className={FIELD}
            value={block.caption}
            placeholder="物件の splatUrl を使って 3DGS ビューアーを表示します"
            onChange={(e) => patch(block.id, { caption: e.target.value })}
          />
        </div>
      );
    case "cta":
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className={SUBLABEL}>ボタン文言</span>
              <input
                className={FIELD}
                value={block.label}
                onChange={(e) => patch(block.id, { label: e.target.value })}
              />
            </div>
            <div>
              <span className={SUBLABEL}>リンク先</span>
              <input
                className={FIELD}
                value={block.href}
                onChange={(e) => patch(block.id, { href: e.target.value })}
              />
            </div>
          </div>
          <div>
            <span className={SUBLABEL}>補足（任意）</span>
            <input
              className={FIELD}
              value={block.note}
              onChange={(e) => patch(block.id, { note: e.target.value })}
            />
          </div>
        </div>
      );
    case "gallery":
      return (
        <p className="text-[11px] text-muted">
          物件のカバー＋ギャラリー写真を表示します（写真は基本エディタで管理）。
        </p>
      );
    case "specs":
      return (
        <p className="text-[11px] text-muted">
          面積・天井高・収容・電源などのスペック表を表示します（値は基本エディタで管理）。
        </p>
      );
    case "divider":
      return <p className="text-[11px] text-muted">区切り線を表示します。</p>;
    default:
      return null;
  }
}
