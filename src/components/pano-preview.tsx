"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 3DGS カードのプレビュー: 開始位置の 360° 画像（6 方向・各 90°）をゆっくり回して見せる
 * （2026-11-10 本人「3DGSビューのプレビュー動画、最初の3Dから用意した画像を回転させて表示させるのはどうか / 動画より軽く360度回せるのでは」）。
 *
 * - 画像はビューアー（Locahun3D src/js/292b_start_pano.js）が開いた直後に 3D の上にかぶせるものと同じ
 *   （/api/pano/<key>.json と /api/pano/<key>-{f,r,b,l,u,d}.jpg。scripts/bake-pano.mjs が作る）。
 * - キーもビューアーと同じ計算: シーンの配信（/api/viewer-stream/…）の HEAD の ETag と長さから
 *   sha256('l3d-pano-v1:' + 'etag:<etag>:<長さ>' または 'content:<id>:<長さ>')。だからカードとビューアーで食い違わない。
 * - 描画は WebGL の 1 枚の板に、画素ごとの視線の向きから 6 面の画像の色を拾う（ビューアーの <head> の最初の画像と同じ計算・面の向き）。6 枚で計 0.4MB 前後。
 *   2026-11-23: 以前の CSS の 3D 変形の立方体は Chrome でも正面の 1 面が小さく出て周りが白くなり、回りもしなかった（本人「プレビューが機能していない」「360回転は？」）。
 *   WebGL が使えない端末では onMissing（従来のプレビュー動画）に戻す。
 * - 自動でゆっくり回り、ドラッグで見回せる（ドラッグした後のクリックはビューアーを開かない）。
 * - 画像が無い・確かめられないときは onMissing を呼ぶ（呼び出し側が従来のプレビュー動画に戻す）。
 */

const FACES = ["f", "r", "b", "l", "u", "d"] as const;
const HFOV = 100; // カード幅に対する横の画角（度）
const AUTO_DEG_PER_SEC = 9; // 40 秒で 1 周
const keyCache = new Map<string, Promise<string | null>>();

async function sha256hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((n) => n.toString(16).padStart(2, "0")).join("");
}

/** ビューアーの 292b と同じ手順で 360° 画像のキーを求め、画像があればキーを返す。 */
function findPano(streamUrl: string): Promise<string | null> {
  const hit = keyCache.get(streamUrl);
  if (hit) return hit;
  const p = (async () => {
    try {
      const res = await fetch(streamUrl, { method: "HEAD", credentials: "same-origin", cache: "no-cache" });
      if (!res.ok) return null;
      const etag = res.headers.get("etag") || "";
      const len = res.headers.get("content-length") || res.headers.get("x-content-length") || "";   // Next 16.4.6 で HEAD の Content-Length が消える
      if (!/^\d+$/.test(len)) return null;
      const content = /^"l3d-content-([A-Za-z0-9_-]{8,200})"$/.exec(etag);
      const r2 = /^"([A-Za-z0-9_-]{8,200})"$/.exec(etag);
      const id = content ? `content:${content[1]}:${len}` : r2 ? `etag:${r2[1]}:${len}` : null;
      if (!id) return null;
      const key = await sha256hex(`l3d-pano-v1:${id}`);
      const meta = await fetch(`/api/pano/${key}.json`);
      return meta.ok ? key : null;
    } catch {
      return null;
    }
  })();
  keyCache.set(streamUrl, p);
  return p;
}

// 面の向き（見る人の右 = +x、上 = +y、正面 = +z）: f +z / r +x / l -x / b -z / u +y / d -y（ビューアーの FACE_AXES と同じ）
const VS = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }";
const FS = `precision highp float;
uniform sampler2D tf, tr, tb, tl, tu, td;
uniform vec2 res; uniform float fp, yaw, pitch;
void main(){
  float cx = (gl_FragCoord.x - res.x * 0.5) / fp, cy = (gl_FragCoord.y - res.y * 0.5) / fp;
  float cp = cos(pitch), sp = sin(pitch);
  vec3 d = vec3(cx, cy * cp + sp, -cy * sp + cp);
  float cyw = cos(yaw), syw = sin(yaw);
  d = vec3(d.x * cyw + d.z * syw, d.y, -d.x * syw + d.z * cyw);
  vec3 a = abs(d); vec2 uv; vec4 c;
  if(a.x >= a.y && a.x >= a.z){
    if(d.x > 0.0){ uv = vec2(-d.z, d.y) / a.x; c = texture2D(tr, vec2(uv.x + 1.0, 1.0 - uv.y) * 0.5); }
    else { uv = vec2(d.z, d.y) / a.x; c = texture2D(tl, vec2(uv.x + 1.0, 1.0 - uv.y) * 0.5); }
  } else if(a.y >= a.z){
    if(d.y > 0.0){ uv = vec2(d.x, -d.z) / a.y; c = texture2D(tu, vec2(uv.x + 1.0, 1.0 - uv.y) * 0.5); }
    else { uv = vec2(d.x, d.z) / a.y; c = texture2D(td, vec2(uv.x + 1.0, 1.0 - uv.y) * 0.5); }
  } else {
    if(d.z > 0.0){ uv = vec2(d.x, d.y) / a.z; c = texture2D(tf, vec2(uv.x + 1.0, 1.0 - uv.y) * 0.5); }
    else { uv = vec2(-d.x, d.y) / a.z; c = texture2D(tb, vec2(uv.x + 1.0, 1.0 - uv.y) * 0.5); }
  }
  gl_FragColor = vec4(c.rgb, 1.0);
}`;

