"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitContactRequestAction, type ContactState } from "@/lib/contact-actions";
import type { ContactType } from "@/lib/contact-requests";
import { useLocale } from "@/components/locale-provider";

const HONEYPOT_FIELD = "website";
const RENDERED_AT_FIELD = "_rt";

// サーバー側 contact-actions.ts の上限と揃えること
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MB
const ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const inputClass =
  "w-full border border-line rounded-md px-3.5 py-2.5 text-[14px] focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition";

/** UA 文字列からの OS / ブラウザ推定（userAgentData が無いブラウザ向けフォールバック）。 */
function detectFromUA(ua: string): { os: string; browser: string } {
  let os = "";
  const ios = ua.match(/(?:iPhone|iPad|iPod).*OS (\d+)[_.](\d+)/);
  const android = ua.match(/Android ([\d.]+)/);
  if (ios) os = `iOS ${ios[1]}.${ios[2]}`;
  else if (android) os = `Android ${android[1]}`;
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "";
  const edge = ua.match(/Edg\/([\d.]+)/);
  const chrome = ua.match(/Chrome\/([\d.]+)/);
  const firefox = ua.match(/Firefox\/([\d.]+)/);
  if (edge) browser = `Edge ${edge[1]}`;
  else if (chrome) browser = `Chrome ${chrome[1]}`;
  else if (firefox) browser = `Firefox ${firefox[1]}`;
  else if (/Safari\//.test(ua)) {
    const v = ua.match(/Version\/([\d.]+)/);
    browser = `Safari${v ? " " + v[1] : ""}`;
  }
  return { os, browser };
}

