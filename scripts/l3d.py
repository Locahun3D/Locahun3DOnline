"""掲載準備パイプライン（Dropbox 側のスクリプト群）の起動口。

  python scripts/l3d.py status                      # 全案件の進捗
  python scripts/l3d.py pipeline [--run ...]        # ZIP→動画
  python scripts/l3d.py register [plan|run ...]     # R2 登録・物件紐付け（本番 D1/R2 に書く）
  python scripts/l3d.py collect <url> <workdir>     # 公式サイトの収集
  python scripts/l3d.py prepare <slug> ...          # 公式サイトの読み取り結果を反映用にまとめる（ローカルのみ）
  python scripts/l3d.py prepare2 <slug> ...         # 料金・他社サイト補完・FC写真を反映用にまとめる（ローカルのみ）
  python scripts/l3d.py official <slug> ...         # result.json を下書き物件へ反映（--swap-cover / --rollback）
  python scripts/l3d.py check                       # 公開前チェック

1行の単純なコマンドにしてあるのは、Claude Code の許可ルール（.claude/settings.local.json の
`Bash(python scripts/l3d.py *)`）に一致させ、自動モードのまま最後まで通すため（2026-09-20）。
R2 の鍵は Windows のユーザー環境変数（set_r2_env.ps1 で登録）から読み込む。値は表示しない。
本番に書くスクリプト側の安全策: 下書き物件のみ・条件付き更新＋読み戻し・R2 は SHA-256 照合・反映前の値をバックアップ。
"""
import os
import subprocess
import sys

SCRIPTS = os.environ.get(
    "LOCAHUN_PIPELINE_DIR",
    r"C:\Users\askgg\Dropbox\KWI\Products\Locahun3D\01_3DData\01_ワークフロー解説\scripts",
)
TOOLS = {
    "status": "pipeline_status.py",
    "pipeline": "run_pipeline.py",
    "register": "r2_register.py",
    "collect": "official_collect.py",
    "prepare": "official_prepare.py",      # 公式サイトの読み取り結果 → result.json（ローカルのみ）
    "prepare2": "official_prepare2.py",    # 料金・他社サイト補完・FC写真 → result.json（ローカルのみ）
    "official": "import_official.py",
    "check": "publish_check.py",
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
        sys.exit(f"スクリプトが無い: {script}")
    load_user_env()
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    sys.exit(subprocess.call([sys.executable, script, *sys.argv[2:]], cwd=SCRIPTS))


if __name__ == "__main__":
    main()
