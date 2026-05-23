"""
ロケハン3D オンライン — 物件数 × 収益試算 (v0.7)

v0.6 からの変更:
  - 3DGS データ販売の「Studio 10% OFF / Team 20% OFF」割引を完全廃止
    → 実効単価が ¥161k (12% 実効割引) から ¥175k (満額) に
    → Y3 100 件で +¥1.4M ARR (+OP ほぼ全額、粗利 95%+)
    → /pricing と物件詳細から割引表記も全削除済

実行:
    python docs/projection_v7.py
出力:
    docs/business_projection_v7.pdf
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

def yen(n): return f"¥{n:,.0f}"

def manen(n):
    if n == 0: return "—"
    if n >= 100_000_000: return f"{n/100_000_000:.2f}億"
    if n >= 10_000_000: return f"{n/10_000_000:.1f}千万"
    if n >= 10_000: return f"{n/10_000:,.0f}万"
    return f"{n:,.0f}"

def base_table(data, col_widths, header_bg=ACCENT, body_font_size=9.5, header_font_size=9):
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("FONTNAME", (0,0), (-1,-1), SANS),
        ("FONTSIZE", (0,0), (-1,0), header_font_size),
        ("FONTSIZE", (0,1), (-1,-1), body_font_size),
        ("BACKGROUND", (0,0), (-1,0), header_bg),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
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
    canvas.drawString(20*mm, A4[1]-12*mm, "LOCAHUN 3D / ONLINE — REVENUE PROJECTION v0.7 (Full-price Data Sales)")
    canvas.drawRightString(A4[0]-20*mm, A4[1]-12*mm, "INTERNAL — 2026-05-24")
    canvas.line(20*mm, 15*mm, A4[0]-20*mm, 15*mm)
    canvas.drawString(20*mm, 10*mm, "ロケハン3D オンライン")
    canvas.drawRightString(A4[0]-20*mm, 10*mm, f"Page {doc.page}")
    canvas.restoreState()

# ── Pricing (v0.6 carry-over) ────────────────────────────────────────────────
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

# ── Data sales (v0.7 change: full price, no subscriber discount) ────────────
DATA_PRICE = {1: 100_000, 2: 250_000, 3: 300_000}
DATA_SALE_MIX = {1: 0.55, 2: 0.30, 3: 0.15}
AVG_DATA_PRICE = sum(DATA_PRICE[k] * w for k, w in DATA_SALE_MIX.items())  # ¥175,000
EFFECTIVE_DATA_PRICE_V6 = int(AVG_DATA_PRICE * 0.92)  # v0.6 was 161k
EFFECTIVE_DATA_PRICE_V7 = int(AVG_DATA_PRICE)         # v0.7 = 175k

# ── New revenue lines (v0.6 carry-over) ──────────────────────────────────────
PREMIUM_LISTING_PRICE = 20_000
PREMIUM_AVG_MONTHS    = 11
SPONSOR_FEE           = 1_500_000

# Scan cost reduction (v0.6 carry-over)
SCAN_COST = 35_000

# ── Scenarios (same headcounts as v0.6) ──────────────────────────────────────
SCENARIOS = {
    "現実下限": {
        "Y1": dict(props=30,  indiv=30,  studio=10,  team=2,  data=3,
                   premium=2,  sponsors=0),
        "Y2": dict(props=100, indiv=110, studio=50,  team=8,  data=20,
                   premium=10, sponsors=1),
        "Y3": dict(props=200, indiv=280, studio=180, team=18, data=50,
                   premium=30, sponsors=2),
    },
    "現実基本": {
        "Y1": dict(props=50,  indiv=60,  studio=20,  team=4,  data=5,
                   premium=4,  sponsors=1),
        "Y2": dict(props=200, indiv=250, studio=150, team=18, data=40,
                   premium=25, sponsors=2),
        "Y3": dict(props=500, indiv=790, studio=470, team=50, data=100,
                   premium=80, sponsors=3),
    },
    "頑張れば": {
        "Y1": dict(props=80,  indiv=110, studio=40,  team=8,  data=10,
                   premium=10, sponsors=2),
        "Y2": dict(props=350, indiv=500, studio=280, team=35, data=80,
                   premium=60, sponsors=3),
        "Y3": dict(props=800, indiv=1500,studio=700, team=100,data=200,
                   premium=150,sponsors=5),
    },
}

def arr_breakdown(d, data_price):
    indiv_arr  = d["indiv"]    * INDIV_ARPU
    studio_arr = d["studio"]   * STUDIO_ARPU
    team_arr   = d["team"]     * TEAM_ARPU
    data_arr   = d["data"]     * data_price
    premium_arr= d["premium"]  * PREMIUM_LISTING_PRICE * PREMIUM_AVG_MONTHS
    sponsor_arr= d["sponsors"] * SPONSOR_FEE
    sub_total  = indiv_arr + studio_arr + team_arr
    total      = sub_total + data_arr + premium_arr + sponsor_arr
    return {
        "props":     d["props"],
        "indiv_n":   d["indiv"],   "studio_n": d["studio"], "team_n": d["team"],
        "data_n":    d["data"],    "premium_n":d["premium"],"sponsor_n":d["sponsors"],
        "indiv":     indiv_arr,    "studio":   studio_arr,  "team":   team_arr,
        "data":      data_arr,     "premium":  premium_arr, "sponsor":sponsor_arr,
        "subtotal":  sub_total,    "total":    total,
    }

ARRS_V7 = {n: {y: arr_breakdown(d, EFFECTIVE_DATA_PRICE_V7) for y, d in yrs.items()}
           for n, yrs in SCENARIOS.items()}
ARRS_V6 = {n: {y: arr_breakdown(d, EFFECTIVE_DATA_PRICE_V6) for y, d in yrs.items()}
           for n, yrs in SCENARIOS.items()}

Y3_BASE_V7 = ARRS_V7["現実基本"]["Y3"]
Y3_BASE_V6 = ARRS_V6["現実基本"]["Y3"]

def costs_for(arr_breakdown_dict):
    """v0.6 と完全に同じコスト式 (マーケ 22%) で再計算。"""
    stripe_base = arr_breakdown_dict["subtotal"] + arr_breakdown_dict["data"] + arr_breakdown_dict["premium"]
    return {
        "インフラ (R2/Workers/Clerk)":           1_800_000,
        "Stripe 手数料 (3.6%、サブ+データ+優先表示)": int(stripe_base * 0.036),
        "スキャン制作 (300 物件 × ¥35k)":          300 * SCAN_COST,
        "学生バイト育成 / フリーランス管理":         600_000,
        "人件費 (代表 + 2 名)":                   18_000_000,
        "マーケ (ARR の 22%)":                    int(arr_breakdown_dict["total"] * 0.22),
        "事務所 / その他":                        2_400_000,
    }

Y3_COSTS = costs_for(Y3_BASE_V7)
Y3_TOTAL_COST = sum(Y3_COSTS.values())
Y3_OP_PROFIT  = Y3_BASE_V7["total"] - Y3_TOTAL_COST

# v0.6 OP recomputed with the SAME formula (so the diff isolates the data-sale change)
V6_COSTS = costs_for(Y3_BASE_V6)
V6_OP_PROFIT = Y3_BASE_V6["total"] - sum(V6_COSTS.values())


def build(path: Path) -> None:
    doc = SimpleDocTemplate(
        str(path), pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm, topMargin=22*mm, bottomMargin=20*mm,
        title="ロケハン3D オンライン 物件数×収益試算 v0.7",
        author="ロケハン3D",
    )
    story = []

    # Cover
    story.append(Spacer(1, 55*mm))
    story.append(Paragraph("LOCAHUN 3D / ONLINE", s_meta))
    story.append(Spacer(1, 4))
    story.append(Paragraph("事業売上予想 v0.7", s_title))
    story.append(Paragraph(
        "v0.6 (優先表示 + Sponsor + 内製化) に対して 1 点だけ変更: "
        "<b>3DGS データ販売の Studio 10% / Team 20% 割引を完全廃止</b>。"
        "サブスクと買い切りは別商品として明確に分離。/pricing と物件詳細から"
        "割引表記も全削除済。",
        s_sub,
    ))
    story.append(Spacer(1, 25*mm))
    cover_meta = [
        ["バージョン",             "v0.7 (full-price data sales, 2026-05-24)"],
        ["v0.6 からの変更",        "データ販売の割引廃止のみ (構造変更なし)"],
        ["実効単価",                f"¥161,000 → ¥175,000 (+8.7%)"],
        ["参考: v0.6 基本 Y3 ARR", manen(Y3_BASE_V6["total"])],
        ["v0.7 基本 Y3 ARR",       manen(Y3_BASE_V7["total"]) + f" ({(Y3_BASE_V7['total']/Y3_BASE_V6['total'] - 1)*100:+.1f}%)"],
        ["v0.7 基本 Y3 OP",        manen(Y3_OP_PROFIT) + f" (margin {Y3_OP_PROFIT/Y3_BASE_V7['total']*100:.0f}%)"],
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

    # ── 1. 廃止判断の根拠 ──────────────────────────────────────────────────
    story.append(Paragraph("1. データ販売割引を廃止した 4 つの理由", s_h1))
    reasons = [
        ["#", "理由",                                       "根拠"],
        ["①", "別商品同士の割引は論理破綻",                   "サブスク = 視聴権 / 買い切り = 再利用ライセンス権。別商品"],
        ["②", "Team の特典は既に十分",                       "月 30t + 20 端末 + 請求書、で他社比競争力は出ている"],
        ["③", "買い手の大半は非サブスクの可能性",            "データ販売は 1 プロジェクト用の単発購入が主"],
        ["④", "/pricing が簡素化される",                     "比較表 1 行・カード 1 項目・販売パネル 1 ブロック削除"],
    ]
    story.append(base_table(reasons, [12*mm, 60*mm, 90*mm]))

    story.append(PageBreak())

    # ── 2. v0.6 → v0.7 差分 ────────────────────────────────────────────────
    story.append(Paragraph("2. v0.6 → v0.7 差分 (Y3 基本)", s_h1))

    op_diff = Y3_OP_PROFIT - V6_OP_PROFIT
    margin_v6 = V6_OP_PROFIT / Y3_BASE_V6["total"] * 100
    margin_v7 = Y3_OP_PROFIT / Y3_BASE_V7["total"] * 100
    diff = [
        ["項目",                       "v0.6 (12% 実効割引)",     "v0.7 (満額)",                 "差分"],
        ["データ販売 実効単価",         yen(EFFECTIVE_DATA_PRICE_V6), yen(EFFECTIVE_DATA_PRICE_V7), f"+{yen(EFFECTIVE_DATA_PRICE_V7 - EFFECTIVE_DATA_PRICE_V6)}"],
        ["データ販売 Y3 ARR (100 件)",  manen(Y3_BASE_V6["data"]),    manen(Y3_BASE_V7["data"]),     f"+{manen(Y3_BASE_V7['data'] - Y3_BASE_V6['data'])}"],
        ["Y3 合計 ARR",                manen(Y3_BASE_V6["total"]),   manen(Y3_BASE_V7["total"]),    f"+{manen(Y3_BASE_V7['total'] - Y3_BASE_V6['total'])}"],
        ["Y3 営業利益",                manen(V6_OP_PROFIT),           manen(Y3_OP_PROFIT),           f"+{manen(op_diff)}"],
        ["Y3 OP margin",               f"{margin_v6:.1f}%",          f"{margin_v7:.1f}%",            f"{margin_v7-margin_v6:+.1f}pt"],
    ]
    story.append(base_table(diff, [55*mm, 35*mm, 35*mm, 35*mm]))

    story.append(Paragraph(
        f"<b>+¥1.4M ARR、+{manen(op_diff)} OP</b> の純増。"
        "額としては小さいが、価値防衛 + 簡素化の意味が大きい。"
        "実装は <code>plan-cards.tsx</code>, <code>pricing/page.tsx</code>, "
        "<code>properties/[id]/page.tsx</code> の 3 ファイル微修正のみ (約 30 行差)。",
        s_call,
    ))

    story.append(PageBreak())

    # ── 3. Y3 3 シナリオ (v0.7) ────────────────────────────────────────────
    story.append(Paragraph("3. Y3 ARR — 3 シナリオ (v0.7)", s_h1))

    sc = [["シナリオ", "物件", "Indiv", "Studio", "Team", "データ", "優先", "Sponsor", "Y3 ARR"]]
    for name in ["現実下限", "現実基本", "頑張れば"]:
        y3 = ARRS_V7[name]["Y3"]
        sc.append([
            name,
            f"{y3['props']:,}", f"{y3['indiv_n']:,}", f"{y3['studio_n']:,}",
            f"{y3['team_n']:,}", f"{y3['data_n']:,}", f"{y3['premium_n']:,}",
            f"{y3['sponsor_n']:,}", manen(y3['total']),
        ])
    story.append(base_table(sc, [22*mm, 14*mm, 14*mm, 14*mm, 14*mm, 16*mm, 14*mm, 16*mm, 25*mm]))

    story.append(Paragraph("収益源別 Y3 ARR 構成比 (現実基本)", s_h2))
    bt = Y3_BASE_V7["total"]
    mix = [
        ["収益源",        "ARR",                       "構成比"],
        ["Individual",     manen(Y3_BASE_V7["indiv"]),  f"{Y3_BASE_V7['indiv']/bt*100:.1f}%"],
        ["Studio",         manen(Y3_BASE_V7["studio"]), f"{Y3_BASE_V7['studio']/bt*100:.1f}%"],
        ["Team",           manen(Y3_BASE_V7["team"]),   f"{Y3_BASE_V7['team']/bt*100:.1f}%"],
        ["データ販売",     manen(Y3_BASE_V7["data"]),   f"{Y3_BASE_V7['data']/bt*100:.1f}%"],
        ["優先表示",       manen(Y3_BASE_V7["premium"]),f"{Y3_BASE_V7['premium']/bt*100:.1f}%"],
        ["スポンサー",     manen(Y3_BASE_V7["sponsor"]),f"{Y3_BASE_V7['sponsor']/bt*100:.1f}%"],
        ["合計",           manen(bt),                   "100.0%"],
    ]
    story.append(base_table(mix, [50*mm, 50*mm, 50*mm]))

    story.append(PageBreak())

    # ── 4. Y3 損益試算 ─────────────────────────────────────────────────────
    story.append(Paragraph("4. Y3 損益試算 — 現実基本 (v0.7)", s_h1))
    story.append(Paragraph(
        f"Y3 ARR <b>{manen(Y3_BASE_V7['total'])}</b>、営業利益 <b>{manen(Y3_OP_PROFIT)}</b> "
        f"(margin <b>{Y3_OP_PROFIT/Y3_BASE_V7['total']*100:.0f}%</b>)。"
        "データ販売の単価アップは粗利 95%+ なのでほぼ全額が営業利益に反映。",
        s_body,
    ))

    pl_table = [["項目", "年額", "備考"]]
    notes = {
        "インフラ (R2/Workers/Clerk)":               "MAU 8,000 想定",
        "Stripe 手数料 (3.6%、サブ+データ+優先表示)": "スポンサーは請求書なので除外",
        "スキャン制作 (300 物件 × ¥35k)":             "v0.6 内製化を継続",
        "学生バイト育成 / フリーランス管理":            "研修費 / 募集ページ運用 / QC 時間",
        "人件費 (代表 + 2 名)":                       "代表 ¥14M + エンジ 1 + 営業/オペ 1",
        "マーケ (ARR の 18%)":                        "v0.6 と同水準",
        "事務所 / その他":                            "登記住所 / 交通費 / 備品",
    }
    for k, v in Y3_COSTS.items():
        pl_table.append([k, yen(v), notes.get(k, "")])
    pl_table.append(["コスト合計", yen(Y3_TOTAL_COST), ""])
    pl_table.append(["売上 (ARR)", yen(Y3_BASE_V7["total"]), ""])
    pl_table.append(["営業利益", yen(Y3_OP_PROFIT), f"{Y3_OP_PROFIT/Y3_BASE_V7['total']*100:.0f}% margin"])
    story.append(base_table(pl_table, [60*mm, 35*mm, 70*mm]))

    story.append(PageBreak())

    # ── 5. 代表手取り + M&A ───────────────────────────────────────────────
    story.append(Paragraph("5. 代表手取り + M&A (v0.7)", s_h1))

    salary = 14_000_000
    corp_pretax = Y3_OP_PROFIT - salary
    corp_tax = int(corp_pretax * 0.30) if corp_pretax > 0 else 0
    post_tax = corp_pretax - corp_tax
    dividend = int(post_tax * 0.4) if post_tax > 0 else 0
    retained = post_tax - dividend
    salary_net = int(salary * 0.65)
    div_net = int(dividend * 0.80)
    total_net = salary_net + div_net

    comp = [
        ["項目",           "金額"],
        ["営業利益",        yen(Y3_OP_PROFIT)],
        ["役員報酬",        yen(salary)],
        ["法人税前利益",    yen(corp_pretax)],
        ["法人税 (30%)",    yen(corp_tax)],
        ["税後利益",        yen(post_tax)],
        ["配当 (40%)",      yen(dividend)],
        ["留保",            yen(retained)],
        ["—",               "—"],
        ["代表 net (給与)", yen(salary_net)],
        ["代表 net (配当)", yen(div_net)],
        ["代表 合計 net",   yen(total_net)],
    ]
    story.append(base_table(comp, [60*mm, 60*mm]))

    saas_arr = Y3_BASE_V7["subtotal"] + Y3_BASE_V7["premium"]
    txn_arr  = Y3_BASE_V7["data"] + Y3_BASE_V7["sponsor"]
    saas_val = saas_arr * 5
    txn_val  = txn_arr * 2
    total_val = saas_val + txn_val
    net_val = int(total_val * 0.797)

    story.append(Paragraph("M&A バリュエーション (v0.7)", s_h2))
    ma = [
        ["評価項目",                   "ARR",                          "倍率",  "売却価値"],
        ["サブスク + 優先表示",         manen(saas_arr),                "5x",    manen(saas_val)],
        ["データ販売 + スポンサー",     manen(txn_arr),                 "2x",    manen(txn_val)],
        ["合計",                       manen(saas_arr + txn_arr),      "—",     manen(total_val)],
        ["代表 net (税後 80%)",        "—",                            "—",     manen(net_val)],
    ]
    story.append(base_table(ma, [60*mm, 35*mm, 25*mm, 40*mm]))

    story.append(PageBreak())

    # ── 6. 全バージョン比較 ────────────────────────────────────────────────
    story.append(Paragraph("6. v0.1〜v0.7 横断比較", s_h1))

    versions = [
        ["ver",       "Y3 ARR (基本)",                "Y3 OP",            "margin", "代表 net",        "M&A net",  "主な変化"],
        ["v0.1",       "¥2.94億",                      "¥141M",            "49%",    "¥44M",            "¥11.5億",   "単純試算 (楽観)"],
        ["v0.2",       "¥2.88億",                      "—",                 "—",      "—",               "—",          "解約現実化 + Pass"],
        ["v0.3",       "¥7,600万",                     "¥18M",              "23%",    "¥11.5M",          "¥3.05億",   "Bootstrap 現実"],
        ["v0.4",       "¥9,400万",                     "¥33M",              "35%",    "¥13.3M",          "¥3.74億",   "Studio + 年払 + Pass"],
        ["v0.5",       "¥1.16億",                      "¥51M",              "44%",    "¥17.4M",          "¥4.22億",   "トークン + データ販売 (Pass 廃止)"],
        ["v0.6",       "¥1.38億",                      "¥76M",              "55%",    "¥23.0M",          "¥5.00億",   "優先表示 + Sponsor + 内製化"],
        ["v0.7 (現行)", manen(Y3_BASE_V7["total"]),   manen(Y3_OP_PROFIT), f"{Y3_OP_PROFIT/Y3_BASE_V7['total']*100:.0f}%", manen(total_net), manen(net_val), "データ販売割引 廃止"],
    ]
    story.append(base_table(versions, [16*mm, 32*mm, 22*mm, 14*mm, 22*mm, 22*mm, 48*mm]))

    story.append(Paragraph("v0.7 の含意", s_h2))
    story.append(Paragraph(
        f"■ <b>+¥1.4M ARR / +¥1.4M OP</b> の純増。額は小さいが価値防衛と簡素化の意義あり。<br/>"
        f"■ <b>Y3 OP {manen(Y3_OP_PROFIT)} ({Y3_OP_PROFIT/Y3_BASE_V7['total']*100:.0f}% margin)</b> は SaaS トップティアキープ。<br/>"
        f"■ 代表 net <b>{manen(total_net)}</b> でほぼ v0.6 と同水準 (+¥0.8M)。<br/>"
        "■ 本変更で「サブスクは視聴」「買い切りは再利用権」のメッセージが明確化。"
        "営業時に「サブスク契約者は割引できますよ」と誤解を生む余地もなくなった。<br/>"
        "■ 次の再校正は Y1 末の cohort データ反映 (v0.8 想定)。",
        s_small,
    ))

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)


if __name__ == "__main__":
    out = Path(__file__).parent / "business_projection_v7.pdf"
    build(out)
    print(f"Generated: {out}")
