"use client";
import { useState } from "react";
import ZoomableImage from "./zoomable-image";
import styles from "./property-detail-view.module.css";

export function propertyPhotoCaption(alt: string, title: string, src = "") {
  const text = alt.trim();
  let filename = false;
  try {
    const basename = decodeURIComponent(new URL(src, "https://local.invalid").pathname.split("/").pop() || "");
    const extension = /\.(?:jpe?g|png|webp|avif)$/i;
    if (extension.test(basename)) {
      const stem = basename.replace(extension, "");
      // uploads.ts prepends a 6-character ID; admin asset presigning uses 10.
      // Only strip a prefix from the actual source, never infer filenames from caption punctuation.
      const originalName = basename.replace(/^(?:[\w-]{6}|[\w-]{10})-/, "");
      filename = [basename, stem, originalName, originalName.replace(extension, "")].includes(text);
    }
  } catch { /* Unreadable source: preserve the authored caption. */ }
  return !text || filename || text === title.trim() ? title.trim() : text;
}

export default function PropertyPhotoGallery({ photos, en, scannedAt, propertyTitle }: { photos: {src:string;alt:string;focus?:string}[]; en:boolean; scannedAt:string; propertyTitle:string }) {
  const [selected, setSelected] = useState(0);
  const active = Math.min(selected, Math.max(0, photos.length - 1));
  const photo = photos[active];
  return <section data-property-photos className={styles.photos} aria-label={en ? "Property photos" : "物件写真"}>
    <div className={styles.photoToolbar}><span>{en ? "Photos" : "写真"}</span><a href="#walkthrough">3DGS</a><span>{photos.length ? active + 1 : 0} / {photos.length}</span></div>
    <div data-property-photo className={styles.photoMain}>{photo ? <ZoomableImage src={photo.src} alt={photo.alt} focus={photo.focus} className="w-full h-full object-cover" /> : <p>{en ? "No photos registered" : "写真は未登録です"}</p>}</div>
    {photo && <p className={styles.photoCaption}>{propertyPhotoCaption(photo.alt, propertyTitle, photo.src)}</p>}
    {photos.length > 1 && <div className={styles.thumbnails}>{photos.map((p,i) => <button key={p.src} type="button" aria-label={`${en ? "Photo" : "写真"} ${i+1}`} aria-pressed={active===i} onClick={()=>setSelected(i)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.src} alt={p.alt} loading="lazy" />
    </button>)}</div>}
    <div className={styles.photoStrip}><div><strong>{en ? "Explore the 3D scene" : "3Dシーンで空間を確認"}</strong><p>{en ? "Captured: " : "撮影日："}{scannedAt || (en ? "Not registered" : "未登録")}</p></div><a href="#walkthrough">{en ? "View 3DGS ↓" : "3DGSを見る ↓"}</a></div>
  </section>;
}
