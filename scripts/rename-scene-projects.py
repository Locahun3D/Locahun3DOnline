"""公開ビューアーに出るシーン名（ビューアー用 ZIP の project.json の projectName）を書き換える（2026-10-17 本人「なまえなおして」）。

  python scripts/rename-scene-projects.py plan.json            # 何が変わるかだけ表示（本番は触らない）
  python scripts/rename-scene-projects.py plan.json --apply    # R2 に新しい ZIP を上げ、D1 の splatUrl を差し替える

plan.json: [{"id": "<物件ID>", "scene": <splatItems の番号>, "name": "<新しいシーン名>", "label": "<任意: 物件側のシーン名も変える>"}]

やること（オンライン編集の保存 attachSceneEditConditionally と同じ形）:
- 今の splatUrl（編集後の小さい wf_…-project.zip）を落とし、project.json の projectName だけ変えて詰め直す。
  ほかのファイルは中身も圧縮方式もそのまま。
- 新しい ZIP は内容の SHA-256 で assets/splat/wf_<sha>-project.zip に上げ、読み戻して一致を確かめる。
- D1 は「読んだときと同じ updated_at と data のときだけ」更新する。前の ZIP は editVersions に残すので、
  管理画面の「元に戻す」で戻せる。更新前の行は artifacts/scene-rename-backup/ に保存する。
"""
import datetime as dt
import hashlib
import hmac
import io
import json
import re
import os
import subprocess
import sys
import urllib.parse
import urllib.request
import zipfile

HISTORY_LIMIT = 5  # src/lib/scene-edit-attachment.ts の SCENE_EDIT_HISTORY_LIMIT と同じ
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def env(name):
    v = os.environ.get(name)
    if not v and os.name == "nt":
        v = subprocess.run(["powershell", "-NoProfile", "-Command", f"[Environment]::GetEnvironmentVariable('{name}','User')"],
                           capture_output=True, text=True).stdout.strip()
    if not v:
        sys.exit(f"{name} が無い")
    return v


