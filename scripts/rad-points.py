# RAD（Spark の LOD 付き 3DGS）から中心座標と不透明度を取り出して npz に保存する
import zipfile, json, struct, zlib, sys, numpy as np
zp, member, out = sys.argv[1], sys.argv[2], sys.argv[3]
f = zipfile.ZipFile(zp).open(member); buf = f.read()
n = struct.unpack('<I', buf[4:8])[0]; h = json.loads(buf[8:8 + n]); at = 8 + n; at += (-at) % 8
P, A, L = [], [], []
for c in h['chunks']:
    s = at + c['offset']; assert buf[s:s + 4] == b'RADC', buf[s:s+8]
    m = struct.unpack('<I', buf[s + 4:s + 8])[0]; ch = json.loads(buf[s + 8:s + 8 + m]); p0 = s + 8 + m; p0 += (-(p0 - s)) % 8; p0 += 8   # JSON（8 の倍数にそろえる）の後に payload の長さ（u64）
    cnt = ch['count']
    for pr in ch['properties']:
        raw = buf[p0 + pr['offset']:p0 + pr['offset'] + pr['bytes']]
        if pr.get('compression') == 'gz': raw = zlib.decompress(raw, -15)   # 生の deflate
        if pr['property'] == 'center':
            b = np.frombuffer(raw, np.uint8)
            if pr['encoding'] == 'f32_lebytes':   # f32 をバイトごとに 4 面（各面は x 全部・y 全部・z 全部の順）
                xyz = b.reshape(4, 3, cnt).transpose(2, 1, 0).copy().view('<f4').reshape(cnt, 3)
            else: xyz = b.view('<f4').reshape(-1, 3)
            P.append(xyz)
        if pr['property'] == 'child_count':
            L.append(np.frombuffer(raw, '<u2')[:cnt] == 0)   # 葉（LOD の親でない）
        if pr['property'] == 'alpha':
            A.append(np.frombuffer(raw, '<f2').astype(np.float32)[:cnt])
P = np.concatenate(P); A = np.concatenate(A); L = np.concatenate(L) if L else np.ones(len(P), bool)
np.savez_compressed(out, p=P, a=A, leaf=L)
print(P.shape, np.nanpercentile(P, [1, 50, 99], axis=0).round(2).tolist(), 'alpha', np.percentile(A, [5, 50, 95]).round(2).tolist(), 'leaf', int(L.sum()))
