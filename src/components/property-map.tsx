"use client";

import dynamic from "next/dynamic";

/**
 * サーバーComponent（物件詳細ページ）から使える地図。react-leaflet は window に
 * 依存するため ssr:false の dynamic import でクライアント専用に読み込む。
 */
const Inner = dynamic(() => import("./property-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full grid place-items-center bg-[#e9edf1] border border-line mono text-[10px] tracking-[0.2em] text-muted">
      MAP…
    </div>
  ),
});

export default function PropertyMap(props: {
  lat: number;
  lng: number;
  label?: string;
}) {
  return <Inner {...props} />;
}
