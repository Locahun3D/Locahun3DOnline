"""
ロケハン3D オンライン — プロジェクト評価書 v1

現状 (v0.6 プラン + フロント実装中、Auth/Stripe/Spark 未配線) を
9 軸でスコアリングし、強み / 弱み / 優先タスクを 1 枚に集約。

実行:
    python docs/project_evaluation_v1.py
出力:
    docs/project_evaluation_v1.pdf
"""

from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
)

pdfmetrics.registerFont(UnicodeCIDFont("HeiseiKakuGo-W5"))
pdfmetrics.registerFont(UnicodeCIDFont("HeiseiMin-W3"))
SANS, SERIF = "HeiseiKakuGo-W5", "HeiseiMin-W3"

INK    = colors.HexColor("#171717")
MUTED  = colors.HexColor("#666666")
LINE   = colors.HexColor("#dcdcdc")
ACCENT = colors.HexColor("#d27800")
GREEN  = colors.HexColor("#2c6e2c")
RED    = colors.HexColor("#a83000")
BG_ALT = colors.HexColor("#f7f4ec")

styles = getSampleStyleSheet()
s_title = ParagraphStyle("Title", parent=styles["Title"], fontName=SERIF, fontSize=26, leading=34, textColor=INK, spaceAfter=4)
s_sub   = ParagraphStyle("Sub", parent=styles["Normal"], fontName=SANS, fontSize=11, leading=16, textColor=MUTED, spaceAfter=20)
s_h1    = ParagraphStyle("H1", parent=styles["Heading1"], fontName=SERIF, fontSize=18, leading=24, textColor=INK, spaceBefore=4, spaceAfter=10)
s_h2    = ParagraphStyle("H2", parent=styles["Heading2"], fontName=SANS, fontSize=12, leading=18, textColor=ACCENT, spaceBefore=14, spaceAfter=6)
s_body  = ParagraphStyle("Body", parent=styles["BodyText"], fontName=SANS, fontSize=10, leading=16, textColor=INK, spaceAfter=8)
s_small = ParagraphStyle("Small", parent=styles["BodyText"], fontName=SANS, fontSize=8.5, leading=13, textColor=MUTED, spaceAfter=6)
s_call  = ParagraphStyle("Call", parent=styles["BodyText"], fontName=SANS, fontSize=10, leading=16, textColor=INK, leftIndent=10, spaceAfter=8)
s_meta  = ParagraphStyle("Meta", parent=styles["Normal"], fontName=SANS, fontSize=9, leading=12, textColor=MUTED)

def base_table(data, col_widths, header_bg=ACCENT, header_color=colors.white,
               body_font_size=9.5, header_font_size=9):
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("FONTNAME", (0,0), (-1,-1), SANS),
        ("FONTSIZE", (0,0), (-1,0), header_font_size),
        ("FONTSIZE", (0,1), (-1,-1), body_font_size),
        ("BACKGROUND", (0,0), (-1,0), header_bg),
        ("TEXTCOLOR", (0,0), (-1,0), header_color),
        ("ALIGN", (0,0), (0,-1), "LEFT"),
        ("ALIGN", (1,0), (-1,-1), "LEFT"),
        ("ALIGN", (0,0), (-1,0), "CENTER"),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("GRID", (0,0), (-1,-1), 0.4, LINE),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, BG_ALT]),
    ]))
    return t

def scorecard_table(rows):
    """Render scorecard with visual bar in score column."""
    data = [["軸", "スコア", "視覚化", "コメント"]]
    for label, score, comment in rows:
        filled = "█" * score
        empty = "░" * (10 - score)
        data.append([label, f"{score}/10", filled + empty, comment])
    t = Table(data, colWidths=[35*mm, 18*mm, 38*mm, 75*mm])
    style = [
        ("FONTNAME", (0,0), (-1,-1), SANS),
        ("FONTSIZE", (0,0), (-1,0), 9),
        ("FONTSIZE", (0,1), (-1,-1), 9.5),
        ("BACKGROUND", (0,0), (-1,0), ACCENT),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("ALIGN", (0,0), (-1,0), "CENTER"),
        ("ALIGN", (0,1), (0,-1), "LEFT"),
        ("ALIGN", (1,1), (1,-1), "RIGHT"),
        ("ALIGN", (2,1), (2,-1), "LEFT"),
        ("ALIGN", (3,1), (3,-1), "LEFT"),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("GRID", (0,0), (-1,-1), 0.4, LINE),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, BG_ALT]),
    ]
    # Color the bar column by score
    for i, (_, score, _) in enumerate(rows, start=1):
        if score >= 8:    color = GREEN
        elif score >= 6:  color = ACCENT
        else:              color = RED
        style.append(("TEXTCOLOR", (2, i), (2, i), color))
        style.append(("FONTNAME", (2, i), (2, i), "Courier"))
    t.setStyle(TableStyle(style))
    return t

