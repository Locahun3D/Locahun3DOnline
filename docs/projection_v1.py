"""
ロケハン3D オンライン — 物件数 × 収益試算 (v0.1)

このスクリプトは事業計画 PDF を生成します。
日本語フォントは reportlab 標準の CID フォント (HeiseiKakuGo-W5 / HeiseiMin-W3) を使用。

実行:
    cd F:/Htlml/3DGS/locahun3d_online
    python docs/projection_v1.py

出力:
    docs/business_projection_v1.pdf
"""

from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    PageBreak,
    Table,
    TableStyle,
    KeepTogether,
)

# ── Fonts ────────────────────────────────────────────────────────────────────
pdfmetrics.registerFont(UnicodeCIDFont("HeiseiKakuGo-W5"))  # sans
pdfmetrics.registerFont(UnicodeCIDFont("HeiseiMin-W3"))     # serif
SANS = "HeiseiKakuGo-W5"
SERIF = "HeiseiMin-W3"

# ── Brand colours ────────────────────────────────────────────────────────────
INK    = colors.HexColor("#171717")
MUTED  = colors.HexColor("#666666")
LINE   = colors.HexColor("#dcdcdc")
ACCENT = colors.HexColor("#d27800")  # darker shade for print legibility
BG_ALT = colors.HexColor("#f7f4ec")

# ── Styles ───────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

s_title = ParagraphStyle(
    "Title", parent=styles["Title"],
    fontName=SERIF, fontSize=26, leading=34,
    textColor=INK, alignment=0, spaceAfter=4,
)
s_subtitle = ParagraphStyle(
    "Subtitle", parent=styles["Normal"],
    fontName=SANS, fontSize=11, leading=16,
    textColor=MUTED, alignment=0, spaceAfter=20,
)
s_h1 = ParagraphStyle(
    "H1", parent=styles["Heading1"],
    fontName=SERIF, fontSize=18, leading=24,
    textColor=INK, spaceBefore=4, spaceAfter=10,
)
s_h2 = ParagraphStyle(
    "H2", parent=styles["Heading2"],
    fontName=SANS, fontSize=12, leading=18,
    textColor=ACCENT, spaceBefore=14, spaceAfter=6,
)
s_body = ParagraphStyle(
    "Body", parent=styles["BodyText"],
    fontName=SANS, fontSize=10, leading=16,
    textColor=INK, spaceAfter=8,
)
s_small = ParagraphStyle(
    "Small", parent=styles["BodyText"],
    fontName=SANS, fontSize=8.5, leading=13,
    textColor=MUTED, spaceAfter=6,
)
s_callout = ParagraphStyle(
    "Callout", parent=styles["BodyText"],
    fontName=SANS, fontSize=10, leading=16,
    textColor=INK, leftIndent=10, borderColor=ACCENT, borderWidth=0, spaceAfter=8,
)
s_meta = ParagraphStyle(
    "Meta", parent=styles["Normal"],
    fontName=SANS, fontSize=9, leading=12,
    textColor=MUTED,
)

# ── Helpers ──────────────────────────────────────────────────────────────────
def yen(n):
    return f"¥{n:,.0f}"

def manen(n):
    """Format JPY into 万 (10k) units for compact display: 350,000 -> 35万"""
    if n == 0:
        return "—"
    if n >= 100_000_000:
        return f"{n/100_000_000:.2f}億"
    if n >= 10_000:
        return f"{n/10_000:,.0f}万"
    return f"{n:,.0f}"

