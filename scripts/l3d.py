"""掲載準備パイプライン（Dropbox 側のスクリプト群）の起動口。

  python scripts/l3d.py where                       # このPCでの場所の解決結果（別PCでまずこれ）
  python scripts/l3d.py status                      # 全案件の進捗
  python scripts/l3d.py pipeline [--run ...]        # ZIP→動画
  python scripts/l3d.py register [plan|run ...]     # R2 登録・物件紐付け（本番 D1/R2 に書く）
  python scripts/l3d.py collect <url> <workdir>     # 公式サイトの収集
  python scripts/l3d.py prepare <slug> ...          # 公式サイトの読み取り結果を反映用にまとめる（ローカルのみ）
  python scripts/l3d.py prepare2 <slug> ...         # 料金・他社サイト補完・FC写真を反映用にまとめる（ローカルのみ）
  python scripts/l3d.py official <slug> ...         # result.json を下書き物件へ反映（--swap-cover / --rollback）
  python scripts/l3d.py check                       # 公開前チェック
  python scripts/l3d.py documents <slug> --blueprint "ラベル=画像" ...   # 図面を平面図へ追加
  python scripts/l3d.py place <slug> <ZIP|フォルダ> --captions <txt>   # もらった写真を番号順に配置
  python scripts/l3d.py basics <slug> --summary "…" --confirm-url   # 掲載の基本欄（公開申請の必須項目）
  python scripts/l3d.py sell <slug> [--allow-published]   # データ販売を有効化（ZIP作成→R2→販売設定）

1行の単純なコマンドにしてあるのは、Claude Code の許可ルール（.claude/settings.local.json の
`Bash(python scripts/l3d.py *)`）に一致させ、自動モードのまま最後まで通すため（2026-09-20）。
R2 の鍵は Windows のユーザー環境変数（set_r2_env.ps1 で登録）から読み込む。値は表示しない。
本番に書くスクリプト側の安全策: 下書き物件のみ・条件付き更新＋読み戻し・R2 は SHA-256 照合・反映前の値をバックアップ。
"""
import os
import subprocess
import sys

def _find_scripts():
    """Dropbox 側の 01_ワークフロー解説/scripts を探す（別PC対応・2026-09-21）。

    順番: 環境変数 LOCAHUN_PIPELINE_DIR → LOCAHUN_DATA_ROOT の下 → よくある Dropbox の場所。
    どれも無ければ最後の候補を返し、main() が「無い」と言って止まる。
    """
    v = os.environ.get("LOCAHUN_PIPELINE_DIR")
    if v and os.path.isdir(v):
        return v
    rel = os.path.join("01_ワークフロー解説", "scripts")
    root = os.environ.get("LOCAHUN_DATA_ROOT")
    cands = [os.path.join(root, rel)] if root else []
    tail = os.path.join("KWI", "Products", "Locahun3D", "01_3DData", rel)
    home = os.path.expanduser("~")
    cands += [os.path.join(home, "Dropbox", tail)]
    cands += [f"{d}:\\Dropbox\\{tail}" for d in "GEFDCH"]
    return next((c for c in cands if os.path.isdir(c)), cands[-1])


SCRIPTS = _find_scripts()
TOOLS = {
    "where": "paths.py",                   # このPCで場所がどう解決されているか（別PCでの最初の動作確認）
    "status": "pipeline_status.py",
    "pipeline": "run_pipeline.py",
    "register": "r2_register.py",
    "collect": "official_collect.py",
    "prepare": "official_prepare.py",      # 公式サイトの読み取り結果 → result.json（ローカルのみ）
    "prepare2": "official_prepare2.py",    # 料金・他社サイト補完・FC写真 → result.json（ローカルのみ）
    "official": "import_official.py",
    "check": "publish_check.py",
    "documents": "add_documents.py",       # 先方の図面などを下書き物件の平面図へ追加（既存は消さない）
    "new": "new_draft.py",                 # カレンダーの撮影予定から下書きを先に作る（既存 id は上書きしない）
    "place": "place_photos.py",                # もらった写真を番号どおりに自動配置（ZIP/フォルダ＋キャプション）
    "photos": "replace_photos.py",         # スキャン切り出しのカバー・ギャラリーを公式の実写へ入れ替える
    "sell": "sell_data.py",                # 3Dデータ販売を有効にする（販売用ZIPを作って R2 へ／公開中は --allow-published）
    "fields": "set_fields.py",               # 料金・許可など決まった欄を1つずつ入れる（下書きのみ）
    "basics": "set_basics.py",              # エリア・都道府県・市区町村・紹介文・公開URL確認（公開申請の必須欄）
    "english": "apply_english.py",          # 物件の英語欄（…En）を en.json から埋める（空欄のみ。--force で上書き）
}
R2_KEYS = ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_BUCKET")


def load_user_env():
    """bash 経由だと Windows のユーザー環境変数が入らないので、レジストリから補う。"""
    if os.name != "nt":
        return
    import winreg
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
        for name in R2_KEYS:
            if not os.environ.get(name):
                try:
                    os.environ[name] = winreg.QueryValueEx(k, name)[0]
                except FileNotFoundError:
                    pass


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in TOOLS:
        sys.exit(__doc__)
    script = os.path.join(SCRIPTS, TOOLS[sys.argv[1]])
    if not os.path.exists(script):
        sys.exit(f"スクリプトが無い: {script}\n"
                 "別PCなら、Dropbox の 01_ワークフロー解説/scripts のフルパスを環境変数 "
                 "LOCAHUN_PIPELINE_DIR に入れてください（または LOCAHUN_DATA_ROOT に 01_3DData を）。\n"
                 "詳しくは 01_ワークフロー解説/00_はじめに.md。")
    load_user_env()
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    sys.exit(subprocess.call([sys.executable, script, *sys.argv[2:]], cwd=SCRIPTS))


if __name__ == "__main__":
    main()
