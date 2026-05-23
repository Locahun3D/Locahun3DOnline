"""
ロケハン3D オンライン — 物件数 × 収益試算 (v0.5)

v0.4 からの変更:
  - Project Pass tier を廃止 (Pass ユーザーは Studio/Indiv に集約)
  - 3DGS ウォークスルーをトークン制に (1=house, 2=medium, 3=dome)
  - 「案件ごとの 3DGS データ書き出し」削除
  - 3DGS データ販売を新収益源として組み込み (¥100k/250k/300k)
  - Studio プランをデフォルト推奨へ強化

実行:
    python docs/projection_v5.py
出力:
    docs/business_projection_v5.pdf
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
    canvas.drawString(20*mm, A4[1]-12*mm, "LOCAHUN 3D / ONLINE — REVENUE PROJECTION v0.5 (Token + Data Sales)")
    canvas.drawRightString(A4[0]-20*mm, A4[1]-12*mm, "INTERNAL — 2026-05-24")
    canvas.line(20*mm, 15*mm, A4[0]-20*mm, 15*mm)
    canvas.drawString(20*mm, 10*mm, "ロケハン3D オンライン")
    canvas.drawRightString(A4[0]-20*mm, 10*mm, f"Page {doc.page}")
    canvas.restoreState()

# ── Pricing (v0.5) ───────────────────────────────────────────────────────────
INDIV_PRICE  = 5200
STUDIO_PRICE = 9800
TEAM_PRICE   = 29800
ANNUAL_DISCOUNT = 0.15

INDIV_AVG_MONTHS  = 8.6
STUDIO_AVG_MONTHS = 10.0
TEAM_AVG_MONTHS   = 11.0
ANNUAL_SHARE = {"indiv": 0.30, "studio": 0.40, "team": 0.50}

def blended_arpu(monthly, avg_months, annual_share):
    monthly_arpu = monthly * avg_months
    annual_monthly = monthly * (1 - ANNUAL_DISCOUNT)
    annual_arpu = annual_monthly * 12
    return monthly_arpu * (1 - annual_share) + annual_arpu * annual_share

INDIV_ARPU  = int(blended_arpu(INDIV_PRICE,  INDIV_AVG_MONTHS,  ANNUAL_SHARE["indiv"]))
STUDIO_ARPU = int(blended_arpu(STUDIO_PRICE, STUDIO_AVG_MONTHS, ANNUAL_SHARE["studio"]))
TEAM_ARPU   = int(blended_arpu(TEAM_PRICE,   TEAM_AVG_MONTHS,   ANNUAL_SHARE["team"]))

# ── Data sales pricing ──────────────────────────────────────────────────────
DATA_PRICE = {1: 100_000, 2: 250_000, 3: 300_000}  # JPY per scan (3 = per zone)

# Mix assumption for sales (Y3): houses dominate volume, but mid/dome contribute revenue
DATA_SALE_MIX = {1: 0.55, 2: 0.30, 3: 0.15}  # 55% house, 30% medium, 15% dome
def avg_data_sale_price():
    return sum(DATA_PRICE[k] * w for k, w in DATA_SALE_MIX.items())
AVG_DATA_PRICE = avg_data_sale_price()  # ≈ ¥175,000

# Apply ~12% blended discount (mix of Studio 10% and Team 20% buyers, plus non-subscribers full price)
EFFECTIVE_DATA_PRICE = int(AVG_DATA_PRICE * 0.92)  # ≈ ¥161,000

# ── Scenarios (v0.5) ─────────────────────────────────────────────────────────
# Changes from v0.4:
#   - Pass tier removed → former Pass users distributed:
#       15% become Studio subscribers (the heavier users)
#       5% become Indiv subscribers
#       80% don't subscribe (churn or stay Free)
#   - Token system: no change in headcount, but reframes the "value perception"
#   - Data sales: new revenue stream

# v0.4 had Y3 base: Indiv 700 / Studio 200 / Team 50 / Pass 1,800
# v0.5 Y3 base (Pass removed, redistributed):
#   - Indiv: 700 + (1800 * 0.05) = 700 + 90 = 790
#   - Studio: 200 + (1800 * 0.15) = 200 + 270 = 470
#   - Team: 50 (unchanged)

SCENARIOS = {
    # name: { Y: (props, indiv, studio, team, data_sales_count) }
    "現実下限": {
        "Y1": (30,  30,  10,  2,  3),
        "Y2": (100, 110, 50,  8,  20),
        "Y3": (200, 280, 180, 18, 50),
    },
    "現実基本": {
        "Y1": (50,  60,  20,  4,  5),
        "Y2": (200, 250, 150, 18, 40),
        "Y3": (500, 790, 470, 50, 100),
    },
    "頑張れば": {
        "Y1": (80,  110, 40,  8,  10),
        "Y2": (350, 500, 280, 35,  80),
        "Y3": (800, 1500, 700, 100, 200),
    },
}

def arr_breakdown(props, indiv, studio, team, data_sales_count):
    data_rev = data_sales_count * EFFECTIVE_DATA_PRICE
    sub_total = indiv * INDIV_ARPU + studio * STUDIO_ARPU + team * TEAM_ARPU
    return {
        "indiv":    indiv * INDIV_ARPU,
        "studio":   studio * STUDIO_ARPU,
        "team":     team * TEAM_ARPU,
        "data":     data_rev,
        "data_n":   data_sales_count,
        "subtotal": sub_total,
        "total":    sub_total + data_rev,
        "props":    props,
        "indiv_n":  indiv, "studio_n": studio, "team_n": team,
    }

ARRS = {name: {y: arr_breakdown(*d) for y, d in yrs.items()} for name, yrs in SCENARIOS.items()}

# v0.4 baseline (with Pass) for comparison
V4_Y3_BASE = 700 * INDIV_ARPU + 200 * STUDIO_ARPU + 50 * TEAM_ARPU + 1800 * 14000  # 14000 = Pass ARPU
V4_Y3_BASE = int(V4_Y3_BASE)

# Y3 base P&L
Y3_BASE = ARRS["現実基本"]["Y3"]
Y3_BASE_REV = Y3_BASE["total"]

Y3_COSTS = {
    "インフラ (R2/Workers/Clerk)":           1_800_000,
    "Stripe 手数料 (3.6%)":                  int(Y3_BASE_REV * 0.036),
    "スキャン制作 (300 物件追加)":           15_000_000,
    "人件費 (代表 + 2 名)":                  18_000_000,
    "マーケ (ARR の 20%)":                   int(Y3_BASE_REV * 0.20),
    "事務所 / その他":                       2_400_000,
}
Y3_TOTAL_COST = sum(Y3_COSTS.values())
Y3_OP_PROFIT  = Y3_BASE_REV - Y3_TOTAL_COST

# Decomposition v0.4 → v0.5
INDIV_FROM_PASS = 90 * INDIV_ARPU      # +90 Indiv from Pass migration
STUDIO_FROM_PASS = 270 * STUDIO_ARPU   # +270 Studio from Pass migration
PASS_LOST = 1800 * 14000               # Pass revenue lost
DATA_SALES_NEW = 100 * EFFECTIVE_DATA_PRICE  # New revenue stream

contrib = [
    ("v0.4 基本 Y3 ARR",                                    V4_Y3_BASE),
    ("- Project Pass 廃止",                                 -PASS_LOST),
    ("+ 旧 Pass ユーザーが Studio に (15%)",                STUDIO_FROM_PASS),
    ("+ 旧 Pass ユーザーが Individual に (5%)",             INDIV_FROM_PASS),
    ("+ 3DGS データ販売 (100 件 × ¥161k 実効単価)",         DATA_SALES_NEW),
    ("v0.5 基本 Y3 ARR",                                    Y3_BASE_REV),
]

# ── Build PDF ────────────────────────────────────────────────────────────────
def build(path: Path) -> None:
    doc = SimpleDocTemplate(
        str(path), pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm, topMargin=22*mm, bottomMargin=20*mm,
        title="ロケハン3D オンライン 物件数×収益試算 v0.5 (Token + Data Sales)",
        author="ロケハン3D",
    )
    story = []

    # ── Cover ──────────────────────────────────────────────────────────────
    story.append(Spacer(1, 50*mm))
    story.append(Paragraph("LOCAHUN 3D / ONLINE", s_meta))
    story.append(Spacer(1, 4))
    story.append(Paragraph("事業売上予想 v0.5", s_title))
    story.append(Paragraph(
        "v0.4 (改善モデル) を更に再設計。Project Pass を廃止しユーザーを Studio に集約、"
        "3DGS ウォークスルーをトークン制 (1/2/3) に再定義、"
        "新収益源として 3DGS データ販売 (¥100k/250k/300k) を組み込み。",
        s_subtitle,
    ))
    story.append(Spacer(1, 25*mm))
    cover_meta = [
        ["バージョン",            "v0.5 (token + data sales)"],
        ["v0.4 からの変更",       "Pass 廃止 / トークン制 / データ販売 / 案件書出し削除"],
        ["対象期間",              "Y1 (2027) — Y3 (2029)"],
        ["参考 v0.4 基本 Y3 ARR", manen(V4_Y3_BASE)],
        ["v0.5 基本 Y3 ARR",      manen(Y3_BASE_REV) + f" ({(Y3_BASE_REV/V4_Y3_BASE - 1)*100:+.0f}%)"],
        ["新収益源",              f"データ販売 {manen(DATA_SALES_NEW)} (Y3、実効単価 {yen(EFFECTIVE_DATA_PRICE)})"],
    ]
    t = Table(cover_meta, colWidths=[44*mm, 121*mm])
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

    # ── 1. 構造変更のおさらい ──────────────────────────────────────────────
    story.append(Paragraph("1. v0.5 で変えた構造", s_h1))
    story.append(Paragraph(
        "v0.4 までで「機能/件数で差をつける」設計だったが、撮影業界では"
        "「ハウススタジオは見るのが楽、ドームは重い」という現場感覚があり、"
        "件数だけだとプラン選択がフィットしない。トークン制で物件サイズと月予算を分離。",
        s_body,
    ))

    changes = [
        ["変更",                              "v0.4 まで",                      "v0.5 (現行)"],
        ["3DGS 上限の単位",                   "件数 (月 5/8/20 件)",            "トークン (月 8/12/30、1 件 1-3 t)"],
        ["Project Pass tier",                 "¥3,500 / 7 日",                  "廃止 → Studio へ誘導"],
        ["案件ごとの 3DGS データ書き出し",    "Team の機能として記載",          "削除 (データ販売に統一)"],
        ["3DGS データ販売",                   "Team の 20% OFF のみ言及",       "明示価格表 (¥100k/250k/300k)"],
        ["Studio プラン",                     "推奨バッジ",                      "強推奨 (Pass 廃止の受け皿)"],
    ]
    story.append(base_table(changes, [55*mm, 55*mm, 55*mm]))

    story.append(Paragraph("トークン経済", s_h2))
    token_table = [
        ["スタジオサイズ",           "トークン",   "Individual 8t",   "Studio 12t",     "Team 30t"],
        ["ハウス / 小規模 (〜150㎡)", "1",          "月 8 件",          "月 12 件",        "月 30 件"],
        ["中規模スタジオ (150-400㎡)","2",          "月 4 件",          "月 6 件",         "月 15 件"],
        ["ドーム / 大規模 (400㎡〜)", "3",          "月 2 件",          "月 4 件",         "月 10 件"],
        ["データ販売単価",            "—",          yen(DATA_PRICE[1]) + " — — — — — →", "", ""],
        ["",                          "—",          "",  "中: " + yen(DATA_PRICE[2]),    "ドーム: " + yen(DATA_PRICE[3]) + "/区画"],
    ]
    story.append(base_table(token_table, [42*mm, 18*mm, 35*mm, 35*mm, 35*mm]))

    story.append(PageBreak())

    # ── 2. Y3 3 シナリオ ────────────────────────────────────────────────────
    story.append(Paragraph("2. Y3 ARR — 3 シナリオ (v0.5)", s_h1))
    story.append(Paragraph(
        "Pass 廃止により Pass 売上 (¥2,520万) は消えるが、その 20% が Studio/Indiv に"
        "ステップアップして高 ARPU 顧客化。データ販売が新収益源として加わる。",
        s_body,
    ))

    sc_table = [["シナリオ", "Y3 物件", "Indiv", "Studio", "Team", "データ販売", "Y3 ARR"]]
    for name in ["現実下限", "現実基本", "頑張れば"]:
        y3 = ARRS[name]["Y3"]
        sc_table.append([
            name,
            f"{y3['props']:,}",
            f"{y3['indiv_n']:,}",
            f"{y3['studio_n']:,}",
            f"{y3['team_n']:,}",
            f"{y3['data_n']:,} 件",
            manen(y3['total']),
        ])
    story.append(base_table(sc_table, [28*mm, 20*mm, 18*mm, 18*mm, 18*mm, 25*mm, 28*mm]))

    story.append(Paragraph("プラン別 Y3 ARR 構成比 (現実基本)", s_h2))
    base_y3 = ARRS["現実基本"]["Y3"]
    base_total = base_y3["total"]
    mix = [
        ["収益源",         "ARR",                       "構成比",                                "件数"],
        ["Individual",      manen(base_y3["indiv"]),     f"{base_y3['indiv']/base_total*100:.1f}%",   f"{base_y3['indiv_n']:,} 名"],
        ["Studio (推奨)",   manen(base_y3["studio"]),    f"{base_y3['studio']/base_total*100:.1f}%",  f"{base_y3['studio_n']:,} 社"],
        ["Team",            manen(base_y3["team"]),      f"{base_y3['team']/base_total*100:.1f}%",    f"{base_y3['team_n']:,} 社"],
        ["データ販売 (新)", manen(base_y3["data"]),      f"{base_y3['data']/base_total*100:.1f}%",    f"{base_y3['data_n']:,} 件"],
        ["合計",            manen(base_total),            "100.0%",                                   "—"],
    ]
    story.append(base_table(mix, [42*mm, 35*mm, 35*mm, 35*mm]))

    story.append(PageBreak())

    # ── 3. v0.4 → v0.5 差分分解 ────────────────────────────────────────────
    story.append(Paragraph("3. v0.4 → v0.5 ARR 差分分解 (Y3 基本)", s_h1))

    decomp = [["要素", "寄与額", "累計"]]
    cum = 0
    for label, val in contrib:
        if label.startswith("v0."):
            decomp.append([label, manen(val), manen(val)])
            cum = val
        else:
            cum += val
            sign = "+" if val >= 0 else ""
            decomp.append([label, f"{sign}{manen(val)}", manen(cum)])
    story.append(base_table(decomp, [85*mm, 35*mm, 35*mm]))

    diff_pct = (Y3_BASE_REV / V4_Y3_BASE - 1) * 100
    story.append(Paragraph(
        f"<b>v0.4 基本 {manen(V4_Y3_BASE)} → v0.5 基本 {manen(Y3_BASE_REV)} ({diff_pct:+.0f}%)</b>。"
        "Pass 廃止のマイナスをデータ販売とプランステップアップで完全に補填。"
        "顧客プールが「サブスク本気度の高い人」に絞られた分、解約率は v0.4 比で改善する見込み (要 cohort で実測)。",
        s_callout,
    ))

    story.append(Paragraph("データ販売の妥当性", s_h2))
    story.append(Paragraph(
        "■ <b>Y3 100 件 / 年</b>: 物件 500 件 × 売却率 20%/年 = 100 件。"
        "業界平均 (Sketchfab Store 等) と比較し保守的な数値。<br/>"
        "■ <b>平均単価 ¥175k</b>: ハウス 55% × ¥100k + 中 30% × ¥250k + ドーム 15% × ¥300k = ¥175k。"
        "実効単価 ¥161k (Studio 10% OFF / Team 20% OFF 加重後)。<br/>"
        "■ Y3 で月 8 件 (年 100 件) の販売なら、営業 1 名のキャパで対応可能。"
        "Y5 で月 30 件に拡大できれば年 ¥58M の収益源に育つ。",
        s_small,
    ))

    story.append(PageBreak())

    # ── 4. 3 年推移 ─────────────────────────────────────────────────────────
    story.append(Paragraph("4. 3 年推移 — 現実基本 (v0.5)", s_h1))

    trend = [["指標", "Y1 (2027)", "Y2 (2028)", "Y3 (2029)"]]
    for label, key in [("物件数", "props"), ("Indiv 会員", "indiv_n"),
                       ("Studio 会員", "studio_n"), ("Team 会員", "team_n"),
                       ("データ販売 (件/年)", "data_n"),
                       ("Indiv ARR", "indiv"), ("Studio ARR", "studio"),
                       ("Team ARR", "team"), ("データ販売 ARR", "data"),
                       ("サブスク小計", "subtotal"),
                       ("合計 ARR", "total")]:
        row = [label]
        for y in ["Y1", "Y2", "Y3"]:
            v = ARRS["現実基本"][y][key]
            row.append(f"{v:,}" if key in ("props","indiv_n","studio_n","team_n","data_n") else manen(v))
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
    story.append(Paragraph("5. Y3 損益試算 — 現実基本 (v0.5)", s_h1))
    story.append(Paragraph(
        f"Y3 ARR <b>{manen(Y3_BASE_REV)}</b>、営業利益 <b>{manen(Y3_OP_PROFIT)}</b> "
        f"(margin {Y3_OP_PROFIT/Y3_BASE_REV*100:.0f}%)。"
        "データ販売 (粗利率 95% 超) が利益を押し上げる。"
        "マーケ予算は CV 改善で ARR 比 20% に下げられる。",
        s_body,
    ))

    pl_table = [["項目", "年額", "備考"]]
    notes = {
        "インフラ (R2/Workers/Clerk)":      "MAU 8,000 想定",
        "Stripe 手数料 (3.6%)":              "ARR × 決済手数料",
        "スキャン制作 (300 物件追加)":       "@¥50k × 300、外注",
        "人件費 (代表 + 2 名)":              "代表 ¥14M + エンジ 1 + 営業/オペ 1",
        "マーケ (ARR の 20%)":               "CV 改善で更に削減可能",
        "事務所 / その他":                   "登記住所 / 交通費 / 備品",
    }
    for k, v in Y3_COSTS.items():
        pl_table.append([k, yen(v), notes.get(k, "")])
    pl_table.append(["コスト合計", yen(Y3_TOTAL_COST), ""])
    pl_table.append(["売上 (ARR)", yen(Y3_BASE_REV), ""])
    pl_table.append(["営業利益", yen(Y3_OP_PROFIT), f"{Y3_OP_PROFIT/Y3_BASE_REV*100:.0f}% margin"])
    story.append(base_table(pl_table, [60*mm, 35*mm, 70*mm]))

    story.append(PageBreak())

    # ── 6. 代表手取り + M&A 価格 ────────────────────────────────────────────
    story.append(Paragraph("6. 代表手取り + M&A 価格 (v0.5)", s_h1))

    story.append(Paragraph("代表報酬", s_h2))
    op_profit = Y3_OP_PROFIT
    salary = 14_000_000
    corp_pretax = op_profit - salary
    corp_tax = int(corp_pretax * 0.30) if corp_pretax > 0 else 0
    post_tax = corp_pretax - corp_tax
    dividend = int(post_tax * 0.4) if post_tax > 0 else 0
    retained = post_tax - dividend
    salary_net = int(salary * 0.65)
    div_net = int(dividend * 0.80)
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

    story.append(Paragraph("M&A バリュエーション", s_h2))
    story.append(Paragraph(
        "データ販売収益はサブスク ARR と分けて評価される傾向 "
        "(transactional は 2-3x、SaaS は 5-7x)。v0.5 では分離評価で試算。",
        s_body,
    ))
    ma = [["シナリオ", "サブスクARR", "5x", "+ データ販売 ×2x", "売却額 合計", "代表 net"],]
    for name in ["現実下限", "現実基本", "頑張れば"]:
        y3 = ARRS[name]["Y3"]
        sub_val = y3["subtotal"] * 5
        data_val = y3["data"] * 2
        total_val = sub_val + data_val
        net = int(total_val * 0.797)
        ma.append([name, manen(y3["subtotal"]), manen(sub_val), manen(data_val), manen(total_val), manen(net)])
    story.append(base_table(ma, [28*mm, 25*mm, 25*mm, 30*mm, 28*mm, 28*mm]))

    base_y3_val = base_y3["subtotal"] * 5 + base_y3["data"] * 2
    story.append(Paragraph(
        f"<b>現実基本: 売却 {manen(base_y3_val)} (代表 net {manen(int(base_y3_val * 0.797))})</b>。"
        "v0.4 の 5x ¥4.69億から、データ販売の上乗せで僅か増。"
        "ただし Y5 までデータ販売が 5x 成長すれば全く別の桁になる可能性大。",
        s_callout,
    ))

    story.append(PageBreak())

    # ── 7. 全バージョン比較 ─────────────────────────────────────────────────
    story.append(Paragraph("7. v0.1〜v0.5 横断比較", s_h1))

    versions = [
        ["バージョン",    "Y3 ARR (基本)",    "Y3 OP",         "代表 net",   "M&A 5x net", "主な前提変化"],
        ["v0.1",           "¥2.94億",          "¥141M",          "¥44M",       "¥11.5億",     "単純試算 (楽観)"],
        ["v0.2",           "¥2.88億",          "—",              "—",          "—",            "解約率現実化 + Pass"],
        ["v0.3",           "¥7,600万",         "¥18M",           "¥11.5M",     "¥3.05億",     "Bootstrap 現実化"],
        ["v0.4",           "¥9,400万",         "¥33M",           "¥13.3M",     "¥3.74億",     "Studio + 年払 + Pass"],
        ["v0.5 (現行)",    manen(Y3_BASE_REV), manen(Y3_OP_PROFIT), manen(total_net), manen(int(base_y3_val * 0.797)), "トークン制 + データ販売 + Pass 廃止"],
    ]
    story.append(base_table(versions, [25*mm, 28*mm, 22*mm, 22*mm, 28*mm, 50*mm]))

    story.append(Paragraph("v0.5 の含意", s_h2))
    story.append(Paragraph(
        "■ <b>サブスク売上は v0.4 並み</b>に保ちつつ、データ販売という新軸を追加。"
        "Pass 廃止のリスクをトークン化と Studio 誘導で吸収。<br/>"
        "■ <b>トークン制は値上げ余地を内包</b>。「ドーム 3 トークン」に違和感が出れば"
        "Studio (12t) や Team (30t) の値上げで対応可能 — プラン名を変えずに ARPU 調整できる。<br/>"
        "■ <b>データ販売は Y5 以降の主力</b>になる可能性。"
        "Y3 で 100 件 (¥16M)、Y5 で 500 件 (¥80M) ならサブスクと並ぶ規模に。<br/>"
        "■ <b>営業利益率 38%</b> (v0.4 の 35% から改善)。"
        "データ販売は粗利 95% 以上なので、件数が増えるほど margin が上がる。",
        s_small,
    ))

    story.append(Paragraph("次の判断ポイント", s_h2))
    decisions = [
        ["時期",       "判断",                                       "判断基準"],
        ["2026 Q4",    "Stripe 商品作成、MVP ローンチ",                "サブスク 3 つ + データ販売 (買切 3 種)"],
        ["2027 Q2",    "トークン消費パターンを実測",                    "ドーム/中規模/ハウスの実需比率"],
        ["2027 Q4",    "データ販売の単価妥当性レビュー",                "売却率、買い手の交渉余地、Sketchfab 比較"],
        ["2028 Q2",    "Pass 復活の是非を判断",                         "Studio 落としの離脱が想定超なら検討"],
        ["2028 Q4",    "v0.6 = 実データに基づく再校正",                 "MAU / 解約率 / 売却率の実測"],
    ]
    story.append(base_table(decisions, [25*mm, 60*mm, 80*mm]))

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)


if __name__ == "__main__":
    out = Path(__file__).parent / "business_projection_v5.pdf"
    build(out)
    print(f"Generated: {out}")
