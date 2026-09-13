"use client";
import { useState } from "react";
import ZoomableImage from "./zoomable-image";
import styles from "./property-detail-view.module.css";

export default function PropertyPhotoGallery({ photos, en, scannedAt }: { photos: {src:string;alt:string;focus?:string}[]; en:boolean; scannedAt:string }) {
  const [selected, setSelected] = useState(0);
  const active = Math.min(selected, Math.max(0, photos.length - 1));
  const photo = photos[active];
  return <section data-property-photos className={styles.photos} aria-label={en ? "Property photos" : "物件写真"}>
    <div className={styles.photoToolbar}><span>{en ? "Photos" : "写真"}</span><a href="#walkthrough">3DGS</a><span>{photos.length ? active + 1 : 0} / {photos.length}</span></div>
    <div data-property-photo className={styles.photoMain}>{photo ? <ZoomableImage src={photo.src} alt={photo.alt} focus={photo.focus} className="w-full h-full object-cover" /> : <p>{en ? "No photos registered" : "写真は未登録です"}</p>}</div>
    {photo?.alt && <p className={styles.photoCaption}>{photo.alt}</p>}
    {photos.length > 1 && <div className={styles.thumbnails}>{photos.map((p,i) => <button key={p.src} type="button" aria-label={`${en ? "Photo" : "写真"} ${i+1}`} aria-pressed={active===i} onClick={()=>setSelected(i)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.src} alt={p.alt} loading="lazy" />
    </button>)}</div>}
    <div className={styles.photoStrip}><div><strong>{en ? "Explore the 3D scene" : "3Dシーンで空間を確認"}</strong><p>{en ? "Captured: " : "撮影日："}{scannedAt || (en ? "Not registered" : "未登録")}</p></div><a href="#walkthrough">{en ? "View 3DGS ↓" : "3DGSを見る ↓"}</a></div>
  </section>;
}
