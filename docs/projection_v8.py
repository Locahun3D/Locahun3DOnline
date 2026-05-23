"""
ロケハン3D オンライン — 物件数 × 収益試算 (v0.8)

v0.7 からの変更:
  + API 提供構想を組み込み (控えめな数字で)
    - Embed SDK / REST / Bulk Download の 3 形態
    - Hobby (¥0) / Pro (¥10k/月) / Business (¥50k/月) / Enterprise (¥200k/月)
    - Y2 β、Y3 一般公開のロードマップ前提
    - **意図的に控えめな成長想定** (Pro 5社・Biz 2社・Ent 1社 @ Y3)
    - 意外な上振れではなく「外れない最低ライン」を見せる

実行:
    python docs/projection_v8.py
出力:
    docs/business_projection_v8.pdf
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
    canvas.drawString(20*mm, A4[1]-12*mm, "LOCAHUN 3D / ONLINE — REVENUE PROJECTION v0.8 (+ Conservative API)")
    canvas.drawRightString(A4[0]-20*mm, A4[1]-12*mm, "INTERNAL — 2026-05-24")
    canvas.line(20*mm, 15*mm, A4[0]-20*mm, 15*mm)
    canvas.drawString(20*mm, 10*mm, "ロケハン3D オンライン")
    canvas.drawRightString(A4[0]-20*mm, 10*mm, f"Page {doc.page}")
    canvas.restoreState()

# ── Pricing (v0.7 carry-over) ────────────────────────────────────────────────
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

DATA_PRICE = {1: 100_000, 2: 250_000, 3: 300_000}
DATA_SALE_MIX = {1: 0.55, 2: 0.30, 3: 0.15}
DATA_UNIT = int(sum(DATA_PRICE[k] * w for k, w in DATA_SALE_MIX.items()))  # 175k (満額)

PREMIUM_LISTING_PRICE = 20_000
PREMIUM_AVG_MONTHS    = 11
SPONSOR_FEE           = 1_500_000

SCAN_COST = 35_000

# ── NEW in v0.8: API tier pricing ────────────────────────────────────────────
API_PRO_PRICE        = 10_000   # ¥/月
API_BUSINESS_PRICE   = 50_000   # ¥/月
API_ENTERPRISE_PRICE = 200_000  # ¥/月

# 控えめ平均稼働月数 (新規顧客は半期しか平均稼働しないことが多い)
API_PRO_MONTHS_Y3        = 8     # 8 ヶ月稼働 / 年
API_BIZ_MONTHS_Y3        = 8
API_ENT_MONTHS_Y3        = 6     # Enterprise は契約交渉長く Y3 半ばに 1 件

# ── Scenarios (v0.7 from v0.7 + conservative API counts) ────────────────────
SCENARIOS = {
    "現実下限": {
        "Y1": dict(props=30,  indiv=30,  studio=10,  team=2,  data=3,   premium=2,  sponsors=0,
                   api_pro=0, api_biz=0, api_ent=0),
        "Y2": dict(props=100, indiv=110, studio=50,  team=8,  data=20,  premium=10, sponsors=1,
                   api_pro=0, api_biz=0, api_ent=0),
        "Y3": dict(props=200, indiv=280, studio=180, team=18, data=50,  premium=30, sponsors=2,
                   api_pro=2, api_biz=1, api_ent=0),  # 控えめ: 1 Biz のみ、Ent なし
    },
    "現実基本": {
        "Y1": dict(props=50,  indiv=60,  studio=20,  team=4,  data=5,   premium=4,  sponsors=1,
                   api_pro=0, api_biz=0, api_ent=0),
        "Y2": dict(props=200, indiv=250, studio=150, team=18, data=40,  premium=25, sponsors=2,
                   api_pro=2, api_biz=0, api_ent=0),  # Y2 β で 2 Pro 顧客のみ
        "Y3": dict(props=500, indiv=790, studio=470, team=50, data=100, premium=80, sponsors=3,
                   api_pro=5, api_biz=2, api_ent=1),  # 控えめ: Pro 5 / Biz 2 / Ent 1
    },
    "頑張れば": {
        "Y1": dict(props=80,  indiv=110, studio=40,  team=8,  data=10,  premium=10, sponsors=2,
                   api_pro=0, api_biz=0, api_ent=0),
        "Y2": dict(props=350, indiv=500, studio=280, team=35, data=80,  premium=60, sponsors=3,
                   api_pro=5, api_biz=1, api_ent=0),
        "Y3": dict(props=800, indiv=1500,studio=700, team=100,data=200, premium=150,sponsors=5,
                   api_pro=12,api_biz=4, api_ent=2),  # 頑張れば シナリオでも控えめ気味
    },
}

def arr_breakdown(d):
    indiv_arr  = d["indiv"]   * INDIV_ARPU
    studio_arr = d["studio"]  * STUDIO_ARPU
    team_arr   = d["team"]    * TEAM_ARPU
    data_arr   = d["data"]    * DATA_UNIT
    prem_arr   = d["premium"] * PREMIUM_LISTING_PRICE * PREMIUM_AVG_MONTHS
    spons_arr  = d["sponsors"]* SPONSOR_FEE
    api_arr    = (d["api_pro"] * API_PRO_PRICE       * API_PRO_MONTHS_Y3
                + d["api_biz"] * API_BUSINESS_PRICE  * API_BIZ_MONTHS_Y3
                + d["api_ent"] * API_ENTERPRISE_PRICE* API_ENT_MONTHS_Y3)
    sub_total  = indiv_arr + studio_arr + team_arr
    total      = sub_total + data_arr + prem_arr + spons_arr + api_arr
    return {
        "props":     d["props"],
        "indiv_n":   d["indiv"],   "studio_n": d["studio"], "team_n": d["team"],
        "data_n":    d["data"],    "premium_n":d["premium"],"sponsor_n":d["sponsors"],
        "api_pro_n": d["api_pro"], "api_biz_n":d["api_biz"], "api_ent_n":d["api_ent"],
        "indiv":     indiv_arr,    "studio":   studio_arr,  "team":   team_arr,
        "data":      data_arr,     "premium":  prem_arr,    "sponsor":spons_arr,
        "api":       api_arr,
        "subtotal":  sub_total,    "total":    total,
    }

ARRS = {n: {y: arr_breakdown(d) for y, d in yrs.items()} for n, yrs in SCENARIOS.items()}

# v0.7 base (no API) for comparison
V7_BASE_Y3 = ARRS["現実基本"]["Y3"]["total"] - ARRS["現実基本"]["Y3"]["api"]
Y3_BASE = ARRS["現実基本"]["Y3"]
Y3_TOTAL = Y3_BASE["total"]

# Cost structure (v0.7 + small additional API ops cost)
def costs_for(arr):
    stripe_base = arr["subtotal"] + arr["data"] + arr["premium"] + arr["api"]
    return {
        "インフラ (R2/Workers/Clerk)":           1_800_000,
        "Stripe 手数料 (3.6%)":                   int(stripe_base * 0.036),
        "スキャン制作 (300 物件 × ¥35k)":          300 * SCAN_COST,
        "学生バイト育成 / フリーランス管理":         600_000,
        "人件費 (代表 + 2 名)":                   18_000_000,
        "API 運用 (docs / monitoring / 法務)":     1_500_000,  # 控えめ
        "マーケ (ARR の 22%)":                    int(arr["total"] * 0.22),
        "事務所 / その他":                        2_400_000,
    }

Y3_COSTS = costs_for(Y3_BASE)
Y3_TOTAL_COST = sum(Y3_COSTS.values())
Y3_OP = Y3_TOTAL - Y3_TOTAL_COST

# ── Build PDF ────────────────────────────────────────────────────────────────
def build(path: Path) -> None:
    doc = SimpleDocTemplate(
        str(path), pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm, topMargin=22*mm, bottomMargin=20*mm,
        title="ロケハン3D オンライン 物件数×収益試算 v0.8",
        author="ロケハン3D",
    )
    story = []

    # ── Cover ──────────────────────────────────────────────────────────────
    story.append(Spacer(1, 50*mm))
    story.append(Paragraph("LOCAHUN 3D / ONLINE", s_meta))
    story.append(Spacer(1, 4))
    story.append(Paragraph("事業売上予想 v0.8", s_title))
    story.append(Paragraph(
        "v0.7 に <b>API 提供構想</b>を控えめな数字で組み込み。"
        "Y1 は未着手、Y2 β、Y3 一般公開のロードマップ。"
        "意図的に保守的な顧客数で「外れない最低ライン」を見せる。",
        s_sub,
    ))
    story.append(Spacer(1, 25*mm))
    cover_meta = [
        ["バージョン",              "v0.8 (+ conservative API, 2026-05-24)"],
        ["v0.7 からの変更",         "API tier 構想を 4 段で追加 (Hobby/Pro/Biz/Ent)"],
        ["スタンス",                "意外な上振れではなく外れない最低ライン"],
        ["参考: v0.7 基本 Y3 ARR",  manen(V7_BASE_Y3)],
        ["v0.8 基本 Y3 ARR (API込)",manen(Y3_TOTAL) + f" (+{(Y3_TOTAL/V7_BASE_Y3-1)*100:.1f}%)"],
        ["うち API 寄与",           manen(Y3_BASE["api"]) + " / Pro 5社 + Biz 2社 + Ent 1社"],
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

    # ── 1. API 構想 ────────────────────────────────────────────────────────
    story.append(Paragraph("1. API 提供構想 (3 形態)", s_h1))
    story.append(Paragraph(
        "Cloudflare R2 の egress 完全無料を活かし、データ配信が"
        "実質ゼロコストになる利点を最大化。3 つの提供形態と 4 段プラン。",
        s_body,
    ))

    forms = [
        ["形態",                          "想定ユーザー",                            "実装"],
        ["A. Embed SDK (script タグ)",    "撮影機材レンタル / 不動産メディア / 教育 LMS", "iframe wrapper + JS init"],
        ["B. REST API (metadata + URL)",  "大手プロダクション内製ツール",               "Workers + Cloudflare KV"],
        ["C. Bulk Download API (splat/ply/obj)", "VFX / AI/ML 学習データセット",         "R2 presigned URL + watermark"],
    ]
    story.append(base_table(forms, [55*mm, 65*mm, 50*mm]))

    story.append(Paragraph("価格プラン", s_h2))
    plans = [
        ["プラン",     "月額",                          "API request",          "想定ユーザー"],
        ["Hobby",       "¥0",                           "10 / 月 (Watermark)",  "個人開発、学生プロジェクト"],
        ["Pro",         yen(API_PRO_PRICE),             "1,000 / 月",            "個人開発、小規模商用"],
        ["Business",    yen(API_BUSINESS_PRICE),        "10,000 / 月 + SDK",     "中小プロダクション内製"],
        ["Enterprise",  yen(API_ENTERPRISE_PRICE) + "+", "無制限 + SLA + DL含",   "Sony / リクルート 等"],
    ]
    story.append(base_table(plans, [30*mm, 30*mm, 50*mm, 60*mm]))

    story.append(PageBreak())

    # ── 2. 控えめ前提の根拠 ───────────────────────────────────────────────
    story.append(Paragraph("2. 控えめシナリオを採る理由", s_h1))
    story.append(Paragraph(
        "API ビジネスは「数年かけて開発者コミュニティを育てる」性質。"
        "Y3 で大成功する事業ではない。以下 5 つの理由で意図的に保守的に計上:",
        s_body,
    ))

    reasons = [
        ["#", "理由",                                               "数字への反映"],
        ["①", "API 認知に 2-3 年かかる (ドキュメント / 事例構築)",     "Y1 開発なし、Y2 β、Y3 開始"],
        ["②", "Enterprise の営業サイクルは 6-12 ヶ月",                  "Y3 で 1 件のみ (6ヶ月稼働)"],
        ["③", "Free→有料 CV は B2B 開発ツールで 1-2%",                 "Hobby 多数 → Pro 5 だけ"],
        ["④", "Watermark / IP 監視のオペレーション負荷",               "売上小さくても完成度要"],
        ["⑤", "撮影業界自体が API 文化に慣れていない",                 "教育コスト前提"],
    ]
    story.append(base_table(reasons, [12*mm, 80*mm, 65*mm]))

    story.append(Paragraph(
        "v0.8 基本シナリオでは Y3 で <b>Pro 5 / Business 2 / Enterprise 1</b> の "
        f"控えめ前提。これでも API ARR <b>{manen(Y3_BASE['api'])}</b> "
        "を計上できる ─ 「無くてもいいが、あれば堅実な追加収益」というレンジ。",
        s_call,
    ))

    story.append(PageBreak())

    # ── 3. Y3 ARR — 3 シナリオ ─────────────────────────────────────────────
    story.append(Paragraph("3. Y3 ARR — 3 シナリオ (v0.8)", s_h1))

    sc = [["シナリオ", "サブスク+データ+優先表示+スポンサー", "API Pro", "API Biz", "API Ent", "API 合計", "Y3 ARR"]]
    for name in ["現実下限", "現実基本", "頑張れば"]:
        y3 = ARRS[name]["Y3"]
        non_api = y3["total"] - y3["api"]
        sc.append([
            name,
            manen(non_api),
            f"{y3['api_pro_n']:,}",
            f"{y3['api_biz_n']:,}",
            f"{y3['api_ent_n']:,}",
            manen(y3["api"]),
            manen(y3["total"]),
        ])
    story.append(base_table(sc, [22*mm, 45*mm, 16*mm, 16*mm, 16*mm, 22*mm, 28*mm]))

    story.append(Paragraph("収益源別 Y3 ARR 構成比 (現実基本)", s_h2))
    bt = Y3_TOTAL
    mix = [
        ["収益源",        "ARR",                       "構成比"],
        ["Individual",     manen(Y3_BASE["indiv"]),     f"{Y3_BASE['indiv']/bt*100:.1f}%"],
        ["Studio",         manen(Y3_BASE["studio"]),    f"{Y3_BASE['studio']/bt*100:.1f}%"],
        ["Team",           manen(Y3_BASE["team"]),      f"{Y3_BASE['team']/bt*100:.1f}%"],
        ["データ販売",     manen(Y3_BASE["data"]),      f"{Y3_BASE['data']/bt*100:.1f}%"],
        ["優先表示",       manen(Y3_BASE["premium"]),   f"{Y3_BASE['premium']/bt*100:.1f}%"],
        ["スポンサー",     manen(Y3_BASE["sponsor"]),   f"{Y3_BASE['sponsor']/bt*100:.1f}%"],
        ["API (新)",       manen(Y3_BASE["api"]),       f"{Y3_BASE['api']/bt*100:.1f}%"],
        ["合計",           manen(bt),                   "100.0%"],
    ]
    story.append(base_table(mix, [50*mm, 50*mm, 50*mm]))

    story.append(PageBreak())

    # ── 4. ロードマップ ─────────────────────────────────────────────────────
    story.append(Paragraph("4. API のロードマップ", s_h1))

    rm = [
        ["時期",         "アクション",                                  "想定効果"],
        ["2027 (Y1)",    "API 構想を温める、api.locahun3d.com 予約",       "—"],
        ["2028 H1 (Y2)", "β: Embed SDK + Pro tier ¥10k、招待制 5 社",    "ARR +¥40-100k"],
        ["2028 H2 (Y2)", "Pro 一般公開、ドキュメント整備",                "ARR +¥100-200k"],
        ["2029 H1 (Y3)", "Business tier ¥50k 公開、SDK 強化",            "Biz 2 社目標"],
        ["2029 H2 (Y3)", "Enterprise 営業開始、初の年契約獲得",          "Ent 1 社 ¥200k×6mo"],
        ["2030 (Y4)",    "Stripe Connect で開発者収益シェア (15% 手数料)", "プラットフォーム化"],
    ]
    story.append(base_table(rm, [28*mm, 70*mm, 60*mm]))

    story.append(PageBreak())

    # ── 5. Y3 損益試算 ──────────────────────────────────────────────────────
    story.append(Paragraph("5. Y3 損益試算 — 現実基本 (v0.8)", s_h1))
    story.append(Paragraph(
        f"Y3 ARR <b>{manen(Y3_TOTAL)}</b>、営業利益 <b>{manen(Y3_OP)}</b> "
        f"(margin <b>{Y3_OP/Y3_TOTAL*100:.0f}%</b>)。"
        "API 運用コスト ¥150 万を計上、これでも +¥73 万 OP 寄与。",
        s_body,
    ))

    pl_table = [["項目", "年額", "備考"]]
    notes = {
        "インフラ (R2/Workers/Clerk)":               "MAU 8,000 想定、API は R2 egress 無料で追加コストほぼゼロ",
        "Stripe 手数料 (3.6%)":                       "サブ+データ+優先+API に適用",
        "スキャン制作 (300 物件 × ¥35k)":             "v0.6-v0.7 と同水準",
        "学生バイト育成 / フリーランス管理":            "研修費 / QC 時間",
        "人件費 (代表 + 2 名)":                       "API は既存エンジ兼務、追加採用なし",
        "API 運用 (docs / monitoring / 法務)":        "ドキュメント、KV、利用ログ監視、利用規約改訂",
        "マーケ (ARR の 22%)":                        "v0.7 と同水準",
        "事務所 / その他":                            "—",
    }
    for k, v in Y3_COSTS.items():
        pl_table.append([k, yen(v), notes.get(k, "")])
    pl_table.append(["コスト合計", yen(Y3_TOTAL_COST), ""])
    pl_table.append(["売上 (ARR)", yen(Y3_TOTAL), ""])
    pl_table.append(["営業利益", yen(Y3_OP), f"{Y3_OP/Y3_TOTAL*100:.0f}% margin"])
    story.append(base_table(pl_table, [60*mm, 35*mm, 70*mm]))

    story.append(PageBreak())

    # ── 6. 代表手取り + M&A ───────────────────────────────────────────────
    story.append(Paragraph("6. 代表手取り + M&A 影響", s_h1))

    salary = 14_000_000
    corp_pretax = Y3_OP - salary
    corp_tax = int(corp_pretax * 0.30) if corp_pretax > 0 else 0
    post_tax = corp_pretax - corp_tax
    dividend = int(post_tax * 0.4) if post_tax > 0 else 0
    retained = post_tax - dividend
    salary_net = int(salary * 0.65)
    div_net = int(dividend * 0.80)
    total_net = salary_net + div_net

    comp = [
        ["項目",           "金額"],
        ["営業利益",        yen(Y3_OP)],
        ["役員報酬",        yen(salary)],
        ["法人税前利益",    yen(corp_pretax)],
        ["法人税 (30%)",    yen(corp_tax)],
        ["税後利益",        yen(post_tax)],
        ["配当 (40%)",      yen(dividend)],
        ["留保",            yen(retained)],
        ["—",               "—"],
        ["代表 合計 net",   yen(total_net)],
    ]
    story.append(base_table(comp, [60*mm, 60*mm]))

    story.append(Paragraph("M&A バリュエーション (控えめ評価)", s_h2))
    story.append(Paragraph(
        "API は MRR 性質が強いため SaaS 評価 (5x) に含める。"
        "ただし戦略的 premium は控えめに +5% 程度で計上 (実際には "
        "Adobe / Unity 等が買い手の場合 +15-25% の余地あり)。",
        s_small,
    ))

    saas_arr = Y3_BASE["subtotal"] + Y3_BASE["premium"] + Y3_BASE["api"]
    txn_arr  = Y3_BASE["data"] + Y3_BASE["sponsor"]
    saas_val = int(saas_arr * 5)
    txn_val  = txn_arr * 2
    raw_total = saas_val + txn_val
    strategic_premium = int(raw_total * 0.05)
    total_val = raw_total + strategic_premium
    net_val = int(total_val * 0.797)

    ma = [
        ["評価項目",                          "ARR / 値",        "倍率",  "売却価値"],
        ["サブスク + 優先表示 + API",          manen(saas_arr),    "5x",    manen(saas_val)],
        ["データ販売 + スポンサー",            manen(txn_arr),     "2x",    manen(txn_val)],
        ["戦略買 premium (控えめ +5%)",        "—",                "—",     manen(strategic_premium)],
        ["合計売却額",                        "—",                "—",     manen(total_val)],
        ["代表 net (税後 80%)",                "—",                "—",     manen(net_val)],
    ]
    story.append(base_table(ma, [55*mm, 32*mm, 25*mm, 38*mm]))

    story.append(PageBreak())

    # ── 7. 全バージョン比較 ────────────────────────────────────────────────
    story.append(Paragraph("7. v0.1〜v0.8 横断比較", s_h1))

    versions = [
        ["ver",       "Y3 ARR (基本)",                "Y3 OP",                "代表 net",        "M&A net",            "主な変化"],
        ["v0.1",       "¥2.94億",                      "¥141M",                "¥44M",             "¥11.5億",            "単純試算 (楽観)"],
        ["v0.2",       "¥2.88億",                      "—",                    "—",                "—",                  "解約現実化 + Pass"],
        ["v0.3",       "¥7,600万",                     "¥18M",                 "¥11.5M",           "¥3.05億",            "Bootstrap 現実"],
        ["v0.4",       "¥9,400万",                     "¥33M",                 "¥13.3M",           "¥3.74億",            "Studio + 年払"],
        ["v0.5",       "¥1.16億",                      "¥51M",                 "¥17.4M",           "¥4.22億",            "トークン + データ販売"],
        ["v0.6",       "¥1.38億",                      "¥76M",                 "¥23.0M",           "¥5.00億",            "優先表示 + Sponsor"],
        ["v0.7",       "¥1.39億",                      "¥7,030万",             "¥23M",             "¥4.69億",            "データ販売割引廃止"],
        ["v0.8 (現行)", manen(Y3_TOTAL),               manen(Y3_OP),           manen(total_net),   manen(net_val),       "+ 控えめ API"],
    ]
    story.append(base_table(versions, [16*mm, 28*mm, 26*mm, 22*mm, 22*mm, 48*mm]))

    story.append(Paragraph("v0.8 の含意", s_h2))
    story.append(Paragraph(
        f"■ API 追加で Y3 ARR は <b>{manen(Y3_TOTAL)}</b> "
        f"(v0.7 比 +{((Y3_TOTAL/V7_BASE_Y3)-1)*100:.1f}%、+{manen(Y3_BASE['api'])})。<br/>"
        "■ <b>意図的に控えめ</b>: Pro 5 / Biz 2 / Ent 1 は「やる気のある営業 1 人の最低ライン」。<br/>"
        "■ 実際の上振れポテンシャル: Adobe / Unity 等の戦略パートナー獲得で +¥3-10M / 年も視野。"
        "ただし計上は v0.8 の数字には入れない。<br/>"
        "■ <b>API の価値は M&A 評価</b>: 数字は小さいが「製品 + プラットフォーム」の証拠に。<br/>"
        "■ Y2 β を始めなければ Y3 ARR は v0.7 と同じ。すなわち API 計上はオプショナル。",
        s_small,
    ))

    story.append(PageBreak())

    # ── 8. 過度な期待を抑える注釈 ─────────────────────────────────────────
    story.append(Paragraph("8. 「控えめ」と書いた理由 (繰り返し)", s_h1))
    story.append(Paragraph(
        "本資料の API 数字は <b>「外れない最低ライン」</b> です。次の点に留意してください:",
        s_body,
    ))

    caveats = [
        ["項目",                              "v0.8 の前提",                "実際にあり得るブレ"],
        ["Pro 顧客数 (Y3)",                   "5 社",                       "0-20 社の幅"],
        ["Business 顧客数 (Y3)",              "2 社",                       "0-8 社の幅"],
        ["Enterprise 顧客数 (Y3)",            "1 社",                       "0-3 社、契約期間も変動大"],
        ["稼働月数 (Ent)",                    "6 ヶ月 (年内獲得想定)",       "ゼロ or 12 ヶ月"],
        ["1 社あたり ARPU 上振れ",             "計上なし",                   "大手は ¥500k-1M/月 もあり得る"],
        ["API → サブスク クロスセル効果",     "計上なし",                   "Team プラン契約に繋がる可能性"],
    ]
    story.append(base_table(caveats, [55*mm, 50*mm, 60*mm]))

    story.append(Paragraph(
        "<b>結論</b>: 「API 始めても Y3 で +¥100 万くらいかも」程度の期待値で良い。"
        "それ以上を狙うなら別途専任 (営業 1 名、開発 0.5 人月) が必要 — 今は計上しない。"
        "数字より戦略的位置取り (M&A 評価) を重視する施策と捉えてください。",
        s_call,
    ))

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)


if __name__ == "__main__":
    out = Path(__file__).parent / "business_projection_v8.pdf"
    build(out)
    print(f"Generated: {out}")