def base_table(data, col_widths, header_bg=ACCENT, header_color=colors.white,
               first_col_align="LEFT", body_font_size=9.5, header_font_size=9):
    """Build a Table with consistent styling."""
    t = Table(data, colWidths=col_widths)
    style = [
        ("FONTNAME",   (0, 0), (-1, -1), SANS),
        ("FONTSIZE",   (0, 0), (-1, 0),  header_font_size),
        ("FONTSIZE",   (0, 1), (-1, -1), body_font_size),
        ("BACKGROUND", (0, 0), (-1, 0),  header_bg),
        ("TEXTCOLOR",  (0, 0), (-1, 0),  header_color),
        ("ALIGN",      (0, 0), (0, -1),  first_col_align),
        ("ALIGN",      (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN",      (0, 0), (-1, 0),  "CENTER"),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("GRID",       (0, 0), (-1, -1), 0.4, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG_ALT]),
    ]
    t.setStyle(TableStyle(style))
    return t

# ── Page templates / header & footer ─────────────────────────────────────────
def header_footer(canvas, doc):
    canvas.saveState()
    # Header rule
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.4)
    canvas.line(20*mm, A4[1] - 15*mm, A4[0] - 20*mm, A4[1] - 15*mm)
    canvas.setFont(SANS, 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(20*mm, A4[1] - 12*mm, "LOCAHUN 3D / ONLINE — REVENUE PROJECTION v0.1")
    canvas.drawRightString(A4[0] - 20*mm, A4[1] - 12*mm, "INTERNAL — 2026-05-23")

    # Footer
    canvas.line(20*mm, 15*mm, A4[0] - 20*mm, 15*mm)
    canvas.drawString(20*mm, 10*mm, "ロケハン3D オンライン")
    canvas.drawRightString(A4[0] - 20*mm, 10*mm, f"Page {doc.page}")
    canvas.restoreState()

# ── Document content ─────────────────────────────────────────────────────────

# Assumptions tables -----------------------------------------------------------

PLAN_ARPU_TABLE = [
    ["プラン", "月額 (¥)", "年額 ARPU (¥)", "備考"],
    ["Free",        "0",      "0",       "無料、写真と図面まで。3DGS 不可"],
    ["Individual",  "5,200",  "62,400",  "3DGS 月 3 件、図面 DL 無制限"],
    ["Team",        "29,800", "357,600", "3DGS 月 20 件、20 端末、データ DL 20% OFF"],
]

PROPERTY_GROWTH_TABLE = [
    ["フェーズ", "Y1 (2027)", "Y2 (2028)", "Y3 (2029)"],
    ["物件数 (累計)",       "100",      "600",      "2,000"],
    ["新規追加",            "100",      "500",      "1,400"],
    ["主要エリア",          "東京",     "東京+大阪", "首都圏+関西+地方"],
    ["スキャン費 / 物件",   "¥50,000",  "¥50,000",  "¥50,000"],
    ["スキャン費 (年内)",   "¥5M",      "¥25M",     "¥70M"],
]

# Subscriber counts at year-end (paying users only)
SCENARIOS = {
    "保守的": {"Y1": (50, 5),    "Y2": (200, 30),    "Y3": (800, 100)},
    "基本":   {"Y1": (100, 10),  "Y2": (600, 80),    "Y3": (3000, 300)},
    "楽観的": {"Y1": (250, 25),  "Y2": (1500, 200),  "Y3": (8000, 800)},
}

def arr_row(scenario_name, years):
    row = [scenario_name]
    for y in ["Y1", "Y2", "Y3"]:
        indiv, team = years[y]
        arr = indiv * 62400 + team * 357600
        row.append(manen(arr))
    return row

ARR_TABLE = [
    ["シナリオ", "Y1 ARR", "Y2 ARR", "Y3 ARR"],
] + [arr_row(name, ys) for name, ys in SCENARIOS.items()]

def mrr_row(scenario_name, years):
    row = [scenario_name]
    for y in ["Y1", "Y2", "Y3"]:
        indiv, team = years[y]
        mrr = indiv * 5200 + team * 29800
        row.append(manen(mrr))
    return row

MRR_TABLE = [
    ["シナリオ", "Y1 MRR", "Y2 MRR", "Y3 MRR"],
] + [mrr_row(name, ys) for name, ys in SCENARIOS.items()]

# Subscriber breakdown
SUB_BREAKDOWN = [["シナリオ × プラン", "Y1", "Y2", "Y3"]]
for name in ["保守的", "基本", "楽観的"]:
    ys = SCENARIOS[name]
    SUB_BREAKDOWN.append([
        f"{name} / Individual",
        f"{ys['Y1'][0]:,}",
        f"{ys['Y2'][0]:,}",
        f"{ys['Y3'][0]:,}",
    ])
    SUB_BREAKDOWN.append([
        f"{name} / Team",
        f"{ys['Y1'][1]:,}",
        f"{ys['Y2'][1]:,}",
        f"{ys['Y3'][1]:,}",
    ])

# Y3 Base scenario detailed revenue
Y3_BASE_INDIV = 3000
Y3_BASE_TEAM  = 300
Y3_BASE_ARR_INDIV = Y3_BASE_INDIV * 62400
Y3_BASE_ARR_TEAM  = Y3_BASE_TEAM  * 357600
Y3_BASE_ARR = Y3_BASE_ARR_INDIV + Y3_BASE_ARR_TEAM
Y3_BASE_MRR = Y3_BASE_ARR / 12

Y3_REVENUE_DETAIL = [
    ["項目",          "ユーザー数",     "単価 / 月", "MRR",                       "ARR"],
    ["Individual",    f"{Y3_BASE_INDIV:,}",   "¥5,200",  yen(Y3_BASE_INDIV * 5200),  yen(Y3_BASE_ARR_INDIV)],
    ["Team",          f"{Y3_BASE_TEAM:,}",    "¥29,800", yen(Y3_BASE_TEAM * 29800),  yen(Y3_BASE_ARR_TEAM)],
    ["合計",          "—",                    "—",       yen(Y3_BASE_MRR),           yen(Y3_BASE_ARR)],
]

# Y3 cost structure (Base scenario)
Y3_COSTS = [
    ["コスト項目",                     "年額 (¥)",  "備考"],
    ["Cloudflare R2 + Workers + D1",   yen(240_000),     "1TB ストレージ + 月 5M req"],
    ["Clerk MAU (30,000 想定)",        yen(1_080_000),   "$0.02 × 30,000 × 12 × 150円"],
    ["Stripe 決済手数料",              yen(10_600_000),  "ARR × 3.6%"],
    ["技術小計",                       yen(11_920_000),  ""],
    ["スキャン制作 (1,400 物件)",      yen(70_000_000),  "PortalCam 外注 / 1 件 ¥50k"],
    ["人件費 (5 名想定)",              yen(36_000_000),  "代表 + エンジニア 2 + 営業 2"],
    ["マーケティング (ARR の 10%)",    yen(29_500_000),  "広告 + コンテンツ + イベント"],
    ["コスト合計",                     yen(147_420_000), ""],
    ["営業利益",                       yen(int(Y3_BASE_ARR) - 147_420_000), "営業利益率 約 50%"],
]

# ── Build PDF ────────────────────────────────────────────────────────────────

def build(path: Path) -> None:
    doc = SimpleDocTemplate(
        str(path),
        pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=22*mm, bottomMargin=20*mm,
        title="ロケハン3D オンライン 物件数×収益試算 v0.1",
        author="ロケハン3D",
    )
    story = []

    # ── 表紙 ───────────────────────────────────────────────────────────────
    story.append(Spacer(1, 60*mm))
    story.append(Paragraph("LOCAHUN 3D / ONLINE", s_meta))
    story.append(Spacer(1, 4))
    story.append(Paragraph("物件数 × 収益試算", s_title))
    story.append(Paragraph(
        "現行サブスクプラン (Free / Individual ¥5,200 / Team ¥29,800) を前提とした、"
        "3 年スパンでの物件供給数・有料会員数・MRR / ARR・営業利益の試算ドキュメント。",
        s_subtitle,
    ))
    story.append(Spacer(1, 30*mm))
    cover_meta = [
        ["バージョン",     "v0.1 (early draft)"],
        ["作成日",         "2026-05-23"],
        ["前提プラン",     "Free / Individual ¥5,200/月 / Team ¥29,800/月"],
        ["対象期間",       "Y1 (2027) — Y3 (2029)"],
        ["主要前提",       "Tokyo→大阪→全国の段階展開、SaaS チャーン仮定"],
    ]
    t = Table(cover_meta, colWidths=[35*mm, 130*mm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), SANS),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
    ]))
    story.append(t)
    story.append(PageBreak())

    # ── エグゼクティブ・サマリー ──────────────────────────────────────────
    story.append(Paragraph("エグゼクティブ・サマリー", s_h1))
    story.append(Paragraph(
        "3 年後 (Y3 / 2029 年度末) 時点で、基本シナリオでは "
        f"<b>{manen(Y3_BASE_ARR)} ARR (約 {yen(Y3_BASE_ARR)})</b> "
        "を狙える試算。供給側は累計 2,000 物件、需要側は有料会員 Individual 3,000 名 + Team 300 社。",
        s_body,
    ))

    story.append(Paragraph("Y3 ARR — 3 シナリオ比較", s_h2))
    story.append(base_table(ARR_TABLE, [40*mm, 35*mm, 35*mm, 50*mm]))

    story.append(Spacer(1, 8))
    story.append(Paragraph("Y3 MRR — 3 シナリオ比較", s_h2))
    story.append(base_table(MRR_TABLE, [40*mm, 35*mm, 35*mm, 50*mm]))

    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "■ <b>保守的</b>: 個人クリエイター中心、Team 契約は限定的。MRR ¥7M、ARR 約 8,570 万円。<br/>"
        "■ <b>基本</b>: Tokyo / Osaka でプロダクション層に浸透、ニッチ SaaS として黒字化。<br/>"
        "■ <b>楽観的</b>: 業界標準のプリビズツールとして定着。Team 契約が大手プロダクションに普及。",
        s_small,
    ))

    story.append(PageBreak())

    # ── 前提プラン ─────────────────────────────────────────────────────────
    story.append(Paragraph("1. 前提プラン (現行 /pricing 構成)", s_h1))
    story.append(Paragraph(
        "本試算は 2026-05-23 時点の /pricing 公開価格を前提とする。"
        "解約率・コンバージョン率は SaaS 業界平均 (Indiv: 月 5%、Team: 月 2%) を仮定。",
        s_body,
    ))
    story.append(base_table(PLAN_ARPU_TABLE, [30*mm, 25*mm, 30*mm, 80*mm]))

    story.append(Paragraph("LTV / CAC の目安", s_h2))
    story.append(Paragraph(
        "Individual: 月額 ¥5,200 × 平均継続 20 ヶ月 ≒ <b>LTV ¥104,000</b><br/>"
        "Team: 月額 ¥29,800 × 平均継続 50 ヶ月 ≒ <b>LTV ¥1,490,000</b><br/>"
        "CAC は LTV の 1/3 以下 (Indiv ≦ ¥35,000 / Team ≦ ¥500,000) を目標とする。",
        s_body,
    ))

    story.append(PageBreak())

    # ── 供給サイド (物件数計画) ────────────────────────────────────────────
    story.append(Paragraph("2. 供給サイド — 物件数計画", s_h1))
    story.append(Paragraph(
        "物件供給は需要にやや先行させる。Y1 はキュレーション重視 (100 物件)、"
        "Y2 は東京で 500 物件追加し、Osaka に展開開始。"
        "Y3 で首都圏外を含め累計 2,000 物件を目指す。スキャンは PortalCam を外注 / 自社で組み合わせ。",
        s_body,
    ))
    story.append(base_table(PROPERTY_GROWTH_TABLE, [38*mm, 35*mm, 35*mm, 55*mm]))

    story.append(Paragraph("市場サイド仮説", s_h2))
    story.append(Paragraph(
        "■ 日本の商業利用可能な「撮影に使えるロケーション」は推定 3,000〜5,000 件 (スタジオ協会等から推定)。<br/>"
        "■ 我々が狙う SOM (Serviceable Obtainable Market) はそのうち約 2,000 件 = <b>市場の約 50% 網羅</b>を Y3 目標。<br/>"
        "■ オンライン版でカタログ化することで、撮影者の検索体験を改善し、スタジオ稼働率の向上にも貢献。",
        s_small,
    ))

    story.append(PageBreak())

    # ── 需要サイド (シナリオ別ユーザー数) ─────────────────────────────────
    story.append(Paragraph("3. 需要サイド — 有料会員シナリオ", s_h1))
    story.append(Paragraph(
        "3 シナリオの有料会員数 (年末時点)。Free 会員は表示せず、課金会員のみカウント。"
        "コンバージョン率 (Free→有料) は Indiv 3〜5%、Team は 0.3〜0.8% を想定。",
        s_body,
    ))
    story.append(base_table(SUB_BREAKDOWN, [55*mm, 32*mm, 32*mm, 32*mm]))

    story.append(Paragraph("シナリオの背景", s_h2))
    story.append(Paragraph(
        "■ <b>保守的</b>: マーケ予算ほぼゼロでオーガニック流入のみ。スタジオ運営者からの紹介中心。<br/>"
        "■ <b>基本</b>: 撮影現場メディア (PRONEWS / VIDEO SALON 等) との連携 + SNS マーケ。"
        "業界カンファレンス出展あり。<br/>"
        "■ <b>楽観的</b>: 大手代理店 / プロダクションが標準ツールとして社内導入。"
        "海外プロダクションの来日ロケでも利用 (英語版を提供前提)。",
        s_small,
    ))

    story.append(PageBreak())

    # ── 収益試算 (Y3 基本シナリオ詳細) ─────────────────────────────────────
    story.append(Paragraph("4. 収益試算 — Y3 (2029) 基本シナリオ詳細", s_h1))
    story.append(Paragraph(
        "基本シナリオの Y3 時点での MRR / ARR 内訳。Team プランの ARPU は Individual の約 5.7 倍だが、"
        "顧客数が 1/10 程度のため、収益貢献は Individual : Team = 約 64 : 36 となる。",
        s_body,
    ))
    story.append(base_table(Y3_REVENUE_DETAIL, [30*mm, 28*mm, 25*mm, 35*mm, 38*mm]))

    story.append(Spacer(1, 4))
    story.append(Paragraph(
        f"<b>合計 ARR: {yen(Y3_BASE_ARR)} (約 {manen(Y3_BASE_ARR)})</b> / "
        f"MRR {yen(int(Y3_BASE_MRR))} (約 {manen(int(Y3_BASE_MRR))})",
        s_callout,
    ))

    story.append(PageBreak())

    # ── 損益試算 ───────────────────────────────────────────────────────────
    story.append(Paragraph("5. 損益試算 — Y3 基本シナリオ", s_h1))
    story.append(Paragraph(
        "Y3 ARR 約 2.94 億円に対する主要コスト構造。スキャン制作は最大コストだが、"
        "1 度撮影すれば資産として残るため、4 年目以降は減衰する。"
        "営業利益率は <b>約 50%</b> と試算 — SaaS としては良好。",
        s_body,
    ))
    story.append(base_table(Y3_COSTS, [55*mm, 35*mm, 70*mm]))

    story.append(Paragraph("コスト構造の特徴", s_h2))
    story.append(Paragraph(
        "■ <b>スキャン制作費</b>: Y3 で年 ¥70M と最大。"
        "資産性が高く、4 年目以降は新規追加 + メンテで年 ¥10-20M 程度に減衰する想定。<br/>"
        "■ <b>Stripe 手数料 3.6%</b>: ARR の 3.6% を強制的に持っていかれる構造。"
        "Y3 時点で月 ¥88 万。海外決済が増えれば手数料も上がる。<br/>"
        "■ <b>Cloudflare コスト</b>: R2 は egress 無料が効く。"
        "100 GB / 月の閲覧アクセスでも追加課金なし。SaaS スタックの正解。",
        s_small,
    ))

    story.append(PageBreak())

    # ── 感度分析 ────────────────────────────────────────────────────────────
    story.append(Paragraph("6. 感度分析 — 何が動くと数字が動くか", s_h1))
    story.append(Paragraph(
        "本試算で最も影響の大きい変数 (上から順)。"
        "現実の経営判断はこの 4 つに集中すべき。",
        s_body,
    ))

    sensitivity = [
        ["変数",                                "1 ポイント増の影響 (Y3 ARR)",  "コメント"],
        ["Individual の有料会員数 +100 名",   "+¥6.24M ARR",                  "コンバージョン率に最も敏感"],
        ["Team の有料会員数 +10 社",           "+¥3.58M ARR",                  "ARPU 大きく、1 社獲得の効果大"],
        ["Individual ARPU +¥500/月",          "+¥18M ARR",                    "値上げの影響は大、解約率と要トレードオフ"],
        ["3DGS 月次上限 緩和 (3→5 件)",        "解約率 -1pt 寄与 (推定)",      "上限到達ユーザーの離脱を緩和"],
        ["物件数 +500 (Y2 → 1,100)",           "間接的に CV +20% 寄与",        "選べる物件数が広告効果を高める"],
    ]
    story.append(base_table(sensitivity, [60*mm, 50*mm, 55*mm]))

    story.append(PageBreak())

    # ── 意思決定マイルストーン ─────────────────────────────────────────────
    story.append(Paragraph("7. 意思決定マイルストーン", s_h1))

    milestones = [
        ["時期",              "判断ポイント",                              "判断基準"],
        ["2026 Q4",           "Clerk + Stripe 本配線、決済開始",            "MVP 完成、初期スタジオ 30 件確保"],
        ["2027 Q1",           "Tokyo 100 物件達成 / 早期会員募集",          "MAU 500 / 有料 30 名 を 6 ヶ月で達成"],
        ["2027 Q3",           "Osaka 展開、Team プラン営業強化",            "Y1 ARR 1,000 万 を達成"],
        ["2028 Q2",           "値上げ判断 (Indiv 5,200 → 6,800?)",          "解約率が月 3% 未満で安定"],
        ["2028 Q4",           "海外展開判断 (英語版 / Stripe 多通貨)",      "国内 ARR 1 億超え + 海外引合いあり"],
        ["2029 Q4",           "シリーズ A 調達 or 黒字キープの判断",       "ARR 2.5 億超え、月次成長 5% 以上"],
    ]
    story.append(base_table(milestones, [30*mm, 60*mm, 75*mm]))

    story.append(Paragraph("補足: この試算の限界", s_h2))
    story.append(Paragraph(
        "■ 本試算は <b>需要側のみ</b> をモデル化。"
        "スタジオ運営者向けに掲載手数料 / 紹介報酬を取るモデル (将来の Marketplace 機能) は含まない。<br/>"
        "■ 3DGS データ販売 (Team 20% OFF 適用) からの収益も別計。"
        "1 件あたり ¥30,000〜200,000 想定で、Y3 で年 ¥20-50M の追加収益見込み。<br/>"
        "■ <b>解約率は実データで補正必須</b>。Y1 後半でコホート分析を行い、本試算を更新する。",
        s_small,
    ))

    # Build it
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)


if __name__ == "__main__":
    out = Path(__file__).parent / "business_projection_v1.pdf"
    build(out)
    print(f"Generated: {out}")