def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE); canvas.setLineWidth(0.4)
    canvas.line(20*mm, A4[1]-15*mm, A4[0]-20*mm, A4[1]-15*mm)
    canvas.setFont(SANS, 7.5); canvas.setFillColor(MUTED)
    canvas.drawString(20*mm, A4[1]-12*mm, "LOCAHUN 3D / ONLINE — PROJECT EVALUATION v1")
    canvas.drawRightString(A4[0]-20*mm, A4[1]-12*mm, "INTERNAL — 2026-05-24")
    canvas.line(20*mm, 15*mm, A4[0]-20*mm, 15*mm)
    canvas.drawString(20*mm, 10*mm, "ロケハン3D オンライン")
    canvas.drawRightString(A4[0]-20*mm, 10*mm, f"Page {doc.page}")
    canvas.restoreState()

# ── Scorecard data ──────────────────────────────────────────────────────────
SCORECARD = [
    ("技術基盤",        7, "フロント完成度高い、Spark/Auth/DB 未配線"),
    ("プラン設計",      9, "5 段 + トークン + 副収益、業界実感に合致"),
    ("数字の現実味",    7, "v0.6 は妥当、実 cohort 未取得"),
    ("差別化",          8, "3DGS は国内唯一無二"),
    ("実行可能性",      6, "デモ可、課金できない、ビューア未動作"),
    ("キャッシュフロー", 8, "Y3 黒字、自己資金で完結"),
    ("Exit 期待値",     6, "¥5億は手堅いが大成功ではない"),
    ("創業者リスク",    8, "本業並走で耐久性高い"),
    ("競合耐性",        5, "法的・契約モート弱い"),
]
TOTAL = sum(s for _, s, _ in SCORECARD) * 100 // (10 * len(SCORECARD))


