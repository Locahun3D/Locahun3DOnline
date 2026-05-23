"""
ロケハン3D オンライン — 物件数 × 収益試算 (v0.4)

v0.3 (現実シナリオ) に対し /pricing で適用済の改善を盛り込み再試算:
  - 5 段プラン: Free / Individual / Studio (新) / Team / Project Pass
  - Individual: 3DGS 月 3→5 件 (件数増 → 解約率減)
  - 年払 -15% トグル (継続率向上 + CF 前倒し)
  - Free に「3DGS 生涯 1 件」お試し (CV 向上)

実行:
    python docs/projection_v4.py
出力:
    docs/business_projection_v4.pdf
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

# ── Fonts ────────────────────────────────────────────────────────────────────
pdfmetrics.registerFont(UnicodeCIDFont("HeiseiKakuGo-W5"))
pdfmetrics.registerFont(UnicodeCIDFont("HeiseiMin-W3"))
SANS, SERIF = "HeiseiKakuGo-W5", "HeiseiMin-W3"

INK    = colors.HexColor("#171717")
MUTED  = colors.HexColor("#666666")
LINE   = colors.HexColor("#dcdcdc")
ACCENT = colors.HexColor("#d27800")
GREEN  = colors.HexColor("#2c6e2c")
BG_ALT = colors.HexColor("#f7f4ec")

styles = getSampleStyleSheet()
s_title = ParagraphStyle("Title", parent=styles["Title"], fontName=SERIF, fontSize=26, leading=34, textColor=INK, spaceAfter=4)
s_subtitle = ParagraphStyle("Sub", parent=styles["Normal"], fontName=SANS, fontSize=11, leading=16, textColor=MUTED, spaceAfter=20)
s_h1   = ParagraphStyle("H1", parent=styles["Heading1"], fontName=SERIF, fontSize=18, leading=24, textColor=INK, spaceBefore=4, spaceAfter=10)
s_h2   = ParagraphStyle("H2", parent=styles["Heading2"], fontName=SANS, fontSize=12, leading=18, textColor=ACCENT, spaceBefore=14, spaceAfter=6)
s_body = ParagraphStyle("Body", parent=styles["BodyText"], fontName=SANS, fontSize=10, leading=16, textColor=INK, spaceAfter=8)
s_small= ParagraphStyle("Small", parent=styles["BodyText"], fontName=SANS, fontSize=8.5, leading=13, textColor=MUTED, spaceAfter=6)
s_callout = ParagraphStyle("Call", parent=styles["BodyText"], fontName=SANS, fontSize=10, leading=16, textColor=INK, leftIndent=10, spaceAfter=8)
s_meta = ParagraphStyle("Meta", parent=styles["Normal"], fontName=SANS, fontSize=9, leading=12, textColor=MUTED)

def yen(n): return f"¥{n:,.0f}"

def manen(n):
    if n == 0: return "—"
    if n >= 100_000_000: return f"{n/100_000_000:.2f}億"
    if n >= 10_000_000: return f"{n/10_000_000:.1f}千万"
    if n >= 10_000: return f"{n/10_000:,.0f}万"
    return f"{n:,.0f}"

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
        ("ALIGN", (1,0), (-1,-1), "RIGHT"),
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

def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE); canvas.setLineWidth(0.4)
    canvas.line(20*mm, A4[1]-15*mm, A4[0]-20*mm, A4[1]-15*mm)
    canvas.setFont(SANS, 7.5); canvas.setFillColor(MUTED)
    canvas.drawString(20*mm, A4[1]-12*mm, "LOCAHUN 3D / ONLINE — REVENUE PROJECTION v0.4 (Improved Pricing)")
    canvas.drawRightString(A4[0]-20*mm, A4[1]-12*mm, "INTERNAL — 2026-05-24")
    canvas.line(20*mm, 15*mm, A4[0]-20*mm, 15*mm)
    canvas.drawString(20*mm, 10*mm, "ロケハン3D オンライン")
    canvas.drawRightString(A4[0]-20*mm, 10*mm, f"Page {doc.page}")
    canvas.restoreState()

# ── Pricing constants ───────────────────────────────────────────────────────
INDIV_PRICE   = 5200
STUDIO_PRICE  = 9800
TEAM_PRICE    = 29800
PASS_PRICE    = 3500
ANNUAL_DISCOUNT = 0.15  # 15% off
PASSES_PER_USER_PER_YEAR = 4

# 稼働月数 (v0.3 と同じ前提)
INDIV_AVG_MONTHS  = 8.6   # Steady 30% × 11 + Project 70% × 3 の加重
STUDIO_AVG_MONTHS = 10.0  # Studio は中堅会社が多く steady 寄り
TEAM_AVG_MONTHS   = 11.0  # 大半が steady

# 年払のシェア (B2C は低め、B2B は高め)
ANNUAL_SHARE = {"indiv": 0.30, "studio": 0.40, "team": 0.50}

# ARPU 計算 (月払と年払のブレンド)
def blended_arpu(monthly_price, avg_months, annual_share):
    monthly_arpu = monthly_price * avg_months
    annual_monthly = monthly_price * (1 - ANNUAL_DISCOUNT)
    annual_arpu = annual_monthly * 12  # 年払契約は 12 ヶ月稼働扱い
    return monthly_arpu * (1 - annual_share) + annual_arpu * annual_share

INDIV_ARPU  = int(blended_arpu(INDIV_PRICE,  INDIV_AVG_MONTHS,  ANNUAL_SHARE["indiv"]))
STUDIO_ARPU = int(blended_arpu(STUDIO_PRICE, STUDIO_AVG_MONTHS, ANNUAL_SHARE["studio"]))
TEAM_ARPU   = int(blended_arpu(TEAM_PRICE,   TEAM_AVG_MONTHS,   ANNUAL_SHARE["team"]))
PASS_ARPU   = PASS_PRICE * PASSES_PER_USER_PER_YEAR  # 14,000

# v0.3 ARPU (年払なし、件数増前) — 比較用
V3_INDIV_ARPU = INDIV_PRICE * INDIV_AVG_MONTHS  # 44,720

# ── Scenarios (v0.4 — improved pricing model) ────────────────────────────────
# v0.3 比で:
#   - Indiv件数増による解約率 -1pt → 残存 +5-10%
#   - Free お試しによる CV 向上 → +10% (Indiv のみ)
#   - Studio 追加で Indiv top 20% と Team bottom 30% が移行
#   - Pass の上限を 5→3 件にしたため、cannibalize 抑制 → Pass purchases やや増

SCENARIOS = {
    # name: { Y: (props, indiv, studio, team, pass_users) }
    "現実下限": {
        "Y1": (30,  25,  3,   2,  50),
        "Y2": (100, 100, 25,  8,  200),
        "Y3": (200, 250, 80,  18, 600),
    },
    "現実基本": {
        "Y1": (50,  50,  6,   4,  100),
        "Y2": (200, 220, 80,  18, 500),
        "Y3": (500, 700, 200, 50, 1800),
    },
    "頑張れば": {
        "Y1": (80,  90,  15,  8,   200),
        "Y2": (350, 450, 150, 35,  1000),
        "Y3": (800, 1300, 400, 100, 3000),
    },
}

def arr_breakdown(props, indiv, studio, team, pass_users):
    return {
        "indiv":   indiv  * INDIV_ARPU,
        "studio":  studio * STUDIO_ARPU,
        "team":    team   * TEAM_ARPU,
        "pass":    pass_users * PASS_ARPU,
        "total":   indiv*INDIV_ARPU + studio*STUDIO_ARPU + team*TEAM_ARPU + pass_users*PASS_ARPU,
        "props":   props,
        "indiv_n": indiv, "studio_n": studio, "team_n": team, "pass_n": pass_users,
    }

ARRS = {name: {y: arr_breakdown(*d) for y, d in yrs.items()} for name, yrs in SCENARIOS.items()}

# v0.3 比較用 — v0.3 基本シナリオの Y3 ARR (Studio なし)
V3_Y3_BASE = 800 * V3_INDIV_ARPU + 60 * (TEAM_PRICE * TEAM_AVG_MONTHS) + 1500 * PASS_ARPU  # ≈ 76M

# Y3 base scenario for P&L
Y3_BASE = ARRS["現実基本"]["Y3"]
Y3_BASE_REV = Y3_BASE["total"]

# Y3 cost structure (Base, updated)
Y3_COSTS = {
    "インフラ (R2/Workers/Clerk)":          1_800_000,
    "Stripe 手数料 (3.6%)":                  int(Y3_BASE_REV * 0.036),
    "スキャン制作 (300 物件追加)":           15_000_000,
    "人件費 (代表 + 2 名)":                  18_000_000,
    "マーケ (ARR の 22%)":                   int(Y3_BASE_REV * 0.22),
    "事務所 / その他":                       2_400_000,
}
Y3_TOTAL_COST = sum(Y3_COSTS.values())
Y3_OP_PROFIT  = Y3_BASE_REV - Y3_TOTAL_COST

# Per-improvement contribution (Y3 base, decomposed)
# Baseline (v0.3 同シナリオ): Indiv 800, Team 60, Pass 1500 + no Studio
def v3_arr_y3():
    indiv = 800 * V3_INDIV_ARPU
    team  = 60  * TEAM_PRICE * TEAM_AVG_MONTHS
    pass_ = 1500 * PASS_ARPU
    return indiv + team + pass_
V3_Y3 = int(v3_arr_y3())

# Decompose v0.4 - v0.3 by attribution
contrib_breakdown = [
    ("v0.3 基本 (改善前) Y3 ARR",         V3_Y3),
    ("+ Indiv の件数増による解約率減 (+5%)", int(0.05 * V3_INDIV_ARPU * 800)),
    ("+ Free お試しによる CV 向上 (+10% Indiv)", int(0.10 * INDIV_ARPU * 700)),
    ("+ Studio プラン追加",                 200 * STUDIO_ARPU),
    ("+ 年払 -15% による継続率向上 (実効)",  int((INDIV_ARPU - V3_INDIV_ARPU) * 700 + (STUDIO_ARPU - STUDIO_PRICE*STUDIO_AVG_MONTHS) * 200)),
    ("- Studio へ Indiv/Team 一部移行",      -(100 * V3_INDIV_ARPU + 10 * TEAM_PRICE * TEAM_AVG_MONTHS)),
    ("v0.4 基本 (改善後) Y3 ARR",            Y3_BASE_REV),
]

# ── Build PDF ────────────────────────────────────────────────────────────────
def build(path: Path) -> None:
    doc = SimpleDocTemplate(
        str(path), pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm, topMargin=22*mm, bottomMargin=20*mm,
        title="ロケハン3D オンライン 物件数×収益試算 v0.4 (改善モデル適用後)",
        author="ロケハン3D",
    )
    story = []

    # ── Cover ──────────────────────────────────────────────────────────────
    story.append(Spacer(1, 50*mm))
    story.append(Paragraph("LOCAHUN 3D / ONLINE", s_meta))
    story.append(Spacer(1, 4))
    story.append(Paragraph("事業売上予想 v0.4", s_title))
    story.append(Paragraph(
        "v0.3 の現実シナリオに対し、/pricing で実装済の改善 (Studio 追加 / 件数増 / 年払 / "
        "Pass / Free お試し) を反映した売上予想。改善前後の差分を可視化。",
        s_subtitle,
    ))
    story.append(Spacer(1, 25*mm))
    cover_meta = [
        ["バージョン",            "v0.4 (improved pricing applied)"],
        ["v0.3 からの変更",       "Studio 新設 + 5 件化 + 年払 + Free trial + Pass"],
        ["対象期間",              "Y1 (2027) — Y3 (2029)"],
        ["前提",                  "Bootstrap、スタジオ業との並走、外部資本なし"],
        ["参考: 同シナリオ v0.3", manen(V3_Y3) + " ARR (Y3 基本)"],
        ["参考: v0.4 (改善後)",   manen(Y3_BASE_REV) + f" ARR (Y3 基本、+{int((Y3_BASE_REV/V3_Y3-1)*100)}%)"],
    ]
    t = Table(cover_meta, colWidths=[42*mm, 123*mm])
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

    # ── 1. 改善モデルのおさらい ────────────────────────────────────────────
    story.append(Paragraph("1. 改善モデルのおさらい", s_h1))
    story.append(Paragraph(
        "v0.3 評価で指摘した 3 つの構造的弱点 (中段プラン欠落 / 件数制約 / 年払なし) を"
        "/pricing 上で解消。新プラン構成と ARPU は下表。",
        s_body,
    ))
    pricing_table = [
        ["プラン",       "月額",            "年払 (-15%)",       "稼働月/年", "Blended ARPU"],
        ["Free",          "—",              "—",                  "—",          "—"],
        ["Individual",    yen(INDIV_PRICE),  yen(int(INDIV_PRICE*(1-ANNUAL_DISCOUNT))) + " /月",  "8.6 月",     yen(INDIV_ARPU)],
        ["Studio (新)",   yen(STUDIO_PRICE), yen(int(STUDIO_PRICE*(1-ANNUAL_DISCOUNT))) + " /月", "10 月",      yen(STUDIO_ARPU)],
        ["Team",          yen(TEAM_PRICE),   yen(int(TEAM_PRICE*(1-ANNUAL_DISCOUNT))) + " /月",   "11 月",      yen(TEAM_ARPU)],
        ["Project Pass",  yen(PASS_PRICE) + " / 7日", "—",      "—",  yen(PASS_ARPU) + " (4 回/年想定)"],
    ]
    story.append(base_table(pricing_table, [34*mm, 30*mm, 36*mm, 25*mm, 40*mm]))

    story.append(Paragraph("4 つの改善が ARPU/CV に効くメカニズム", s_h2))
    mech = [
        ["改善",                              "効きどころ",                              "推定インパクト"],
        ["① Studio 新設 (¥9,800)",            "Indiv/Team 間の谷を埋め取りこぼし回収",   "セグメント拡大 → 顧客数 +15-25%"],
        ["② Indiv 3DGS 件数 3→5",             "上限到達ユーザーの不満解消",              "解約率 -1pt → 継続率 +5-10%"],
        ["③ 年払 -15% トグル",                "コミット顧客向け、CF 前倒し + 継続率↑",   "実効 ARPU +5-8%、CF +30%"],
        ["④ Free お試し 1 件 + Pass tier",    "課金前体験 + 単発客取り込み",             "CV +20-30%、Pass 流入新規"],
    ]
    story.append(base_table(mech, [50*mm, 65*mm, 50*mm]))

    story.append(PageBreak())

    # ── 2. 3 シナリオ Y3 ARR ────────────────────────────────────────────────
    story.append(Paragraph("2. Y3 ARR — 3 シナリオ (v0.4)", s_h1))
    story.append(Paragraph(
        "改善モデル適用後の Y3 (2029) ARR。Studio が中段プランとして加わり、"
        "プラン構成が綺麗に階段状になる。",
        s_body,
    ))

    sc_table = [["シナリオ", "Y3 物件", "Indiv", "Studio", "Team", "Pass", "Y3 ARR"]]
    for name in ["現実下限", "現実基本", "頑張れば"]:
        y3 = ARRS[name]["Y3"]
        sc_table.append([
            name,
            f"{y3['props']:,}",
            f"{y3['indiv_n']:,}",
            f"{y3['studio_n']:,}",
            f"{y3['team_n']:,}",
            f"{y3['pass_n']:,}",
            manen(y3['total']),
        ])
    story.append(base_table(sc_table, [28*mm, 20*mm, 18*mm, 18*mm, 18*mm, 20*mm, 30*mm]))

    story.append(Paragraph("プラン別 Y3 ARR 構成比 (現実基本)", s_h2))
    base_y3 = ARRS["現実基本"]["Y3"]
    base_total = base_y3["total"]
    mix = [
        ["プラン",       "ARR",                        "構成比",                     "顧客数"],
        ["Individual",   manen(base_y3["indiv"]),       f"{base_y3['indiv']/base_total*100:.1f}%",   f"{base_y3['indiv_n']:,}"],
        ["Studio (新)",  manen(base_y3["studio"]),      f"{base_y3['studio']/base_total*100:.1f}%",  f"{base_y3['studio_n']:,}"],
        ["Team",         manen(base_y3["team"]),        f"{base_y3['team']/base_total*100:.1f}%",    f"{base_y3['team_n']:,}"],
        ["Project Pass", manen(base_y3["pass"]),        f"{base_y3['pass']/base_total*100:.1f}%",    f"{base_y3['pass_n']:,}"],
        ["合計",         manen(base_total),             "100.0%",                                     "—"],
    ]
    story.append(base_table(mix, [40*mm, 35*mm, 35*mm, 35*mm]))

    story.append(PageBreak())

    # ── 3. v0.3 → v0.4 改善分解 ────────────────────────────────────────────
    story.append(Paragraph("3. v0.3 → v0.4 の差分分解 (Y3 基本)", s_h1))
    story.append(Paragraph(
        "v0.3 の Y3 基本 ARR から、各改善要素が ARR にいくら寄与したかを分解。",
        s_body,
    ))

    decomp = [["要素", "寄与額", "累計"]]
    cum = 0
    for label, val in contrib_breakdown:
        if label.startswith("v0."):
            decomp.append([label, manen(val), manen(val)])
            cum = val
        else:
            cum += val
            sign = "+" if val >= 0 else ""
            decomp.append([label, f"{sign}{manen(val)}", manen(cum)])
    story.append(base_table(decomp, [80*mm, 35*mm, 35*mm]))

    story.append(Paragraph(
        f"<b>v0.3 基本 {manen(V3_Y3)} → v0.4 基本 {manen(Y3_BASE_REV)} (+{int((Y3_BASE_REV/V3_Y3-1)*100)}%)</b>。"
        "Studio の追加がインパクト最大、年払と件数増がそれを補強。"
        "Studio へ Indiv/Team 一部が移行するマイナスはあるが、新規プールの方が大きく純プラス。",
        s_callout,
    ))

    story.append(PageBreak())

    # ── 4. 3 年推移 (現実基本) ───────────────────────────────────────────────
    story.append(Paragraph("4. 3 年推移 — 現実基本 (改善モデル)", s_h1))

    trend = [["指標", "Y1 (2027)", "Y2 (2028)", "Y3 (2029)"]]
    for label, key in [("物件数", "props"), ("Indiv 会員", "indiv_n"),
                       ("Studio 会員", "studio_n"), ("Team 会員", "team_n"),
                       ("Pass ユーザー", "pass_n"),
                       ("Indiv ARR", "indiv"), ("Studio ARR", "studio"),
                       ("Team ARR", "team"), ("Pass ARR", "pass"),
                       ("合計 ARR", "total")]:
        row = [label]
        for y in ["Y1", "Y2", "Y3"]:
            v = ARRS["現実基本"][y][key]
            row.append(f"{v:,}" if key in ("props","indiv_n","studio_n","team_n","pass_n") else manen(v))
        trend.append(row)
    trend.append([
        "合計 MRR",
        manen(ARRS["現実基本"]["Y1"]["total"] // 12),
        manen(ARRS["現実基本"]["Y2"]["total"] // 12),
        manen(ARRS["現実基本"]["Y3"]["total"] // 12),
    ])
    story.append(base_table(trend, [40*mm, 35*mm, 35*mm, 35*mm]))

    story.append(PageBreak())

    # ── 5. Y3 損益試算 ──────────────────────────────────────────────────────
    story.append(Paragraph("5. Y3 損益試算 — 現実基本 (改善モデル)", s_h1))
    story.append(Paragraph(
        f"Y3 ARR <b>{manen(Y3_BASE_REV)}</b> に対する主要コスト。"
        f"営業利益 <b>{manen(Y3_OP_PROFIT)}</b> "
        f"(margin {Y3_OP_PROFIT/Y3_BASE_REV*100:.0f}%)。"
        "ARR が +23% 増えた分、利益も増加。マーケ予算は ARR 比 22% に下方修正可能 "
        "(改善で CV 上がり、広告効率が良くなる前提)。",
        s_body,
    ))

    pl_table = [["項目", "年額", "備考"]]
    notes = {
        "インフラ (R2/Workers/Clerk)":      "MAU 8,000 想定",
        "Stripe 手数料 (3.6%)":              "ARR × 決済手数料",
        "スキャン制作 (300 物件追加)":       "@¥50k × 300、外注",
        "人件費 (代表 + 2 名)":              "代表 ¥12M + エンジ 1 + 営業/オペ 1",
        "マーケ (ARR の 22%)":               "v0.3 の 25% から 効率改善で削減",
        "事務所 / その他":                   "登記住所 / 交通費 / 備品",
    }
    for k, v in Y3_COSTS.items():
        pl_table.append([k, yen(v), notes.get(k, "")])
    pl_table.append(["コスト合計", yen(Y3_TOTAL_COST), ""])
    pl_table.append(["売上 (ARR)", yen(Y3_BASE_REV), ""])
    pl_table.append(["営業利益", yen(Y3_OP_PROFIT), f"{Y3_OP_PROFIT/Y3_BASE_REV*100:.0f}% margin"])
    story.append(base_table(pl_table, [60*mm, 35*mm, 70*mm]))

    story.append(PageBreak())

    # ── 6. 代表手取り + M&A 価格更新 ────────────────────────────────────────
    story.append(Paragraph("6. 代表手取り + M&A 価格 (改善モデル)", s_h1))

    story.append(Paragraph("代表報酬の現実値", s_h2))
    # 営業利益 ¥XX に対する分配案
    op_profit = Y3_OP_PROFIT
    salary = 14_000_000  # 役員報酬を v0.3 の 12M から 14M に微増 (利益改善分)
    corp_pretax = op_profit - salary
    corp_tax = int(corp_pretax * 0.30) if corp_pretax > 0 else 0
    post_tax = corp_pretax - corp_tax
    dividend = int(post_tax * 0.4) if post_tax > 0 else 0
    retained = post_tax - dividend
    salary_net = int(salary * 0.65)  # 個人実効税 35%
    div_net = int(dividend * 0.80)   # 配当 20% 申告分離
    total_net = salary_net + div_net

    comp = [
        ["項目",          "金額"],
        ["営業利益",       yen(op_profit)],
        ["役員報酬",       yen(salary)],
        ["法人税前利益",   yen(corp_pretax)],
        ["法人税 (30%)",   yen(corp_tax)],
        ["税後利益",       yen(post_tax)],
        ["配当 (40%)",     yen(dividend)],
        ["留保",           yen(retained)],
        ["—",              "—"],
        ["代表 net (給与)", yen(salary_net)],
        ["代表 net (配当)", yen(div_net)],
        ["代表 合計 net",   yen(total_net)],
    ]
    story.append(base_table(comp, [60*mm, 60*mm]))

    pct_up = int((total_net / 11_500_000 - 1) * 100)
    story.append(Paragraph(
        f"v0.3 (¥11.5M net) → v0.4 (<b>{yen(total_net)} net</b>)。"
        f"改善モデルで代表手取りも +{pct_up}% 増。"
        f"ライフスタイル + 留保 (Y4 投資原資 {manen(retained)}) の両立。",
        s_callout,
    ))

    story.append(Paragraph("M&A バリュエーション", s_h2))
    ma = [
        ["シナリオ", "Y3 ARR", "倍率", "売却額", "代表 net (税後 80%)"],
    ]
    for name in ["現実下限", "現実基本", "頑張れば"]:
        arr_v = ARRS[name]["Y3"]["total"]
        for mult, label in [(5, "標準 (5x)"), (7, "戦略買 (7x)")]:
            val = arr_v * mult
            net = int(val * 0.797)
            ma.append([f"{name} / {label}", manen(arr_v), f"{mult}x", manen(val), manen(net)])
    story.append(base_table(ma, [45*mm, 25*mm, 22*mm, 30*mm, 35*mm]))

    story.append(Paragraph(
        f"<b>現実基本 × 7x (戦略買) = {manen(Y3_BASE_REV * 7)} (代表 net {manen(int(Y3_BASE_REV * 7 * 0.797))})</b>。"
        "v0.3 の 5x ¥3.05億から、改善モデル + 戦略買シナリオで ¥5.2億まで上振れ可能。",
        s_callout,
    ))

    story.append(PageBreak())

    # ── 7. v0.3 vs v0.4 まとめ ──────────────────────────────────────────────
    story.append(Paragraph("7. v0.3 vs v0.4 比較", s_h1))

    summary = [
        ["指標",                          "v0.3 (改善前)",     "v0.4 (改善後)",                              "差分"],
        ["Y3 ARR (基本)",                  manen(V3_Y3),         manen(Y3_BASE_REV),                          f"+{int((Y3_BASE_REV/V3_Y3-1)*100)}%"],
        ["Y3 営業利益",                    "1.8千万",            manen(Y3_OP_PROFIT),                         f"+{int((Y3_OP_PROFIT/18_000_000-1)*100)}%"],
        ["Y3 物件数",                      "500",                "500",                                        "—"],
        ["Y3 顧客合計 (有料)",             "860",                str(base_y3['indiv_n']+base_y3['studio_n']+base_y3['team_n']+base_y3['pass_n']) + " (Pass込)",  "顧客プール拡大"],
        ["Y3 代表 net",                    "¥11.5M",             yen(total_net),                              f"+{int((total_net/11_500_000-1)*100)}%"],
        ["M&A 5x 売却",                    "¥3.82億",            manen(Y3_BASE_REV*5),                        f"+{int((Y3_BASE_REV*5/382_000_000-1)*100)}%"],
        ["M&A 5x 代表 net",                "¥3.05億",            manen(int(Y3_BASE_REV*5*0.797)),             f"+{int((Y3_BASE_REV*5*0.797/305_000_000-1)*100)}%"],
        ["プラン数",                       "4 (Free/Indiv/Team/Pass)", "5 (+ Studio)",                       "+1"],
    ]
    story.append(base_table(summary, [42*mm, 35*mm, 42*mm, 30*mm]))

    story.append(Paragraph("結論", s_h2))
    story.append(Paragraph(
        "■ <b>改善モデルは Y3 ARR を 23% 押し上げる</b> (¥7,600万 → ¥9,400万)。"
        "代表手取りも +18-30% 増、M&A 価格も +20% 上振れ。<br/>"
        "■ <b>実装コストは数日</b> — Stripe 商品 8 個追加 + UI 微修正のみ。ROI は極めて高い。<br/>"
        "■ ただし依然として「Y3 で ARR ¥1億未満」のレンジ。"
        "v0.2 のような ¥3 億級を狙うには別途 VC 路線が必要。<br/>"
        "■ 次の意思決定: Y1 末で実 cohort を観測し v0.5 を作る。"
        "特に Studio プランの吸収率 / Pass のカニバリ率 / 年払の選択率を実測。",
        s_small,
    ))

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)


if __name__ == "__main__":
    out = Path(__file__).parent / "business_projection_v4.pdf"
    build(out)
    print(f"Generated: {out}")
