import Link from "next/link";
import type { PageBlock, Property } from "@/lib/schemas";
import ImageGallery from "@/components/image-gallery";
import ViewerGate from "@/components/viewer-gate";

/**
 * Renders a studio page composed of builder blocks. Shared by the public
 * detail page (server) and the admin builder's live preview (client) — it has
 * no hooks, so it works in either tree. Gallery/splat/specs blocks pull from
 * the property record; the rest carry their own content.
 */
export default function StudioPageBlocks({
  blocks,
  property,
  freeAccess = false,
  canViewRestricted = false,
}: {
  blocks: PageBlock[];
  property: Property;
  freeAccess?: boolean;
  canViewRestricted?: boolean;
}) {
  return (
    <div className="space-y-12">
      {blocks.map((b) => (
        <BlockView key={b.id} block={b} property={property} freeAccess={freeAccess} canViewRestricted={canViewRestricted} />
      ))}
    </div>
  );
}

function BlockView({
  block,
  property,
  freeAccess,
  canViewRestricted = false,
}: {
  block: PageBlock;
  property: Property;
  freeAccess: boolean;
  canViewRestricted?: boolean;
}) {
  switch (block.kind) {
    case "heading":
      return (
        <div className="chapter-rule !mb-0">
          {block.eyebrow && <span className="opacity-60">{block.eyebrow}</span>}
          <span>{block.text || "（見出し）"}</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>
      );

    case "text":
      return (
        <p className="text-[15px] leading-[1.95] text-muted whitespace-pre-line max-w-[72ch]">
          {block.body || "（本文）"}
        </p>
      );

    case "image":
      return (
        <figure>
          {block.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.src}
              alt={block.alt}
              className="w-full border border-line"
            />
          ) : (
            <div className="aspect-[16/9] border border-dashed border-line flex items-center justify-center mono text-[11px] text-muted">
              画像 URL 未設定
            </div>
          )}
          {block.caption && (
            <figcaption className="mono text-[10px] tracking-[0.18em] text-muted mt-2">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );

    case "gallery":
      return (
        <ImageGallery images={[property.cover, ...property.gallery]} />
      );

    case "splat":
      return (
        <div>
          <ViewerGate
            splatUrl={property.splatUrl}
            propertyId={property.id}
            tokenCost={property.tokenCost}
            freeAccess={freeAccess}
            splatItems={property.splatItems}
            canViewRestricted={canViewRestricted}
          />
          {block.caption && (
            <div className="mono text-[10px] tracking-[0.18em] text-muted mt-2">
              {block.caption}
            </div>
          )}
        </div>
      );

    case "specs":
      return (
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-6 border-y border-line py-6 text-[13px]">
          {[
            ["面積", `${property.floorAreaSqm} ㎡`],
            ["天井高", `${property.ceilingHeightM || "—"} m`],
            ["収容", `${property.capacity} 名`],
            ["自然光", property.hasNaturalLight ? "あり" : "なし"],
            ["駐車", property.parking ? "可" : "不可"],
            ["搬入口", property.loadingDock ? "大" : "通常"],
            ["電源", property.powerVoltage || "—"],
            ["スキャン", property.scannedAt || "—"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 mb-1">
                {k}
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      );

    case "cta":
      return (
        <div className="border border-line p-8 text-center">
          <Link
            href={block.href || "/pricing"}
            className="inline-block px-8 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
          >
            {block.label || "見積もり依頼"}
          </Link>
          {block.note && (
            <p className="text-[12px] text-muted mt-3 leading-[1.8]">
              {block.note}
            </p>
          )}
        </div>
      );

    case "divider":
      return <hr className="border-line" />;

    default:
      return null;
  }
}
