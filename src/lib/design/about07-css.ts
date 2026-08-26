/**
 * /about（07案）で確立した白青デザインのスコープ済み生CSS。
 * トップ（/）もこの言語で組むため、ここへ切り出して両ページで共有する。
 * セレクタは .about07 配下。値は 07 のものを一切変えない（経緯は /about/page.tsx の冒頭コメント）。
 */
export const ABOUT07_CSS = `
/* ⚠ ここで html/body を白にしてはいけない（2026-08-14 実害）。
   scrollbar-gutter: stable both-edges が左右 15px を予約しており、
   ヘッダーもその内側（left:15 / 幅1410）に置かれる。html を白にすると
   **ヘッダーの左隣 15px だけが白く抜けて**、ヘッダーが欠けて見える。
   他のライトページ（/pricing 等）も html は黒のままで、本文と
   ヘッダーが同じ 15px の内側に揃っている。/about もそれに合わせる。 */
.about07{
  /* 文字・線の色はサイトのトークンに統一（2026-08-14。07独自の灰は使わない） */
  --ink:var(--color-ink);
  --muted:var(--color-muted);
  /* 青のトーンだけサイトのアクセントに合わせる（2026-08-14）。
     07 の汎用青 #155eef / 紺 #0d2f63 / シアン #0891b2 は使わない。 */
  --blue:var(--color-accent);
  --navy:color-mix(in srgb, var(--color-accent) 55%, black);
  --cyan:var(--color-accent);
  --line:var(--color-line);
  --soft:#f7fafc;
  --green:var(--color-accent); /* ✓と役割ドットも07の緑をやめアクセントに統一 */
  --radius:8px;
  /* ⚠ 07と1:1に見せるため zoom を打ち消していたが、そうすると文字だけ
     他ページより大きく見える。サイト共通の zoom に乗せて倍率を揃える。 */
  margin:0;
  color:var(--ink);
  background:#fff;
  /* 書体は他ページと同じ（globals.css の --font-sans = Noto Sans JP）。 */
  font-family:var(--font-sans);
  line-height:1.8;
  font-weight:400;
  letter-spacing:normal;
  word-break:normal;
  overflow-wrap:normal;
  line-break:auto;
  text-wrap:wrap;
  -webkit-font-smoothing:auto;
}
.about07 *{ box-sizing:border-box; }
.about07 a{ color:inherit; text-decoration:none; }
.about07 img{ display:block; max-width:100%; }
/* Tailwind preflight で潰れる UA 既定（見出しの bold）を 07 と同じ 700 に戻す */
.about07 h1,.about07 h2,.about07 h3{ font-weight:700; }
/* ⚠ コンテンツ幅は他ページと揃える（2026-08-14）。07 は 1160px 固定だったが、
   サイトの他ページは globals.css の @utility frame（padding-inline を
   max(clamp(1rem,4vw,48px), (100vw - --container-frame)/2) で取る方式）を使っており、
   /about だけ本文が 240px ほど狭く、ページを移動すると幅が変わって見えていた。
   frame と同じ式にして、どのページでも本文の左右が一致するようにする。 */
.about07 .wrap{
  width:100%;
  margin:0;
  padding-inline:max(clamp(1rem, 4vw, 48px), calc((100vw - var(--container-frame, 1440px)) / 2));
}
.about07 .hero{
  padding:70px 0 78px;
  background:linear-gradient(180deg, #fff, #f5faff);
}
.about07 .center{
  text-align:center;
  max-width:850px;
  margin:0 auto 34px;
}
.about07 .eyebrow{
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding:6px 10px;
  border-radius:999px;
  border:1px solid color-mix(in srgb, var(--color-accent) 32%, white);
  background:color-mix(in srgb, var(--color-accent) 10%, white);
  color:var(--blue);
  font-size:13px;
  font-weight:700;
  line-height:1.4;
}
.about07 h1{
  margin:18px 0 14px;
  font-size:clamp(1.55rem, 4.5vw, 3.6rem); /* 他ページ h1 と同値 */
  line-height:1.3; /* 他ページ h1 と同値 */
  text-wrap:balance;
  letter-spacing:0;
}
.about07 .lead{
  margin:0 auto;
  color:var(--muted);
  font-size:14px; /* 他ページのリード文と同値 */
  line-height:1.85;
  max-width:760px;
}
.about07 .segments{
  display:grid;
  grid-template-columns:repeat(3, 1fr);
  gap:20px;
  margin-top:38px;
}
.about07 .segment{
  border:1px solid var(--line);
  border-radius:8px;
  background:#fff;
  overflow:hidden;
  text-align:left;
  box-shadow:0 20px 54px rgba(15,23,42,.10);
  display:flex;
  flex-direction:column;
}
.about07 .segment img{
  width:100%;
  aspect-ratio:16 / 9;
  object-fit:cover;
  border-bottom:1px solid var(--line);
}
.about07 .segment-body{
  padding:28px;
  display:flex;
  flex-direction:column;
  flex:1;
}
.about07 .role{
  /* 他ページのラベル様式（mono text-[10px] tracking-[0.28em] uppercase）に統一 */
  display:inline-flex;
  align-items:center;
  gap:8px;
  color:var(--blue);
  font-family:"JetBrains Mono", var(--font-sans), monospace;
  font-size:10px;
  letter-spacing:0.28em;
  text-transform:uppercase;
  font-weight:500;
  margin-bottom:10px;
}
.about07 .role-dot{
  width:8px;
  height:8px;
  border-radius:999px;
  background:var(--green);
}
.about07 .segment h2{
  margin:0 0 10px;
  font-size:clamp(1.15rem, 2vw, 1.44rem); /* 他ページ h2 と同値(23px) */
  line-height:1.18;
  text-wrap:balance;
  letter-spacing:0;
}
.about07 .segment p{
  margin:0;
  color:var(--muted);
  font-size:13px; /* 他ページの本文と同水準 */
  line-height:1.85;
}
.about07 .segment ul{
  margin:18px 0 0;
  padding:0;
  list-style:none;
  display:grid;
  gap:12px;
  color:var(--color-ink);
  font-size:13px; /* 他ページの本文と同水準 */
  align-content:start;
  flex:1;
}
.about07 .segment li{
  display:flex;
  gap:9px;
}
.about07 .check{
  color:var(--green);
  font-weight:900;
}
.about07 .segment-actions{
  display:flex;
  flex-wrap:wrap;
  gap:12px;
  margin-top:26px;
}
.about07 .btn{
  /* 他ページのボタン様式に統一（2026-08-14。/pricing の実測:
     角なし・JetBrains Mono 11px・uppercase・tracking 0.22em・weight 500） */
  min-height:46px;
  padding:12px 16px;
  border-radius:0;
  border:1px solid var(--line);
  display:inline-flex;
  align-items:center;
  justify-content:center;
  font-family:"JetBrains Mono", var(--font-sans), monospace;
  font-size:11px;
  letter-spacing:0.22em;
  text-transform:uppercase;
  font-weight:500;
  line-height:1.2;
  transition:opacity .2s, border-color .2s, color .2s;
}
.about07 .btn.primary:hover{ opacity:.9; }
.about07 .btn.secondary:hover{ border-color:var(--blue); color:var(--blue); }
.about07 .btn.primary{
  color:#fff;
  background:var(--blue);
  border-color:var(--blue);
}
.about07 .btn.secondary{
  background:#fff;
  color:var(--navy);
}
.about07 section{
  padding:80px 0;
}
.about07 .section-head{
  display:grid;
  grid-template-columns:.9fr 1.1fr;
  gap:38px;
  margin-bottom:32px;
  align-items:start;
}
.about07 h2.section-title{
  margin:0;
  font-size:clamp(1.2rem, 2.2vw, 1.7rem); /* 他ページ h2 と同水準 */
  line-height:1.18;
  text-wrap:balance;
  letter-spacing:0;
}
.about07 .section-head p{
  margin:0;
  color:var(--muted);
}
.about07 .section-head p a{
  color:var(--blue);
  font-weight:800;
}
/* 見出しだけの帯（07 の .section-head は2カラム前提なので1カラムに落とす） */
.about07 .section-head.solo{
  grid-template-columns:1fr;
}
.about07 .product{
  display:grid;
  grid-template-columns:1.1fr .9fr;
  gap:24px;
  align-items:stretch;
}
.about07 .screen{
  border:1px solid #cbd9e9;
  border-radius:8px;
  background:#fff;
  padding:10px;
  box-shadow:0 22px 58px rgba(15,23,42,.11);
}
.about07 .screen img{
  width:100%;
  height:100%;
  min-height:360px;
  object-fit:cover;
  border-radius:6px;
}
.about07 .feature-list{
  display:grid;
  gap:16px;
  align-content:start;
}
.about07 .feature{
  border:1px solid var(--line);
  border-radius:8px;
  background:#fff;
  padding:24px;
}
.about07 .feature h3{
  margin:0 0 7px;
  font-size:18px;
  line-height:1.35;
  text-wrap:balance;
}
.about07 .feature p{
  margin:0;
  color:var(--muted);
  font-size:13px; /* 他ページの本文と同水準 */
  line-height:1.85;
}
/* 機能の詳細（07 に無い行）: .feature の中を「本文＋サムネ」の2カラムにするだけ。
   値は 07 のもの（gap 20px = .product、角丸 6px と枠 = .screen img / var(--line)）。 */
.about07 .feature.detail{
  display:grid;
  grid-template-columns:1fr 220px;
  gap:20px;
  align-items:center;
}
.about07 .detail-shot{
  width:100%;
  aspect-ratio:16 / 9;
  object-fit:cover;
  border-radius:6px;
  border:1px solid var(--line);
}
.about07 .detail-link{
  display:inline-block;
  margin-top:8px;
  color:var(--blue);
  font-weight:800;
  font-size:14px;
}
.about07 .soft{
  background:var(--soft);
  border-top:1px solid #e6edf5;
  border-bottom:1px solid #e6edf5;
}
.about07 .flow{
  display:grid;
  grid-template-columns:repeat(4, 1fr);
  gap:16px;
}
.about07 .flow-item{
  border:1px solid var(--line);
  border-radius:8px;
  background:#fff;
  padding:20px;
}
.about07 .flow-item strong{
  display:block;
  font-size:16px;
  margin-bottom:6px;
}
.about07 .flow-item p{
  margin:0;
  color:var(--muted);
  font-size:14px;
  line-height:1.7;
}
.about07 .cta-panel{
  display:grid;
  grid-template-columns:1fr auto;
  gap:28px;
  align-items:center;
  padding:40px;
  border-radius:8px;
  /* サイトにグラデーションは無いのでベタ塗りに統一（2026-08-14） */
  background:var(--blue);
  color:#fff;
  box-shadow:0 22px 60px color-mix(in srgb, var(--color-accent) 23%, transparent);
}
.about07 .cta-panel h2{
  margin:0;
  font-size:clamp(1.2rem, 2.2vw, 1.7rem);
  line-height:1.18;
  text-wrap:balance;
  letter-spacing:0;
}
.about07 .cta-panel p{
  color:#dbeafe;
  margin:8px 0 0;
}
.about07 .cta-panel .btn{
  background:#fff;
  color:var(--navy);
  border-color:#fff;
}
.about07 .pc-break{ display:inline; }
.about07 .w{ display:inline-block; }
@media (max-width: 980px){
  .about07 .segments,
  .about07 .section-head,
  .about07 .product,
  .about07 .cta-panel{ grid-template-columns:1fr; }
  .about07 .flow{ grid-template-columns:repeat(2, 1fr); }
}
@media (max-width: 640px){
  /* .wrap の幅は padding-inline 方式に統一したため、ここでの上書きは不要 */
  .about07 .hero{ padding:50px 0 58px; }
  .about07 .lead{ font-size:16px; }
  .about07 .segment-actions .btn,
  .about07 .cta-panel .btn{ width:100%; }
  .about07 section{ padding:60px 0; }
  .about07 .screen img{ min-height:250px; }
  .about07 .flow{ grid-template-columns:1fr; }
  .about07 .cta-panel{ padding:30px; }
  .about07 .feature.detail{ grid-template-columns:1fr; }
  .about07 .pc-break{ display:none; }
}
`;