/** WebGL から GPU 名を取得（3DGSビューアのバグ調査で最重要の情報）。 */
function detectGpu(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    let renderer = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    // 例: "ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 (0x...) Direct3D11 ...)" → GPU名だけ抜く
    const m = renderer.match(/ANGLE \([^,]+,\s*([^,(]+)/);
    if (m) renderer = m[1].trim();
    return renderer;
  } catch {
    return "";
  }
}

/**
 * ご利用環境の自動入力。OS（Windows 11/10 判別含む）・ブラウザのフルバージョン・
 * GPU・画面解像度・CPU コア数まで収集する。取得できない項目は黙って省く。
 */
async function gatherEnvironment(): Promise<string> {
  const ua = navigator.userAgent || "";
  let { os, browser } = detectFromUA(ua);

  // Chromium系: userAgentData の高エントロピー値で OS 版とフルバージョンを精密化
  try {
    const uad = (
      navigator as Navigator & {
        userAgentData?: {
          platform?: string;
          getHighEntropyValues(hints: string[]): Promise<{
            platformVersion?: string;
            fullVersionList?: Array<{ brand: string; version: string }>;
          }>;
        };
      }
    ).userAgentData;
    if (uad?.getHighEntropyValues) {
      const hi = await uad.getHighEntropyValues(["platformVersion", "fullVersionList"]);
      const platform = uad.platform || "";
      const pv = hi.platformVersion || "";
      if (platform === "Windows" && pv) {
        // platformVersion 13以上 = Windows 11（Chromium公式の判別方法）
        os = parseInt(pv.split(".")[0], 10) >= 13 ? "Windows 11" : "Windows 10";
      } else if (platform && pv) {
        os = `${platform} ${pv.split(".").slice(0, 2).join(".")}`;
      }
      const brands = (hi.fullVersionList ?? []).filter((b) => !/Not.?A.?Brand/i.test(b.brand));
      const primary =
        brands.find((b) => !/^Chromium$/i.test(b.brand)) ?? brands[0];
      if (primary) browser = `${primary.brand.replace("Google ", "").replace("Microsoft ", "")} ${primary.version}`;
    }
  } catch {
    /* userAgentData 未対応（Safari/Firefox）は UA 推定のまま */
  }

  const gpu = detectGpu();
  const screenInfo = `${screen.width}×${screen.height}${
    window.devicePixelRatio !== 1 ? ` @${window.devicePixelRatio}x` : ""
  }`;
  const cores = navigator.hardwareConcurrency
    ? `CPU ${navigator.hardwareConcurrency}コア`
    : "";

  return [os, browser, gpu && `GPU: ${gpu}`, `画面 ${screenInfo}`, cores]
    .filter(Boolean)
    .join(" / ")
    .slice(0, 200);
}

/**
 * /contact/[type] の各専用ページで使う共通フォーム。type ごとに項目を出し分ける
 * （デザイン案 Pattern 7 の承認済みフィールド構成をそのまま実装）。
 */
export default function ContactForm({ type }: { type: ContactType }) {
  const en = useLocale() === "en";
  const [state, formAction, pending] = useActionState<ContactState, FormData>(
    submitContactRequestAction,
    undefined,
  );
  const renderedAtRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const environmentRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const [attachError, setAttachError] = useState("");
  useEffect(() => {
    if (renderedAtRef.current) renderedAtRef.current.value = String(Date.now());
    if (type === "bug" && environmentRef.current && !environmentRef.current.value) {
      const el = environmentRef.current;
      gatherEnvironment().then((v) => {
        // 収集中にユーザーが手入力を始めていたら上書きしない
        if (el && !el.value) el.value = v;
      });
    }
  }, [type]);

  /** input の FileList を state と同期させる（削除・追加は DataTransfer で再構築）。 */
  const syncAttachments = (next: File[]) => {
    setAttachFiles(next);
    if (attachInputRef.current) {
      const dt = new DataTransfer();
      next.forEach((f) => dt.items.add(f));
      attachInputRef.current.files = dt.files;
    }
  };

  const onAttachChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAttachError("");
    const picked = [...(e.target.files ?? [])];
    const merged = [...attachFiles];
    for (const f of picked) {
      if (merged.some((x) => x.name === f.name && x.size === f.size)) continue;
      if (!ATTACHMENT_TYPES.includes(f.type)) {
        setAttachError(en ? "Only images (JPEG / PNG / WebP / GIF) can be attached." : "添付できるのは画像（JPEG / PNG / WebP / GIF）のみです。");
        continue;
      }
      if (f.size > MAX_ATTACHMENT_BYTES) {
        setAttachError(en ? `Each image must be under ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB.` : `画像1枚あたりのサイズ上限は ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB です。`);
        continue;
      }
      if (merged.length >= MAX_ATTACHMENTS) {
        setAttachError(en ? `You can attach up to ${MAX_ATTACHMENTS} images.` : `画像の添付は最大 ${MAX_ATTACHMENTS} 枚までです。`);
        break;
      }
      merged.push(f);
    }
    syncAttachments(merged);
  };

  if (state?.ok) {
    // フォームは匿名送信を許可しているため、メール未入力なら「返信を待つ」
    // 案内は出さない（送信済みDOMノードは検出後も値を保持しているため、
    // アンマウント後もref経由で参照できる）。
    const hasEmail = !!emailRef.current?.value.trim();
    return (
      <div className="bg-white border border-line px-8 py-11 text-center">
        <div className="text-accent text-3xl mb-3">✓</div>
        <h3 className="text-[16px] font-bold text-ink mb-2">
          {en ? "Your message has been sent" : "お問い合わせを送信しました"}
        </h3>
        <p className="text-[12.5px] text-muted leading-relaxed">
          {hasEmail ? (
            en ? (
              <>
                We will get back to you shortly.
                <br />
                Please look out for a reply at the email address you provided.
              </>
            ) : (
              <>
                担当者より折り返しご連絡いたします。
                <br />
                ご記入のメールアドレス宛の返信をお待ちください。
              </>
            )
          ) : en ? (
            <>
              We will review your message.
              <br />
              No contact details were provided — if you need a reply, please include an email address.
            </>
          ) : (
            <>
              内容を確認いたします。
              <br />
              連絡先が未記入のため、返信が必要な場合はメールアドレスもご記入ください。
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="bg-white border border-line px-7 py-8 sm:px-8">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name={RENDERED_AT_FIELD} ref={renderedAtRef} defaultValue="" />
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Website
          <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <div className="space-y-5">
        {type === "bug" && (
          <>
            <Field en={en} label={en ? "URL of the affected page" : "発生したページのURL"} required>
              <input name="url" type="url" placeholder="https://locahun3d.com/properties/..." className={inputClass} />
            </Field>
            <Field en={en} label={en ? "Symptoms & steps to reproduce" : "症状・再現手順"} required>
              <textarea
                name="message"
                rows={4}
                required
                placeholder={en
                  ? "e.g. The 3D viewer goes black when opened from a property page.\nSteps: 1. Open a property from the catalog 2. Press \"View in 3D\""
                  : "例: 物件詳細で3Dビューアーを開くと画面が真っ暗になります。\n手順: 1. 物件一覧から〇〇を開く 2.「3Dで見る」を押す"}
                className={`${inputClass} leading-relaxed resize-y`}
              />
            </Field>
            <Field en={en} label={en ? "Your environment" : "ご利用環境"} optional note={en ? "auto-filled, editable" : "自動入力・修正可"}>
              <input
                name="environment"
                type="text"
                placeholder={en ? "e.g. Windows 11 / Chrome 138 / GPU: …" : "例: Windows 11 / Chrome 138 / GPU: …"}
                ref={environmentRef}
                className={inputClass}
              />
            </Field>
            <Field en={en} label={en ? "Attach screenshots" : "スクリーンショット添付"} optional note={en ? `up to ${MAX_ATTACHMENTS} images, ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB each` : `最大${MAX_ATTACHMENTS}枚・各${MAX_ATTACHMENT_BYTES / 1024 / 1024}MBまで`}>
              <input
                name="attachments"
                type="file"
                accept={ATTACHMENT_TYPES.join(",")}
                multiple
                ref={attachInputRef}
                onChange={onAttachChange}
                className="block w-full text-[13px] text-muted file:mr-3 file:border file:border-line file:rounded-md file:bg-white file:px-3.5 file:py-2 file:text-[12.5px] file:text-ink file:cursor-pointer hover:file:border-accent file:transition"
              />
              {attachError && (
                <p className="mt-1.5 text-[12px] text-red-600">{attachError}</p>
              )}
              {attachFiles.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {attachFiles.map((f, i) => (
                    <div
                      key={`${f.name}-${f.size}`}
                      className="relative border border-line rounded-md overflow-hidden"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={URL.createObjectURL(f)}
                        alt={f.name}
                        className="h-20 w-auto"
                        onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                      />
                      <button
                        type="button"
                        aria-label={en ? `Remove ${f.name}` : `${f.name} を削除`}
                        onClick={() => syncAttachments(attachFiles.filter((_, j) => j !== i))}
                        className="absolute top-1 right-1 w-5 h-5 leading-none rounded-full bg-black/60 text-white text-[11px] hover:bg-black/80 transition"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Field>
          </>
        )}

        {type === "request" && (
          <>
            <Field en={en} label={en ? "Preferred area / property type" : "希望エリアや物件"} required>
              <input name="area" type="text" placeholder={en ? "e.g. around Setagaya, Tokyo / warehouse, traditional house" : "例: 東京都 世田谷区 周辺 / 倉庫・古民家など"} className={inputClass} />
            </Field>
            <Field en={en} label={en ? "Intended use & requirements" : "撮影の用途・ほしい条件"} required>
              <textarea
                name="message"
                rows={4}
                required
                placeholder={en ? "e.g. Looking for an abandoned-factory-style location for a music video. Ideally 4m+ ceilings with a load-in route." : "例: MV撮影で使える廃工場系のロケ地を探しています。天井高4m以上・搬入経路があると理想です。"}
                className={`${inputClass} leading-relaxed resize-y`}
              />
            </Field>
          </>
        )}

        {type === "listing" && (
          <>
            <div className="grid md:grid-cols-2 gap-4">
              <Field en={en} label={en ? "Company / owner name" : "会社名・オーナー名"} required>
                <input name="company" type="text" placeholder={en ? "Acme Inc." : "株式会社〇〇"} className={inputClass} />
              </Field>
              <Field en={en} label={en ? "Property name" : "物件名"} required>
                <input name="propertyName" type="text" placeholder={en ? "e.g. Studio XYZ" : "例: 〇〇スタジオ"} className={inputClass} />
              </Field>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Field en={en} label={en ? "Address" : "所在地"} required>
                <input name="address" type="text" placeholder={en ? "e.g. Shibuya, Tokyo…" : "例: 東京都渋谷区…"} className={inputClass} />
              </Field>
              <Field en={en} label={en ? "Phone" : "電話番号"} optional>
                <input name="phone" type="tel" placeholder="03-0000-0000" className={inputClass} />
              </Field>
            </div>
            <Field en={en} label={en ? "Preferred listing / scan dates" : "掲載・スキャン希望日について"} required>
              <textarea
                name="message"
                rows={4}
                required
                placeholder={en ? "e.g. We'd like to be listed ASAP. Weekday mornings after the 10th work best for a scan visit." : "例: できるだけ早く掲載したい。スキャンは○月○日以降の平日午前が対応しやすいです。"}
                className={`${inputClass} leading-relaxed resize-y`}
              />
            </Field>
          </>
        )}

        {type === "general" && (
          <Field en={en} label={en ? "Your message" : "ご相談内容"} required>
            <textarea
              name="message"
              rows={5}
              required
              placeholder={en ? "Pricing plans, corporate contracts, partnerships — anything is welcome." : "料金プラン・法人契約・提携のご相談など、なんでもどうぞ。"}
              className={`${inputClass} leading-relaxed resize-y`}
            />
          </Field>
        )}

        <div className="border-t border-line pt-5 space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <Field
              en={en}
              label={type === "listing" ? (en ? "Contact person" : "ご担当者名") : en ? "Name" : "お名前"}
              required={type === "listing"}
              optional={type !== "listing"}
            >
              <input
                name="name"
                type="text"
                placeholder={en ? "Jane Smith" : "山田 太郎"}
                required={type === "listing"}
                className={inputClass}
              />
            </Field>
            <Field en={en} label={en ? "Email" : "メールアドレス"} required={type === "listing"} optional={type !== "listing"}>
              <input
                name="email"
                type="email"
                placeholder="info@example.com"
                required={type === "listing"}
                ref={emailRef}
                className={inputClass}
              />
            </Field>
          </div>

          {state?.ok === false && (
            <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3.5 py-2.5">
              {state.error}
            </p>
          )}

          <div className="text-center">
            <button
              type="submit"
              disabled={pending}
              className="w-full sm:w-auto bg-accent text-white text-[15px] font-bold px-8 py-3.5 rounded-md hover:bg-accent/85 transition shadow-sm disabled:opacity-50"
            >
              {pending
                ? en ? "Sending…" : "送信中…"
                : type === "listing"
                  ? en ? "Request a listing →" : "掲載を依頼する →"
                  : en ? "Send →" : "送信する →"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  optional,
  note,
  en,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  note?: string;
  en?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-ink/70 mb-1.5 block">
        {label}
        {required && <span className="text-red-500 text-[11px] ml-1">{en ? "required" : "必須"}</span>}
        {optional && <span className="text-muted text-[11px] ml-1">{en ? "optional" : "任意"}</span>}
        {note && <span className="text-muted text-[11px] ml-1.5">（{note}）</span>}
      </span>
      {children}
    </label>
  );
}
