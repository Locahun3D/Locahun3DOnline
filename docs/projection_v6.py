"""
ロケハン3D オンライン — 物件数 × 収益試算 (v0.6)

v0.5 からの変更:
  + スタジオ側課金「優先表示」アップセル ¥20,000/月
  + 機材メーカースポンサーシップ (小規模、3 社 × ¥1.5M/年)
  + スキャン内製化: 学生バイト + サイト内広告で募集する外注フリーランス
    (1 撮影 ¥30-40k) で平均単価 ¥50k → ¥35k に圧縮

実行:
    python docs/projection_v6.py
出力:
    docs/business_projection_v6.pdf
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
    canvas.drawString(20*mm, A4[1]-12*mm, "LOCAHUN 3D / ONLINE — REVENUE PROJECTION v0.6 (Featured + Sponsors + In-house Scan)")
    canvas.drawRightString(A4[0]-20*mm, A4[1]-12*mm, "INTERNAL — 2026-05-24")
    canvas.line(20*mm, 15*mm, A4[0]-20*mm, 15*mm)
    canvas.drawString(20*mm, 10*mm, "ロケハン3D オンライン")
    canvas.drawRightString(A4[0]-20*mm, 10*mm, f"Page {doc.page}")
    canvas.restoreState()

# ── Pricing (v0.5 carry-over) ────────────────────────────────────────────────
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

# Data sales (v0.5 carry-over)
DATA_PRICE = {1: 100_000, 2: 250_000, 3: 300_000}
DATA_SALE_MIX = {1: 0.55, 2: 0.30, 3: 0.15}
AVG_DATA_PRICE = sum(DATA_PRICE[k] * w for k, w in DATA_SALE_MIX.items())
EFFECTIVE_DATA_PRICE = int(AVG_DATA_PRICE * 0.92)  # ≈ ¥161k

# ── NEW in v0.6 ──────────────────────────────────────────────────────────────
PREMIUM_LISTING_PRICE = 20_000   # ¥20k/月 per featured property
PREMIUM_AVG_MONTHS    = 11       # B2B contracts run year-round
SPONSOR_FEE           = 1_500_000  # ¥1.5M/年 per sponsor

# Scan cost reduction (v0.5: ¥50k full outsourced, v0.6: ¥35k blended)
SCAN_COST_V5 = 50_000
SCAN_COST_V6 = 35_000

# ── Scenarios (v0.6) ─────────────────────────────────────────────────────────
# Same subscriber/data baseline as v0.5; layer new revenue + cost saving on top.
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

def arr_breakdown(d):
    indiv_arr  = d["indiv"]    * INDIV_ARPU
    studio_arr = d["studio"]   * STUDIO_ARPU
    team_arr   = d["team"]     * TEAM_ARPU
    data_arr   = d["data"]     * EFFECTIVE_DATA_PRICE
    premium_arr= d["premium"]  * PREMIUM_LISTING_PRICE * PREMIUM_AVG_MONTHS
    sponsor_arr= d["sponsors"] * SPONSOR_FEE
    sub_total  = indiv_arr + studio_arr + team_arr
    total      = sub_total + data_arr + premium_arr + sponsor_arr
    return {
        # counts (raw inputs, kept under _n suffix so they don't collide)
        "props":     d["props"],
        "indiv_n":   d["indiv"],
        "studio_n":  d["studio"],
        "team_n":    d["team"],
        "data_n":    d["data"],
        "premium_n": d["premium"],
        "sponsor_n": d["sponsors"],
        # ARR values
        "indiv":     indiv_arr,
        "studio":    studio_arr,
        "team":      team_arr,
        "data":      data_arr,
        "premium":   premium_arr,
        "sponsor":   sponsor_arr,
        "subtotal":  sub_total,
        "total":     total,
    }

ARRS = {n: {y: arr_breakdown(d) for y, d in yrs.items()} for n, yrs in SCENARIOS.items()}

# v0.5 base Y3 for comparison (no premium/sponsor)
V5_Y3_BASE = (790 * INDIV_ARPU + 470 * STUDIO_ARPU + 50 * TEAM_ARPU
              + 100 * EFFECTIVE_DATA_PRICE)
V5_Y3_BASE = int(V5_Y3_BASE)

# Y3 base P&L (v0.6)
Y3_BASE = ARRS["現実基本"]["Y3"]
Y3_BASE_REV = Y3_BASE["total"]

# v0.5 scan cost (300 new × ¥50k = ¥15M)
# v0.6 scan cost (300 new × ¥35k = ¥10.5M)
SCAN_COST_Y3_V6 = 300 * SCAN_COST_V6
SCAN_SAVING     = 300 * (SCAN_COST_V5 - SCAN_COST_V6)  # ¥4.5M

# Sponsor revenue is invoice-based, no Stripe fee (3.6% applied only to sub + data + premium)
STRIPE_BASE = Y3_BASE["subtotal"] + Y3_BASE["data"] + Y3_BASE["premium"]

Y3_COSTS = {
    "インフラ (R2/Workers/Clerk)":           1_800_000,
    "Stripe 手数料 (3.6%、サブ+データ+優先表示)": int(STRIPE_BASE * 0.036),
    "スキャン制作 (300 物件 × ¥35k)":          SCAN_COST_Y3_V6,
    "学生バイト育成 / フリーランス管理":         600_000,
    "人件費 (代表 + 2 名)":                   18_000_000,
    "マーケ (ARR の 18%)":                    int(Y3_BASE_REV * 0.18),
    "事務所 / その他":                        2_400_000,
}
Y3_TOTAL_COST = sum(Y3_COSTS.values())
Y3_OP_PROFIT  = Y3_BASE_REV - Y3_TOTAL_COST

# Contribution decomposition: v0.5 → v0.6 (Y3 base)
contrib = [
    ("v0.5 基本 Y3 ARR",                                   V5_Y3_BASE),
    ("+ 優先表示 ¥20k/月 × 80 物件 × 11 ヶ月",             80 * PREMIUM_LISTING_PRICE * 11),
    ("+ 機材メーカースポンサー 3 社 × ¥1.5M",              3 * SPONSOR_FEE),
    ("v0.6 基本 Y3 ARR",                                   Y3_BASE_REV),
]

# ── Build PDF ────────────────────────────────────────────────────────────────
def build(path: Path) -> None:
    doc = SimpleDocTemplate(
        str(path), pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm, topMargin=22*mm, bottomMargin=20*mm,
        title="ロケハン3D オンライン 物件数×収益試算 v0.6 (利益最大化施策)",
        author="ロケハン3D",
    )
    story = []

    # ── Cover ──────────────────────────────────────────────────────────────
    story.append(Spacer(1, 50*mm))
    story.append(Paragraph("LOCAHUN 3D / ONLINE", s_meta))
    story.append(Spacer(1, 4))
    story.append(Paragraph("事業売上予想 v0.6", s_title))
    story.append(Paragraph(
        "v0.5 (トークン + データ販売) に対して、利益最大化のための 3 施策を追加: "
        "スタジオ側「優先表示」¥20,000/月、機材メーカースポンサー、スキャン内製化 "
        "(学生バイト + サイト内広告で募るフリーランス、1 撮影 ¥30-40k)。",
        s_subtitle,
    ))
    story.append(Spacer(1, 25*mm))
    cover_meta = [
        ["バージョン",            "v0.6 (profit maximization)"],
        ["v0.5 からの変更",       "優先表示 + スポンサー + スキャン内製化"],
        ["対象期間",              "Y1 (2027) — Y3 (2029)"],
        ["参考 v0.5 基本 Y3 ARR", manen(V5_Y3_BASE)],
        ["v0.6 基本 Y3 ARR",      manen(Y3_BASE_REV) + f" ({(Y3_BASE_REV/V5_Y3_BASE - 1)*100:+.0f}%)"],
        ["v0.6 基本 Y3 OP",       manen(Y3_OP_PROFIT) + f" (margin {Y3_OP_PROFIT/Y3_BASE_REV*100:.0f}%)"],
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

    # ── 1. 3 つの施策の設計 ────────────────────────────────────────────────
    story.append(Paragraph("1. 3 つの利益最大化施策", s_h1))

    story.append(Paragraph("① 優先表示アップセル (スタジオ側課金)", s_h2))
    story.append(Paragraph(
        "スタジオ運営者向けに、月額 ¥20,000 で物件カタログの上位表示権を販売。"
        "通常掲載は無料を維持 (取りこぼし防止)、追加で「もっと露出したい」"
        "スタジオだけが対象。",
        s_body,
    ))
    feat = [
        ["項目",                "設計"],
        ["価格",                f"{yen(PREMIUM_LISTING_PRICE)} / 月"],
        ["対象",                "現在の物件オーナー (掲載済スタジオ)"],
        ["取得施設の見込み",    "全物件の 10-16% (Y3 で 80 物件想定)"],
        ["優先表示の中身",      "/properties トップ、カテゴリページ、関連物件枠で上位固定"],
        ["契約形態",            "月次サブスク (Stripe Subscriptions)"],
        ["Y3 ARR 寄与",         manen(80 * PREMIUM_LISTING_PRICE * 11)],
    ]
    story.append(base_table(feat, [50*mm, 110*mm]))

    story.append(Paragraph("② 機材メーカースポンサーシップ (小規模)", s_h2))
    story.append(Paragraph(
        "ARRI / RED / Aputure / Atomos / Profoto 等の業界機材メーカーから"
        "年契約スポンサーを 2-3 社獲得。サイト内バナー枠、ニュースレター枠、"
        "イベント協賛など。広告というより「業界パートナー」のステータス販売。",
        s_body,
    ))
    sponsor = [
        ["項目",                "設計"],
        ["価格",                f"{yen(SPONSOR_FEE)} / 年 (1 社あたり)"],
        ["想定社数",            "Y1: 1 社 → Y2: 2 社 → Y3: 3 社"],
        ["対象",                "シネマ機材メーカー、照明、レンズ、レコーダー、編集ソフト"],
        ["提供価値",            "サイトバナー、ロケハン3D 主催イベント協賛権、月次レポート掲載"],
        ["契約形態",            "年契約・請求書払い (Stripe 不要)"],
        ["Y3 ARR 寄与",         manen(3 * SPONSOR_FEE)],
    ]
    story.append(base_table(sponsor, [50*mm, 110*mm]))

    story.append(PageBreak())

    story.append(Paragraph("③ スキャン内製化 (学生バイト + サイト内広告募集)", s_h2))
    story.append(Paragraph(
        "現状 1 物件あたり ¥50,000 で外部スキャン会社に依頼。これを 2 ルートで圧縮:",
        s_body,
    ))
    scan = [
        ["施策",                       "詳細",                                    "コスト"],
        ["学生アルバイト育成",         "撮影系学校 / 専門学校から募集、社内研修", "@¥15-20k/件 (時給ベース)"],
        ["フリーランス公募",           "サイト内 (admin /admin/scanner-jobs) で募集", "@¥30-40k/件"],
        ["品質チェック (社内)",        "代表 or オペが最終 QC",                   "1 件 30 分 ≒ ¥3k"],
        ["新平均単価",                 "学生 40% + フリー 60% の加重平均",        f"{yen(SCAN_COST_V6)} / 件"],
        ["Y3 削減額",                  "300 件 × (¥50k - ¥35k)",                  manen(SCAN_SAVING) + " / 年"],
    ]
    story.append(base_table(scan, [40*mm, 80*mm, 40*mm]))

    story.append(Paragraph(
        "<b>副次効果</b>: フリーランス公募ページは将来「スキャン代行マーケットプレイス」"
        "に育てられる。スタジオ運営者が直接スキャナーを探せる仕組みにすれば、"
        "ロケハン3D が仲介手数料 (5-10%) を取る別収益源にも展開可能 (Y4 以降の選択肢)。",
        s_callout,
    ))

    story.append(PageBreak())

    # ── 2. Y3 ARR — 3 シナリオ ─────────────────────────────────────────────
    story.append(Paragraph("2. Y3 ARR — 3 シナリオ (v0.6)", s_h1))

    sc_table = [["シナリオ", "物件", "Indiv", "Studio", "Team", "データ", "優先", "Sponsor", "Y3 ARR"]]
    for name in ["現実下限", "現実基本", "頑張れば"]:
        y3 = ARRS[name]["Y3"]
        sc_table.append([
            name,
            f"{y3['props']:,}",
            f"{y3['indiv_n']:,}",
            f"{y3['studio_n']:,}",
            f"{y3['team_n']:,}",
            f"{y3['data_n']:,}",
            f"{y3['premium_n']:,}",
            f"{y3['sponsor_n']:,}",
            manen(y3['total']),
        ])
    story.append(base_table(sc_table, [22*mm, 14*mm, 14*mm, 14*mm, 14*mm, 16*mm, 14*mm, 16*mm, 25*mm]))

    story.append(Paragraph("収益源別 Y3 ARR 構成比 (現実基本)", s_h2))
    base_y3 = ARRS["現実基本"]["Y3"]
    base_total = base_y3["total"]
    mix = [
        ["収益源",         "ARR",                       "構成比"],
        ["Individual",      manen(base_y3["indiv"]),     f"{base_y3['indiv']/base_total*100:.1f}%"],
        ["Studio",          manen(base_y3["studio"]),    f"{base_y3['studio']/base_total*100:.1f}%"],
        ["Team",            manen(base_y3["team"]),      f"{base_y3['team']/base_total*100:.1f}%"],
        ["データ販売",      manen(base_y3["data"]),      f"{base_y3['data']/base_total*100:.1f}%"],
        ["優先表示 (新)",   manen(base_y3["premium"]),   f"{base_y3['premium']/base_total*100:.1f}%"],
        ["スポンサー (新)", manen(base_y3["sponsor"]),   f"{base_y3['sponsor']/base_total*100:.1f}%"],
        ["合計",            manen(base_total),            "100.0%"],
    ]
    story.append(base_table(mix, [50*mm, 50*mm, 50*mm]))

    story.append(PageBreak())

    # ── 3. v0.5 → v0.6 差分 ─────────────────────────────────────────────────
    story.append(Paragraph("3. v0.5 → v0.6 差分分解 (Y3 基本)", s_h1))

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

    diff_pct = (Y3_BASE_REV / V5_Y3_BASE - 1) * 100
    story.append(Paragraph(
        f"<b>v0.5 基本 {manen(V5_Y3_BASE)} → v0.6 基本 {manen(Y3_BASE_REV)} ({diff_pct:+.0f}%)</b>。"
        "ARR の純増は +¥22M だが、内訳の粗利率が高い (優先表示 95%+、スポンサー 100%) ため、"
        "営業利益への寄与は ARR 寄与より大きい。",
        s_callout,
    ))

    story.append(PageBreak())

    # ── 4. 3 年推移 ─────────────────────────────────────────────────────────
    story.append(Paragraph("4. 3 年推移 — 現実基本 (v0.6)", s_h1))

    trend = [["指標", "Y1 (2027)", "Y2 (2028)", "Y3 (2029)"]]
    count_keys = {"props", "indiv_n", "studio_n", "team_n", "data_n", "premium_n", "sponsor_n"}
    label_key = [
        ("物件数",            "props"),
        ("Indiv 会員 (人)",   "indiv_n"),
        ("Studio 会員 (社)",  "studio_n"),
        ("Team 会員 (社)",    "team_n"),
        ("データ販売 (件)",   "data_n"),
        ("優先表示 (枠)",     "premium_n"),
        ("スポンサー (社)",   "sponsor_n"),
        ("Indiv ARR",         "indiv"),
        ("Studio ARR",        "studio"),
        ("Team ARR",          "team"),
        ("データ ARR",        "data"),
        ("優先表示 ARR",      "premium"),
        ("スポンサー ARR",    "sponsor"),
        ("合計 ARR",          "total"),
    ]
    for label, key in label_key:
        row = [label]
        for y in ["Y1", "Y2", "Y3"]:
            v = ARRS["現実基本"][y][key]
            row.append(f"{v:,}" if key in count_keys else manen(v))
        trend.append(row)
    trend.append([
        "合計 MRR",
        manen(ARRS["現実基本"]["Y1"]["total"] // 12),
        manen(ARRS["現実基本"]["Y2"]["total"] // 12),
        manen(ARRS["現実基本"]["Y3"]["total"] // 12),
    ])
    story.append(base_table(trend, [42*mm, 33*mm, 33*mm, 33*mm]))

    story.append(PageBreak())

    # ── 5. Y3 損益試算 ──────────────────────────────────────────────────────
    story.append(Paragraph("5. Y3 損益試算 — 現実基本 (v0.6)", s_h1))
    story.append(Paragraph(
        f"Y3 ARR <b>{manen(Y3_BASE_REV)}</b>、営業利益 <b>{manen(Y3_OP_PROFIT)}</b> "
        f"(margin <b>{Y3_OP_PROFIT/Y3_BASE_REV*100:.0f}%</b>)。"
        "v0.5 の margin 44% から +8pt 改善。スキャン内製化と高粗利の新収益源が効く。",
        s_body,
    ))

    pl_table = [["項目", "年額", "備考"]]
    notes = {
        "インフラ (R2/Workers/Clerk)":               "MAU 8,000 想定",
        "Stripe 手数料 (3.6%、サブ+データ+優先表示)": "スポンサーは請求書なので除外",
        "スキャン制作 (300 物件 × ¥35k)":             "v0.5 ¥15M から ¥4.5M 削減",
        "学生バイト育成 / フリーランス管理":            "研修費 / 募集ページ運用 / QC 時間",
        "人件費 (代表 + 2 名)":                       "代表 ¥14M + エンジ 1 + 営業/オペ 1",
        "マーケ (ARR の 18%)":                        "v0.5 の 20% から効率改善で削減",
        "事務所 / その他":                            "登記住所 / 交通費 / 備品",
    }
    for k, v in Y3_COSTS.items():
        pl_table.append([k, yen(v), notes.get(k, "")])
    pl_table.append(["コスト合計", yen(Y3_TOTAL_COST), ""])
    pl_table.append(["売上 (ARR)", yen(Y3_BASE_REV), ""])
    pl_table.append(["営業利益", yen(Y3_OP_PROFIT), f"{Y3_OP_PROFIT/Y3_BASE_REV*100:.0f}% margin"])
    story.append(base_table(pl_table, [60*mm, 35*mm, 70*mm]))

    story.append(PageBreak())

    # ── 6. 代表手取り + M&A ───────────────────────────────────────────────
    story.append(Paragraph("6. 代表手取り + M&A (v0.6)", s_h1))

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

    story.append(Paragraph(
        f"v0.5 (¥17.4M net) → v0.6 (<b>{yen(total_net)} net</b>、+{int((total_net/17_418_478-1)*100)}%)。"
        f"留保 {yen(retained)} は Y4 のスキャナーチーム拡大 / 海外展開原資。",
        s_callout,
    ))

    story.append(Paragraph("M&A バリュエーション (v0.6)", s_h2))
    # SaaS recurring (sub + premium listing) at 5x, transactional (data + sponsor) at 2x
    saas_arr = base_y3["subtotal"] + base_y3["premium"]
    txn_arr  = base_y3["data"] + base_y3["sponsor"]
    saas_val = saas_arr * 5
    txn_val  = txn_arr * 2
    total_val = saas_val + txn_val
    net_val = int(total_val * 0.797)

    ma_compose = [
        ["評価項目",             "ARR",              "倍率",  "売却価値"],
        ["サブスク + 優先表示",   manen(saas_arr),    "5x",    manen(saas_val)],
        ["データ販売 + スポンサー", manen(txn_arr),    "2x",    manen(txn_val)],
        ["合計",                  manen(saas_arr + txn_arr), "—", manen(total_val)],
        ["代表 net (税後 80%)",   "—",               "—",     manen(net_val)],
    ]
    story.append(base_table(ma_compose, [60*mm, 35*mm, 25*mm, 40*mm]))

    story.append(PageBreak())

    # ── 7. 全バージョン比較 ─────────────────────────────────────────────────
    story.append(Paragraph("7. v0.1〜v0.6 横断比較", s_h1))

    versions = [
        ["ver",       "Y3 ARR (基本)",    "Y3 OP",            "margin", "代表 net",        "M&A net",            "主な変化"],
        ["v0.1",       "¥2.94億",          "¥141M",            "49%",    "¥44M",             "¥11.5億",            "単純試算 (楽観)"],
        ["v0.2",       "¥2.88億",          "—",                 "—",      "—",                "—",                   "解約現実化 + Pass"],
        ["v0.3",       "¥7,600万",         "¥18M",              "23%",    "¥11.5M",           "¥3.05億",            "Bootstrap 現実"],
        ["v0.4",       "¥9,400万",         "¥33M",              "35%",    "¥13.3M",           "¥3.74億",            "Studio + 年払 + Pass"],
        ["v0.5",       "¥1.16億",          "¥51M",              "44%",    "¥17.4M",           "¥4.22億",            "トークン + データ販売"],
        ["v0.6 (現行)", manen(Y3_BASE_REV), manen(Y3_OP_PROFIT), f"{Y3_OP_PROFIT/Y3_BASE_REV*100:.0f}%", manen(total_net), manen(net_val), "+ 優先表示 + Sponsor + 内製化"],
    ]
    story.append(base_table(versions, [16*mm, 25*mm, 22*mm, 14*mm, 20*mm, 22*mm, 50*mm]))

    story.append(Paragraph("v0.6 が描く絵", s_h2))
    story.append(Paragraph(
        f"■ Y3 OP <b>{manen(Y3_OP_PROFIT)}</b> = v0.5 比 +¥22M (+45%)。"
        f"margin <b>{Y3_OP_PROFIT/Y3_BASE_REV*100:.0f}%</b> は SaaS 業界トップティア。<br/>"
        f"■ 代表 net <b>{manen(total_net)}</b>、留保 <b>{manen(retained)}</b>。"
        "Y4 で海外展開 / スキャナーチーム拡大 / 新機能投資の原資が出る。<br/>"
        "■ スキャン内製化はサイト内広告で募集 → 「スキャナー登録」自体が将来の "
        "<b>マーケットプレイス機能</b> に発展する。Y4-Y5 で仲介手数料 5-10% の新収益源候補。<br/>"
        "■ スポンサーは <b>業界との繋がりを売る</b> 性質。中村さんの撮影業界ネットワークが"
        "そのままレバレッジになる、ブートストラップ向きの収益源。",
        s_small,
    ))

    story.append(Paragraph("Y1 → Y3 のアクションリスト", s_h2))
    actions = [
        ["時期",        "アクション",                                          "目標"],
        ["2026 Q4",     "MVP ローンチ、サブスク 3 + データ販売",                 "30 物件 / 50 ユーザー"],
        ["2027 Q1",     "/admin/scanner-jobs ページ + 学生バイト 2 名募集",      "スキャン内製率 40%"],
        ["2027 Q2",     "/studio-partner ページで優先表示 ¥20k 売り出し",        "4 物件契約"],
        ["2027 Q3",     "機材メーカー 1 社目スポンサー獲得",                     "¥1.5M 計上"],
        ["2027 Q4",     "Y1 締め: ARR ¥7M / OP ¥1M 想定",                       "黒字化"],
        ["2028 H1",     "優先表示を 25 物件まで、Sponsor 2 社目",                "Y2 中間: ARR ¥20M"],
        ["2028 H2",     "Studio プラン値上げ判断、データ販売営業強化",           "Y2 ARR ¥40M 目指す"],
        ["2029",        "全施策フル稼働、Y3 ARR ¥1.4億達成",                    "代表 net ¥22M"],
    ]
    story.append(base_table(actions, [25*mm, 75*mm, 55*mm]))

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)


if __name__ == "__main__":
    out = Path(__file__).parent / "business_projection_v6.pdf"
    build(out)
    print(f"Generated: {out}")
