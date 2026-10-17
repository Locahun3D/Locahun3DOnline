/*
 * 3Dデータ（RAD）の断片を端末に保存して、同じ物件を開き直したときに取り直さない（2026-10-17 本人「全部ためして」）。
 *
 * なぜ: 1シーン 160〜170MB を、開くたびに全部ダウンロードしていた。ブラウザの HTTP キャッシュは
 *   使えない — Spark の fetchRange は cache:"no-store"（Chrome のキャッシュロックで並列取得が1本ずつに
 *   なる問題の回避。2026-09-20/27 計測済み）。そこで Cache Storage に自分で保存する（ロックは無い）。
 * 対象: 同一オリジンの /api/viewer-stream/ への Range 付き GET だけ。それ以外は素通し。
 * 鍵: パス＋ref＋Range（埋め込み・共有などのトークンは鍵に入れない＝経路が違っても同じ中身を使い回す）。
 *   R2 のキーは差し替えのたびに新しくなる（wf_<sha256>-… / <乱数>-…）ので中身は変わらない前提だが、
 *   念のため初回の利用時に HEAD で ETag を確かめ、違えばそのパスの保存分を捨てる。
 * 容量: 直近 3 シーンまで。古いものから消す。
 * 止め方: URL に ?radcache=0 / localStorage "l3d-radcache"="0"。戻すときはこのファイルの読み込み1行を消す。
 * Cache API は 206 を保存できないので、200 に包んで保存し、取り出すときに 206 として返す。
 */
(function () {
  "use strict";
  try {
    if (!("caches" in self) || !self.fetch) return;
    const qs = new URLSearchParams(location.search);
    if (qs.get("radcache") === "0") return;
    try { if (localStorage.getItem("l3d-radcache") === "0") return; } catch (_) {}
  } catch (_) { return; }

  const NAME = "l3d-rad-v1";
  const MAX_SCENES = 3;
  const INDEX_KEY = "l3d-radcache-index"; // { path: lastUsedMs }
  const origFetch = self.fetch.bind(self);
  const checked = new Map(); // path -> Promise (ETag 確認を1回だけ)
  let cachePromise = null;
  const openCache = () => (cachePromise ||= caches.open(NAME));
  const stats = { hit: 0, miss: 0, bytesHit: 0 };
  self.__l3dRadCacheStats = stats;

  function readIndex() { try { return JSON.parse(localStorage.getItem(INDEX_KEY) || "{}"); } catch (_) { return {}; } }
  function writeIndex(ix) { try { localStorage.setItem(INDEX_KEY, JSON.stringify(ix)); } catch (_) {} }
  async function dropPath(path) {
    const c = await openCache();
    const keys = await c.keys();
    await Promise.all(keys.filter((r) => new URL(r.url).pathname === path).map((r) => c.delete(r)));
    const ix = readIndex(); delete ix[path]; writeIndex(ix);
  }
  let evicting = false;
  async function touch(path) {
    const ix = readIndex();
    const isNew = !(path in ix);
    ix[path] = Date.now();
    writeIndex(ix);
    if (!isNew || evicting) return;
    const paths = Object.keys(ix).sort((a, b) => ix[a] - ix[b]);
    if (paths.length <= MAX_SCENES) return;
    evicting = true;
    try { for (const p of paths.slice(0, paths.length - MAX_SCENES)) await dropPath(p); } finally { evicting = false; }
  }
  function verifyOnce(url, cachedEtag) {
    const path = url.pathname;
    if (checked.has(path)) return;
    const p = origFetch(url.href, { method: "HEAD", cache: "no-store", credentials: "same-origin" })
      .then((r) => {
        const live = r.ok ? r.headers.get("ETag") : null;
        if (live && cachedEtag && live !== cachedEtag) return dropPath(path);
      })
      .catch(() => {});
    checked.set(path, p);
  }
  function cacheKey(url, range) {
    return "https://l3d-rad-cache.invalid" + url.pathname + "?ref=" + (url.searchParams.get("ref") || "") + "&r=" + encodeURIComponent(range);
  }

  self.fetch = async function (input, init) {
    let url, range, method;
    try {
      const req = input instanceof Request ? input : null;
      url = new URL(req ? req.url : String(input), location.href);
      method = (init && init.method) || (req ? req.method : "GET");
      const h = (init && init.headers) ? new Headers(init.headers) : (req ? req.headers : null);
      range = h ? h.get("Range") : null;
    } catch (_) { return origFetch(input, init); }
    if (method !== "GET" || !range || url.origin !== location.origin || !/^\/api\/viewer-stream\//.test(url.pathname)) {
      return origFetch(input, init);
    }
    const key = cacheKey(url, range);
    try {
      const c = await openCache();
      const hit = await c.match(key);
      if (hit) {
        const etag = hit.headers.get("ETag");
        verifyOnce(url, etag);
        touch(url.pathname);
        const body = await hit.arrayBuffer();
        stats.hit++; stats.bytesHit += body.byteLength;
        const headers = new Headers(hit.headers);
        headers.set("X-L3D-Cache", "hit");
        return new Response(body, { status: 206, statusText: "Partial Content", headers });
      }
    } catch (_) { /* 保存領域が使えない（プライベートモード等）→ 通常の取得 */ }
    const res = await origFetch(input, init);
    stats.miss++;
    if (res.status === 206 && res.headers.get("ETag")) {
      try {
        const copy = res.clone();
        checked.set(url.pathname, Promise.resolve());
        copy.arrayBuffer().then(async (buf) => {
          const headers = new Headers(copy.headers);
          headers.set("Content-Length", String(buf.byteLength));
          const c = await openCache();
          await c.put(key, new Response(buf, { status: 200, headers }));
          touch(url.pathname);
        }).catch(() => {});
      } catch (_) {}
    }
    return res;
  };
})();
