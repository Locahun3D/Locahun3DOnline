// Lightweight CORS proxy for R2 assets.
// Spark's RAD loader needs Access-Control-Allow-Origin on Range responses.
// R2's pub-*.r2.dev subdomain doesn't send CORS headers, so this Worker
// proxies R2 objects with the right headers. It only reads from R2 (no CPU
// overhead), so it won't hit the resource limits that crash the main app.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
  'Access-Control-Max-Age': '86400',
};

const ALLOWED_PREFIXES = [
  'uploads/',
  'Kousaten_ForDemo_point_cloud.rad',
];

const handler = {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);
    const key = url.pathname.slice(1); // strip leading /

    if (!key || !ALLOWED_PREFIXES.some(p => key.startsWith(p))) {
      return new Response('Not found', { status: 404 });
    }

    const range = request.headers.get('Range');
    const opts = range ? { range: parseRange(range) } : {};

    const obj = await env.BUCKET.get(key, opts);
    if (!obj) {
      return new Response('Not found', { status: 404 });
    }

    const headers = new Headers(CORS_HEADERS);
    headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('ETag', obj.etag);

    if (range && obj.range) {
      const r = obj.range;
      headers.set('Content-Range', `bytes ${r.offset}-${r.offset + r.length - 1}/${obj.size}`);
      headers.set('Content-Length', String(r.length));
      return new Response(obj.body, { status: 206, headers });
    }

    headers.set('Content-Length', String(obj.size));
    return new Response(obj.body, { status: 200, headers });
  }
};

function parseRange(header) {
  const m = header.match(/bytes=(\d+)-(\d*)/);
  if (!m) return undefined;
  const offset = parseInt(m[1], 10);
  const end = m[2] ? parseInt(m[2], 10) : undefined;
  if (end !== undefined) {
    return { offset, length: end - offset + 1 };
  }
  return { offset };
}

export default handler;
