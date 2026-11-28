"""公開シーンの編集後アーカイブ（wf_…-project.zip）の project.json を、手元で直した project.json に差し替える
（2026-11-28 本人「12×5×6 は意図してない」→ studio-see-you-tomorrow のシーン1を倍率1に戻すため）。

  python scripts/replace-scene-project.py <物件ID> <シーン番号> <直した ZIP or project.json>            # 差分だけ表示
  python scripts/replace-scene-project.py <物件ID> <シーン番号> <直した ZIP or project.json> --apply    # R2 に上げて D1 を差し替える

やり方は scripts/rename-scene-projects.py と同じ（オンライン編集の保存と同じ形）:
- 今の splatUrl の ZIP を落とし、project.json だけ入れ替える（ほかのファイルは中身も圧縮方式もそのまま）。
- 新しい ZIP は内容の SHA-256 で assets/splat/wf_<sha>-project.zip に上げ、読み戻して一致を確かめる。
- D1 は読んだときと同じ updated_at と data のときだけ更新。前の ZIP は editVersions に残す（管理画面の「元に戻す」で戻せる）。
  更新前の行は artifacts/scene-rename-backup/ に保存する。
"""
import datetime as dt
import hashlib
import io
import json
import os
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util

_spec = importlib.util.spec_from_file_location("rsp", os.path.join(os.path.dirname(os.path.abspath(__file__)), "rename-scene-projects.py"))
rsp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rsp)
ROOT, HISTORY_LIMIT, d1, r2_get, r2_put, key_of = rsp.ROOT, rsp.HISTORY_LIMIT, rsp.d1, rsp.r2_get, rsp.r2_put, rsp.key_of


def load_project(path):
    if path.endswith(".zip"):
        z = zipfile.ZipFile(path)
        pj = [n for n in z.namelist() if n.split("/")[-1] == "project.json"]
        return json.loads(z.read(pj[0]).decode("utf-8"))
    return json.load(open(path, encoding="utf-8"))


def swap(data, project):
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
                old = json.loads(body.decode("utf-8"))
                body = json.dumps(project, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            ni = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            ni.compress_type, ni.external_attr = info.compress_type, info.external_attr
            dst.writestr(ni, body)
    return out.getvalue(), old


def brief(pj):
    return [(L.get("name"), L.get("pos"), L.get("rot"), L.get("scale")) for L in pj.get("layers", []) if L.get("type") == "splat"]


def main():
    pid, idx, src = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    apply = "--apply" in sys.argv
    project = load_project(src)
    row = d1(f"SELECT id,status,updated_at,data FROM properties WHERE id='{pid}'")["results"][0]
    prop = json.loads(row["data"])
    scene = prop["splatItems"][idx]
    old_url = scene["splatUrl"]
    if not old_url.endswith("-project.zip"):
        sys.exit(f"{pid}#{idx}: 編集後アーカイブではない（{old_url}）")
    data = r2_get(key_of(old_url))
    new_data, old_pj = swap(data, project)
    sha = hashlib.sha256(new_data).hexdigest()
    new_key = f"assets/splat/wf_{sha}-project.zip"
    print(f"{pid}#{idx}: {old_url}\n  前 {brief(old_pj)}\n  後 {brief(project)}\n  -> /api/r2/{new_key}  {len(data)//1024}KB -> {len(new_data)//1024}KB")
    if not apply:
        return
    now = dt.datetime.now(dt.timezone.utc)
    nu = max(now, dt.datetime.fromisoformat(row["updated_at"].replace("Z", "+00:00")) + dt.timedelta(milliseconds=1))
    nu = nu.strftime("%Y-%m-%dT%H:%M:%S.") + f"{nu.microsecond // 1000:03d}Z"
    r2_put(new_key, new_data)
    if hashlib.sha256(r2_get(new_key)).hexdigest() != sha:
        sys.exit("読み戻しが一致しない")
    hist = list(scene.get("editVersions") or []) + [{"url": old_url, "sizeMb": scene.get("sizeMb", 0), "savedAt": nu,
                                                     "key": hashlib.sha256(f"replace:{old_url}:{nu}".encode()).hexdigest()}]
    scene["editVersions"] = [hist[0]] + hist[-(HISTORY_LIMIT - 1):] if len(hist) > HISTORY_LIMIT else hist
    scene["splatUrl"] = "/api/r2/" + new_key
    scene["sizeMb"] = max(1, round(len(new_data) / 1024 ** 2))
    if isinstance(scene.get("sceneTextEn"), dict) and scene["sceneTextEn"].get("source") == old_url:
        scene["sceneTextEn"]["source"] = scene["splatUrl"]
    prop["updatedAt"] = nu
    bdir = os.path.join(ROOT, "artifacts", "scene-rename-backup")
    os.makedirs(bdir, exist_ok=True)
    backup = os.path.join(bdir, f"{pid}_{row['updated_at'].replace(':', '')}.json")
    json.dump(row, open(backup, "w", encoding="utf-8"), ensure_ascii=False)
    q = lambda s: "'" + s.replace("'", "''") + "'"
    sql = (f"UPDATE properties SET data={q(json.dumps(prop, ensure_ascii=False, separators=(',', ':')))}, updated_at={q(nu)} "
           f"WHERE id={q(pid)} AND status={q(row['status'])} AND updated_at={q(row['updated_at'])} AND data={q(row['data'])};")
    f = os.path.join(bdir, f"{pid}_replace.sql")
    open(f, "w", encoding="utf-8").write(sql)
    res = d1(file=f)
    back = json.loads(d1(f"SELECT data FROM properties WHERE id='{pid}'")["results"][0]["data"])
    ok = back["splatItems"][idx]["splatUrl"] == scene["splatUrl"]
    print(f"  D1 changes={(res.get('meta') or {}).get('changes')} 読み戻し={'OK' if ok else 'NG'}  控え {os.path.relpath(backup, ROOT)}")
    if not ok:
        sys.exit("D1 の読み戻しが一致しない")


if __name__ == "__main__":
    main()
