// 本番に登録する前のシーンを、手元の ZIP のまま本番のページで開くための差し込み（2026-11-22 TKナイトクラブで写真ツアーを先に仕上げるため）。
//   シーン名: /api/viewer-stream/local/<ファイル名>.zip  →  <dir>/<ファイル名>.zip を返す（HEAD・Range・ETag 付き）
// ETag はファイルの大きさと更新時刻から作る（ビューアーの 360° 画像のキーはこれで決まる）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const LOCAL_PREFIX = '/api/viewer-stream/local/';

export async function routeLocalZips(target, dir) {
  if (!dir) return;
  await target.route((u) => u.host === 'locahun3d.com' && u.pathname.startsWith(LOCAL_PREFIX), async (route) => {
    const req = route.request();
    const name = decodeURIComponent(new URL(req.url()).pathname.slice(LOCAL_PREFIX.length));
    const f = path.join(dir, path.basename(name));
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
    const st = fs.statSync(f), size = st.size;
    const etag = '"' + crypto.createHash('sha1').update(`${path.basename(f)}:${size}:${st.mtimeMs}`).digest('hex').slice(0, 32) + '"';
    const base = { 'content-type': 'application/octet-stream', 'accept-ranges': 'bytes', etag, 'cache-control': 'no-store' };
    if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { ...base, 'content-length': String(size) }, body: '' });
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers()['range'] || '');
    if (m) {
      let a = m[1] === '' ? size - Number(m[2]) : Number(m[1]);
      let b = m[1] === '' || m[2] === '' ? size - 1 : Math.min(size - 1, Number(m[2]));
      a = Math.max(0, a);
      const buf = Buffer.alloc(b - a + 1); const fd = fs.openSync(f, 'r'); fs.readSync(fd, buf, 0, buf.length, a); fs.closeSync(fd);
      return route.fulfill({ status: 206, headers: { ...base, 'content-range': `bytes ${a}-${b}/${size}`, 'content-length': String(buf.length) }, body: buf });
    }
    return route.fulfill({ status: 200, headers: { ...base, 'content-length': String(size) }, body: fs.readFileSync(f) });
  });
}