export function PanoPreview({ streamUrl, onMissing }: { streamUrl: string; onMissing: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [panoKey, setPanoKey] = useState<string | null>(null);
  const [imgs, setImgs] = useState<HTMLImageElement[] | null>(null);
  const [shown, setShown] = useState(false);
  const missingRef = useRef(onMissing);
  useEffect(() => { missingRef.current = onMissing; }, [onMissing]);

  // 画面付近に入ってから調べる（1 物件に複数シーンがあっても一度に全部取りに行かない）
  useEffect(() => {
    const el = rootRef.current;
    if (!el || visible) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        setVisible(true);
        io.disconnect();
      }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    findPano(streamUrl).then((key) => {
      if (!alive) return;
      if (key) setPanoKey(key);
      else missingRef.current();
    });
    return () => { alive = false; };
  }, [visible, streamUrl]);

  // 6 枚そろってから描く。1 枚でも失敗したら動画へ。
  useEffect(() => {
    if (!panoKey) return;
    let left = FACES.length, alive = true;
    const list = FACES.map((f) => {
      const img = new Image();
      img.onload = () => { if (alive && --left === 0) setImgs(list); };
      img.onerror = () => { if (alive) { alive = false; missingRef.current(); } };
      img.src = `/api/pano/${panoKey}-${f}.jpg`;
      return img;
    });
    return () => { alive = false; };
  }, [panoKey]);

  // WebGL で描く・自動回転とドラッグ。イベントはカード全体（親要素）で受ける（上に重なる「開く」ボタンの下からでも回せるように）。
  useEffect(() => {
    const root = rootRef.current, cv = canvasRef.current;
    const card = root?.parentElement;
    if (!imgs || !root || !cv || !card) return;
    const gl = cv.getContext("webgl", { antialias: false, premultipliedAlpha: false });
    if (!gl) { missingRef.current(); return; }
    const sh = (type: number, src: string) => { const o = gl.createShader(type)!; gl.shaderSource(o, src); gl.compileShader(o); return o; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { missingRef.current(); return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const texs = imgs.map((img, i) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(prog, "t" + FACES[i]), i);
      return t;
    });
    const uRes = gl.getUniformLocation(prog, "res"), uFp = gl.getUniformLocation(prog, "fp");
    const uYaw = gl.getUniformLocation(prog, "yaw"), uPitch = gl.getUniformLocation(prog, "pitch");
    // 「動きを減らす」設定でも回す（2026-11-23 本人「360回転は？」。本人の PC がこの設定で、止まって見えていた）。ゆっくり（40 秒で 1 周）なので酔う動きではない
    let yaw = 0, pitch = 0, last = performance.now(), raf = 0, idleUntil = 0, onScreen = true;
    let drag: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;
    let suppressClick = false;
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(root.clientWidth * dpr)), h = Math.max(1, Math.round(root.clientHeight * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uFp, w / 2 / Math.tan((HFOV * Math.PI) / 360));
      gl.uniform1f(uYaw, (yaw * Math.PI) / 180);
      gl.uniform1f(uPitch, (pitch * Math.PI) / 180);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!drag && now > idleUntil) yaw += AUTO_DEG_PER_SEC * dt;
      if (onScreen) draw();
      raf = requestAnimationFrame(tick);
    };
    draw();
    raf = requestAnimationFrame(tick);
    const showT = setTimeout(() => setShown(true), 0);
    // 画面外では描かない
    const io = new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); });
    io.observe(root);
    const down = (e: PointerEvent) => { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, yaw, pitch, moved: false }; suppressClick = false; };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      const degPerPx = HFOV / (card.clientWidth || 1);
      yaw = drag.yaw - dx * degPerPx;
      pitch = Math.max(-60, Math.min(60, drag.pitch + dy * degPerPx));
    };
    const up = () => { if (drag?.moved) { suppressClick = true; idleUntil = performance.now() + 2500; } drag = null; };
    // ドラッグして離したときのクリックでビューアーが開かないようにする
    const click = (e: MouseEvent) => { if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; } };
    card.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    card.addEventListener("click", click, true);
    // 縦スクロールは残し、横のドラッグで見回す（カードは呼び出し側の要素なので DOM を直接触る）
    // eslint-disable-next-line react-hooks/immutability
    card.style.touchAction = "pan-y";
    return () => {
      clearTimeout(showT);
      cancelAnimationFrame(raf);
      io.disconnect();
      card.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      card.removeEventListener("click", click, true);
      for (const t of texs) gl.deleteTexture(t);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [imgs]);

  return (
    <div ref={rootRef} style={{ position: "absolute", inset: 0, overflow: "hidden" }} aria-hidden="true">
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", opacity: shown ? 1 : 0, transition: "opacity .5s" }}
      />
    </div>
  );
}