AK, SK, EP, BUCKET = (env(k) for k in ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_BUCKET"))


def presign(method, key, ttl=3600):
    host = urllib.parse.urlparse(EP).netloc
    path = "/" + BUCKET + "/" + "/".join(urllib.parse.quote(p, safe="") for p in key.split("/"))
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    day = now[:8]
    scope = f"{day}/auto/s3/aws4_request"
    q = {"X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": f"{AK}/{scope}", "X-Amz-Date": now,
         "X-Amz-Expires": str(ttl), "X-Amz-SignedHeaders": "host"}
    cq = "&".join(f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(q[k], safe='')}" for k in sorted(q))
    creq = "\n".join([method, path, cq, f"host:{host}\n", "host", "UNSIGNED-PAYLOAD"])
    sts = "\n".join(["AWS4-HMAC-SHA256", now, scope, hashlib.sha256(creq.encode()).hexdigest()])
    k = ("AWS4" + SK).encode()
    for part in (day, "auto", "s3", "aws4_request"):
        k = hmac.new(k, part.encode(), hashlib.sha256).digest()
    sig = hmac.new(k, sts.encode(), hashlib.sha256).hexdigest()
    return f"{EP.rstrip('/')}{path}?{cq}&X-Amz-Signature={sig}"


def r2_get(key):
    with urllib.request.urlopen(presign("GET", key), timeout=600) as r:
        return r.read()


def r2_put(key, data):
    req = urllib.request.Request(presign("PUT", key), data=data, method="PUT", headers={"Content-Type": "application/zip"})
    with urllib.request.urlopen(req, timeout=600) as r:
        if r.status not in (200, 201):
            sys.exit(f"PUT 失敗 {r.status}")


def d1(sql=None, file=None):
    # shell を通すと引用符の扱いで SQL が崩れるので、npx.cmd を直接呼ぶ
    args = ["npx.cmd" if os.name == "nt" else "npx", "wrangler", "d1", "execute", "locahun3d-db", "--remote", "--json"]
    args += ["--file", file] if file else ["--command", sql]
    for _ in range(3):
        r = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", cwd=ROOT)
        out = r.stdout
        try:
            # wrangler は先頭に "[WARNING]" などを出すことがあるので、JSON 配列の始まりから読む
            res = json.loads(out[out.index("[\n  {"):out.rindex("]") + 1])[0]
            if "results" in res:
                return res
        except Exception:
            continue
    sys.exit("D1 の読み書きに失敗:\n" + (r.stderr or "")[-800:])


def key_of(url):
    return url.split("/api/r2/", 1)[1] if "/api/r2/" in url else url.lstrip("/")


def rename_zip(data, name):
    src = zipfile.ZipFile(io.BytesIO(data))
    pj = [i for i in src.infolist() if i.filename.split("/")[-1] == "project.json"]
    if len(pj) != 1:
        sys.exit(f"project.json が {len(pj)} 個")
    out = io.BytesIO()
    old = None
    with zipfile.ZipFile(out, "w") as dst:
        for info in src.infolist():
            body = src.read(info)
            if info is pj[0]:
                project = json.loads(body.decode("utf-8"))
                old = project.get("projectName")
                project["projectName"] = name
                body = json.dumps(project, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            ni = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            ni.compress_type, ni.external_attr = info.compress_type, info.external_attr
            dst.writestr(ni, body)
    return out.getvalue(), old


def main():
    plan = json.load(open(sys.argv[1], encoding="utf-8"))
    apply = "--apply" in sys.argv
    by_prop = {}
    for p in plan:
        by_prop.setdefault(p["id"], []).append(p)
    os.makedirs(os.path.join(ROOT, "artifacts", "scene-rename-backup"), exist_ok=True)
    for pid, changes in by_prop.items():
        row = d1(f"SELECT id,status,updated_at,data FROM properties WHERE id='{pid}'")["results"][0]
        prop = json.loads(row["data"])
        now = dt.datetime.now(dt.timezone.utc)
        new_updated = max(now, dt.datetime.fromisoformat(row["updated_at"].replace("Z", "+00:00")) + dt.timedelta(milliseconds=1))
        new_updated = new_updated.strftime("%Y-%m-%dT%H:%M:%S.") + f"{new_updated.microsecond // 1000:03d}Z"
        for c in changes:
            scene = prop["splatItems"][c["scene"]]
            old_url = scene["splatUrl"]
            if not old_url.endswith("-project.zip"):
                sys.exit(f"{pid}#{c['scene']}: 編集後アーカイブではない（{old_url}）。本体ごと上げ直すことになるので止める")
            data = r2_get(key_of(old_url))
            new_data, old_name = rename_zip(data, c["name"])
            sha = hashlib.sha256(new_data).hexdigest()
            new_key = f"assets/splat/wf_{sha}-project.zip"
            print(f"{pid}#{c['scene']}: {old_name!r} -> {c['name']!r}  label {scene.get('label')!r} -> {c.get('label', scene.get('label'))!r}  {len(data)//1024}KB -> {len(new_data)//1024}KB")
            if not apply:
                continue
            r2_put(new_key, new_data)
            if hashlib.sha256(r2_get(new_key)).hexdigest() != sha:
                sys.exit("読み戻しが一致しない")
            hist = list(scene.get("editVersions") or []) + [{"url": old_url, "sizeMb": scene.get("sizeMb", 0), "savedAt": new_updated,
                                                             "key": hashlib.sha256(f"rename:{old_url}:{new_updated}".encode()).hexdigest()}]
            scene["editVersions"] = [hist[0]] + hist[-(HISTORY_LIMIT - 1):] if len(hist) > HISTORY_LIMIT else hist
            scene["splatUrl"] = "/api/r2/" + new_key
            scene["sizeMb"] = max(1, round(len(new_data) / 1024 ** 2))
            if "label" in c:
                scene["label"] = c["label"]
        if not apply:
            continue
        prop["updatedAt"] = new_updated
        backup = os.path.join(ROOT, "artifacts", "scene-rename-backup", f"{pid}_{row['updated_at'].replace(':', '')}.json")
        json.dump(row, open(backup, "w", encoding="utf-8"), ensure_ascii=False)
        q = lambda s: "'" + s.replace("'", "''") + "'"
        sql = (f"UPDATE properties SET data={q(json.dumps(prop, ensure_ascii=False, separators=(',', ':')))}, updated_at={q(new_updated)} "
               f"WHERE id={q(pid)} AND status={q(row['status'])} AND updated_at={q(row['updated_at'])} AND data={q(row['data'])};")
        f = os.path.join(ROOT, "artifacts", "scene-rename-backup", f"{pid}_update.sql")
        open(f, "w", encoding="utf-8").write(sql)
        res = d1(file=f)
        changed = (res.get("meta") or {}).get("changes")
        back = json.loads(d1(f"SELECT data FROM properties WHERE id='{pid}'")["results"][0]["data"])
        ok = all(back["splatItems"][c["scene"]]["splatUrl"] == prop["splatItems"][c["scene"]]["splatUrl"] for c in changes)
        print(f"  D1 {pid}: changes={changed} 読み戻し={'OK' if ok else 'NG'}  控え {os.path.relpath(backup, ROOT)}")
        if not ok:
            sys.exit("D1 の読み戻しが一致しない（R2 に上げた新しい ZIP は使われないまま残る）")


if __name__ == "__main__":
    main()