def build(path: Path) -> None:
    doc = SimpleDocTemplate(
        str(path), pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm, topMargin=22*mm, bottomMargin=20*mm,
        title="ロケハン3D オンライン プロジェクト評価書 v1",
        author="ロケハン3D",
    )
    story = []

    # ── Cover ──────────────────────────────────────────────────────────────
    story.append(Spacer(1, 55*mm))
    story.append(Paragraph("LOCAHUN 3D / ONLINE", s_meta))
    story.append(Spacer(1, 4))
    story.append(Paragraph("プロジェクト評価書 v1", s_title))
    story.append(Paragraph(
        f"v0.6 プラン + 現フロント実装の状況を 9 軸でスコアリング。"
        f"<b>総合 {TOTAL}/100 (B+)</b>。設計は堅実、実行と検証が次の山。",
        s_sub,
    ))
    story.append(Spacer(1, 30*mm))
    meta = [
        ["評価バージョン", "v1 (2026-05-24)"],
        ["対象", "v0.6 売上予想 + 現 フロント実装 + 既存 web/pricing"],
        ["評価軸数", "9"],
        ["総合スコア", f"{TOTAL}/100  ≒ B+"],
        ["判定", "ブートストラップで進行 OK、3DGS ビューア本実装が最優先"],
    ]
    t = Table(meta, colWidths=[42*mm, 123*mm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0,0), (-1,-1), SANS),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("TEXTCOLOR", (0,0), (0,-1), MUTED),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LINEBELOW", (0,0), (-1,-1), 0.4, LINE),
    ]))
    story.append(t)
    story.append(PageBreak())

    # ── Executive Summary ─────────────────────────────────────────────────
    story.append(Paragraph("エグゼクティブサマリー", s_h1))
    story.append(Paragraph(
        "<b>現状は「設計はほぼ完成、実行は半分」</b>。プラン構造 (5 段 + 副収益) と"
        "技術選定は健全で、ブートストラップ垂直 SaaS の教科書例と言える品質。"
        "ただし中核機能 (3DGS ビューア本体) が未稼働、課金が走らない、サプライ獲得"
        "戦略が具体化していない、の 3 点が今すぐ着手すべき急所。",
        s_body,
    ))

    story.append(Paragraph("プロジェクトを 1 つの数字で言うと", s_h2))
    story.append(Paragraph(
        f"<b>{TOTAL}/100 (B+)</b>。実行リスク (-22pt) を埋めれば A 評価。"
        "VC からは Pass (TAM 小、成長率上限見える) だが、"
        "Angel / PE 視点では魅力的なキャッシュフロー優良案件。",
        s_call,
    ))

    story.append(PageBreak())

    # ── Scorecard ──────────────────────────────────────────────────────────
    story.append(Paragraph("1. 9 軸スコアカード", s_h1))
    story.append(scorecard_table(SCORECARD))

    story.append(Paragraph(
        f"合計 {sum(s for _, s, _ in SCORECARD)}/90 = {TOTAL}/100",
        s_call,
    ))

    story.append(PageBreak())

    # ── Strengths ──────────────────────────────────────────────────────────
    story.append(Paragraph("2. 強み (このまま行ける部分)", s_h1))

    strengths = [
        ("① プラン構造が良い",
         "5 段 + 副収益 = ARPU 階段とリスク分散の両立。"
         "トークン制で「重い物件 = 高い消費」の経済が直感的。"
         "年払 -15% で CF 前倒し。データ販売・優先表示・スポンサー = 3 つの粗利 95%+ レイヤー。"),
        ("② ブートストラップ耐久性が高い",
         "Y3 で OP ¥76M、margin 55% (SaaS 最上位)。自己資金で黒字化、VC 不要。"
         "中村さん本業 (スタジオ) との並走可能。失敗時のダメージが小さい。"),
        ("③ 技術選定が筋良い",
         "Cloudflare スタック (R2 egress 無料が大容量 splat 配信で効く)、"
         "Next.js 16 (将来の React Native 流用、SEO)、Clerk + Stripe (実装簡単)、"
         "Spark 2.0 (既存実績あり)。負債が少ない。"),
        ("④ サプライサイド優位",
         "中村さん自身が PortalCam 撮影できる = 立ち上げ期の物件確保が早い。"
         "スタジオ業界の人脈 = 初期営業がやりやすい。"
         "機材メーカースポンサーも個人ネットワークで動ける。"),
    ]
    for h, p in strengths:
        story.append(Paragraph(f"<font color='#2c6e2c'>✓</font> <b>{h}</b>", s_body))
        story.append(Paragraph(p, s_small))

    story.append(PageBreak())

    # ── Weaknesses ─────────────────────────────────────────────────────────
    story.append(Paragraph("3. 弱み・リスク (今のうちに対処)", s_h1))

    weaknesses = [
        ("🔴 最大の未解決: 3DGS ビューア本体",
         "src/components/splat-viewer.tsx は placeholder のまま。"
         "中核機能が未実装 = 「3DGS で下見できる」という売りが立証されていない。"
         "全プランの存在意義がここにかかる。最優先で着手すべき。"),
        ("🔴 検証データがゼロ",
         "解約率、Free→Indiv CV、優先表示の取得率、データ販売件数 — すべて仮定値。"
         "Y1 末で実 cohort を取得して v0.7 に校正しないと、v0.6 は希望的観測。"),
        ("🟡 サプライ獲得戦略が不明確",
         "「500 物件」と書いているが、500 スタジオに「掲載させてください」を"
         "どう交渉するか未定。スタジオ側の動機 = 集客 だが、初期は集客になる証拠がない (鶏卵問題)。"
         "初期 20 物件は中村さんの人脈でカバーするとして、それ以降のスケール戦略がない。"),
        ("🟡 法的モートが弱い",
         "3DGS データ著作権の帰属 (スタジオ vs ロケハン3D vs 撮影者) が未整理。"
         "スキャン時のスタジオとの契約テンプレ未整備。"
         "データ販売の二次利用範囲が明文化されていない。"
         "競合の copy 防止策 (排他契約) なし。弁護士相談 + 契約ひな型整備が必須。"),
        ("🟡 競合耐性",
         "Spacemarket (¥30M 月次予約) が「3DGS 機能を追加」したら一気に negatable。"
         "Matterport が日本市場に本格進出したら B2C 価格戦争。"
         "防御策: 「ロケハン特化」のブランド化 + 物件オーナーとの長期独占契約。"),
        ("🟠 サブスク UI/UX で未実装",
         "ログイン後ダッシュボード (今月のトークン残量、利用履歴) なし。"
         "アップグレード導線 (トークン上限到達時の即時アップグレード) なし。"
         "「課金後に何が起きるか」が想像できないと CV が落ちる。"),
    ]
    for h, p in weaknesses:
        story.append(Paragraph(f"<b>{h}</b>", s_body))
        story.append(Paragraph(p, s_small))

    story.append(PageBreak())

    # ── VC perspective ─────────────────────────────────────────────────────
    story.append(Paragraph("4. 「もし私が投資家なら」の視点", s_h1))

    vc = [
        ["投資家タイプ", "判定",    "理由"],
        ["VC (シリーズ A 以降)", "Pass",
         "TAM 小 (撮影業界 SaaS は ¥5-10B)、成長率上限が見える (3-5 年で頭打ち)、ネットワーク効果弱い"],
        ["Seed VC",              "条件付き",
         "創業者背景 (撮影業界 PortalCam 実績) + 3DGS の独自性は評価。ただし国内バーティカル特化のため過半数の VC は降りる"],
        ["Angel (個人)",          "Yes",
         "ARR ¥1.4億 / margin 55% のキャッシュフロー、3-5 年で 2-3x の現実的なリターン"],
        ["PE (中規模)",           "Y3 後 Yes",
         "ARR 1 億超え + 黒字化後、Buy-and-build のロールアップ候補"],
        ["事業会社 (戦略買収)",   "Y3-5 で Yes",
         "リクルート / Adobe / Sony / 大手プロダクションがバーティカル買収候補"],
    ]
    story.append(base_table(vc, [38*mm, 30*mm, 95*mm]))

    story.append(Paragraph(
        "<b>結論</b>: VC 向きではない。"
        "<b>「優良中小企業」or「PE/事業会社の M&A 候補」</b>として育てるのが正解。"
        "それは既にプランに織り込まれている (パス A: Bootstrap → Y7-8 で ¥15-25億 Exit)。",
        s_call,
    ))

    story.append(PageBreak())

    # ── Top 3 priorities ───────────────────────────────────────────────────
    story.append(Paragraph("5. 次にやるべき 3 つ (優先度順)", s_h1))

    pri = [
        ["#", "アクション", "期間", "効果"],
        ["🥇 ①",
         "Spark 2.0 ビューア本実装",
         "2-3 週間",
         "プランの根幹が動く。1 物件でいいから本物の 3DGS が browser で動く状態に。"
         "FPS チューニングは既存メモ参照"],
        ["🥈 ②",
         "Clerk + Stripe 配線",
         "1-2 週間",
         "課金できる状態 → 最初の有料ユーザー (知人 OK) で仮説検証。"
         "Stripe webhook → Clerk publicMetadata 同期"],
        ["🥉 ③",
         "初期スタジオ 5-10 軒の獲得",
         "並行 / 継続",
         "中村さん本業ネットワークで鶏卵問題を破る。「無料掲載 + 無料スキャン」と"
         "「6 ヶ月独占 + データ販売シェア 50%」を交換"],
    ]
    story.append(base_table(pri, [12*mm, 50*mm, 22*mm, 80*mm]))

    story.append(Paragraph("「やらない」べきこと", s_h2))
    story.append(Paragraph(
        "■ <b>海外展開 (Y3 まで)</b>: 国内で PMF 取れてから<br/>"
        "■ <b>VC 調達</b>: 不要、希薄化メリットなし<br/>"
        "■ <b>マーケットプレイス (取引手数料)</b>: Y4 以降、SaaS 単体で黒字化してから<br/>"
        "■ <b>3DGS アノテーション本実装</b>: 既存サービス参照で OK、ユーザー方針通り後回し<br/>"
        "■ <b>Studio プラン以上の値上げ (Y2 末まで)</b>: PMF データが揃ってから",
        s_small,
    ))

    story.append(PageBreak())

    # ── One-liner summary ──────────────────────────────────────────────────
    story.append(Paragraph("6. 一言で", s_h1))
    story.append(Paragraph(
        "<b>「2026 年版の手堅いブートストラップ垂直 SaaS の教科書例」</b>。"
        "設計は良くできている。あとは",
        s_body,
    ))
    story.append(Paragraph(
        "(a) <b>ビューア本体を動かす</b>、(b) <b>1 人目の有料ユーザーで仮説検証</b>、"
        "(c) <b>5 軒のスタジオで物件サプライを確保</b>",
        s_call,
    ))
    story.append(Paragraph(
        "の 3 つに集中して、6 ヶ月後に実データで v0.7 を作るのが本筋。"
        "v0.6 の数字 (Y3 ARR ¥1.38億 / 営業利益 ¥76M / 代表 net ¥23M) は"
        "「うまく行った場合の現実的な天井」として参照する。",
        s_body,
    ))

    story.append(Paragraph("評価バージョン履歴", s_h2))
    history = [
        ["時期",      "次のマイルストーン",                                    "再評価でアップデートしたい指標"],
        ["2026-09",    "v0.7 = Y1 後半 実 cohort 反映",                         "Free→有料 CV、月次解約率"],
        ["2027-03",    "v0.8 = Y2 中間、Pass tier 復活検討",                    "Studio 落とし離脱率、データ販売単価"],
        ["2027-12",    "v0.9 = Y2 締め、海外展開検討",                          "英語版 ROI、Sponsor 契約数"],
        ["2028-12",    "v1.0 = Y3 締め、M&A 打診の有無を判断",                  "実 ARR、買い手候補との会話実績"],
    ]
    story.append(base_table(history, [22*mm, 65*mm, 80*mm]))

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)


if __name__ == "__main__":
    out = Path(__file__).parent / "project_evaluation_v1.pdf"
    build(out)
    print(f"Generated: {out}")
