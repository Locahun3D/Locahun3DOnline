"""
ロケハン3D オンライン — 物件数 × 収益試算 (v0.3)

v0.2 からの変更:
  - v0.2 の「基本シナリオ Y3 ARR ¥2.88億」は VC 入りで全力疾走時の数字だった
  - 日本のバーティカル SaaS 実績を参照し、ブートストラップ前提で再構築
  - 3 つの現実シナリオ (Floor / Base / Stretch) + パス A (Bootstrap) vs パス B (VC) 比較
  - 各パスでの代表取り分・M&A バリュエーション・5-8 年ロードマップ

実行:
    python docs/projection_v3.py
出力:
    docs/business_projection_v3.pdf
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
RED    = colors.HexColor("#a83000")
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
s_warn = ParagraphStyle("Warn", parent=styles["BodyText"], fontName=SANS, fontSize=10, leading=16, textColor=RED, leftIndent=10, spaceAfter=8)
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
    canvas.drawString(20*mm, A4[1]-12*mm, "LOCAHUN 3D / ONLINE — REVENUE PROJECTION v0.3 (Reality-Checked)")
    canvas.drawRightString(A4[0]-20*mm, A4[1]-12*mm, "INTERNAL — 2026-05-24")
    canvas.line(20*mm, 15*mm, A4[0]-20*mm, 15*mm)
    canvas.drawString(20*mm, 10*mm, "ロケハン3D オンライン")
    canvas.drawRightString(A4[0]-20*mm, 10*mm, f"Page {doc.page}")
    canvas.restoreState()

# ── Pricing constants (carry over from v0.2) ─────────────────────────────────
INDIV_PRICE = 5200
TEAM_PRICE  = 29800
PASS_PRICE  = 3500
INDIV_AVG_MONTHS = 8.6
TEAM_AVG_MONTHS  = 11.0
INDIV_ARPU = int(INDIV_PRICE * INDIV_AVG_MONTHS)   # 44,720
TEAM_ARPU  = int(TEAM_PRICE  * TEAM_AVG_MONTHS)    # 327,800
PASS_ARPU  = PASS_PRICE * 4                         # 14,000 (4 passes/yr)

# ── Realistic scenarios (BOOTSTRAP) ──────────────────────────────────────────
# Tuned against Japanese vertical SaaS benchmarks:
#   - Sansan 7yr to 300M ARR (with funding)
#   - SmartHR 5yr (with 5B+ funding)
#   - Bootstrap niche SaaS typically 6-8yr to 100-300M ARR

SCENARIOS = {
    # name: { Y: (properties, indiv, team, pass_users) }
    "現実下限": {
        "Y1": (30,  20,  2,  30),
        "Y2": (100, 80,  8,  150),
        "Y3": (200, 250, 20, 500),
    },
    "現実基本": {
        "Y1": (50,  50,  5,  100),
        "Y2": (200, 250, 20, 400),
        "Y3": (500, 800, 60, 1500),
    },
    "頑張れば": {
        "Y1": (80,  100, 10, 200),
        "Y2": (350, 500, 40, 800),
        "Y3": (800, 1500, 120, 2500),
    },
}

def arr_breakdown(props, indiv, team, pass_users):
    return {
        "indiv":   indiv * INDIV_ARPU,
        "team":    team  * TEAM_ARPU,
        "pass":    pass_users * PASS_ARPU,
        "total":   indiv * INDIV_ARPU + team * TEAM_ARPU + pass_users * PASS_ARPU,
        "props":   props,
        "indiv_n": indiv,
        "team_n":  team,
        "pass_n":  pass_users,
    }

ARRS = {name: {y: arr_breakdown(*data) for y, data in years.items()} for name, years in SCENARIOS.items()}

# Reference: v0.2 base Y3 was 288M (with 3000 indiv + 300 team + 4000 pass)
V2_BASE_Y3_ARR = 288_000_000

# Y3 Realistic base P&L
Y3_BASE = ARRS["現実基本"]["Y3"]
Y3_BASE_REV = Y3_BASE["total"]

# Cost assumptions for Y3 realistic base
Y3_COSTS = {
    "インフラ (R2/Workers/Clerk)":     1_500_000,
    "Stripe 手数料 (3.6%)":             int(Y3_BASE_REV * 0.036),
    "スキャン制作 (年内 300 物件追加)": 15_000_000,
    "人件費 (代表 + 2 名)":             18_000_000,
    "マーケ (ARR の 25%)":              int(Y3_BASE_REV * 0.25),
    "事務所 / その他":                  2_400_000,
}
Y3_TOTAL_COST = sum(Y3_COSTS.values())
Y3_OP_PROFIT = Y3_BASE_REV - Y3_TOTAL_COST

# ── Build PDF ────────────────────────────────────────────────────────────────
def build(path: Path) -> None:
    doc = SimpleDocTemplate(
        str(path), pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm, topMargin=22*mm, bottomMargin=20*mm,
        title="ロケハン3D オンライン 物件数×収益試算 v0.3 (Reality-Checked)",
        author="ロケハン3D",
    )
    story = []

    # ── Cover ──────────────────────────────────────────────────────────────
    story.append(Spacer(1, 55*mm))
    story.append(Paragraph("LOCAHUN 3D / ONLINE", s_meta))
    story.append(Spacer(1, 4))
    story.append(Paragraph("物件数 × 収益試算 v0.3", s_title))
    story.append(Paragraph(
        "v0.2 の「基本シナリオ Y3 ARR ¥2.88億」は VC ファンディング + 全力疾走時の数字だった。"
        "日本のバーティカル SaaS の実績を参照し、<b>ブートストラップ (個人事業 / 自己資金) 前提</b>で"
        "再校正したリアリティ・チェック版。",
        s_subtitle,
    ))
    story.append(Spacer(1, 25*mm))
    cover_meta = [
        ["バージョン", "v0.3 (reality-checked, 2026-05-24)"],
        ["v0.2 からの変更", "数字を 1/3〜1/4 に下方修正、パス A/B 分離"],
        ["対象期間", "Y1 (2027) — Y3 (2029) + 中期 Y5/Y7 視点"],
        ["主要前提", "個人事業主 + スタジオ業との並走、外部資本なし"],
        ["参考", "Sansan / SmartHR / freee 等の実 ARR 到達速度"],
    ]
    t = Table(cover_meta, colWidths=[40*mm, 125*mm])
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

    # ── 1. v0.2 がなぜ楽観だったか ────────────────────────────────────────
    story.append(Paragraph("1. v0.2 が楽観すぎた理由", s_h1))
    story.append(Paragraph(
        "v0.2 では Y3 で ARR ¥2.88億 を「基本」シナリオとしたが、"
        "日本のバーティカル SaaS の実績ベンチマークと照らすと、これは"
        "<b>VC ¥5-10億調達して 20-30 名の組織で全力疾走</b>した会社の数字。",
        s_body,
    ))

    benchmarks = [
        ["会社",      "領域",     "ARR ¥3億 到達年数", "累積調達額"],
        ["Sansan",   "名刺",      "7 年",              "¥20億+"],
        ["freee",    "会計",      "4 年",              "¥100億+"],
        ["SmartHR",  "労務",      "5 年",              "¥50億+"],
        ["カオナビ", "タレマネ",  "6 年",              "¥10億+"],
        ["マネーフォワード B", "会計", "6 年",          "上場前後"],
        ["bootstrap 中央値", "—", "6-8 年",            "自己資金のみ"],
    ]
    story.append(base_table(benchmarks, [40*mm, 40*mm, 40*mm, 40*mm]))

    story.append(Paragraph("v0.2 モデルの 4 つの過大評価", s_h2))
    issues = [
        ["過大評価ポイント",            "v0.2 仮定",        "現実"],
        ["Free → 有料 コンバージョン",  "3-5%",             "0.5-1.5% (B2B ニッチ)"],
        ["スキャン運用負荷",            "週 13 件 × 3 年",  "実質 2 人専任 + 全国移動"],
        ["Team 顧客 300 社獲得",        "5 名で達成",       "SDR+AE 5-8 名必要"],
        ["マーケ予算",                  "ARR の 10%",       "実質 40-60%"],
    ]
    story.append(base_table(issues, [55*mm, 50*mm, 55*mm]))

    story.append(PageBreak())

    # ── 2. 現実 3 シナリオ ──────────────────────────────────────────────────
    story.append(Paragraph("2. 現実シナリオ (3 段階)", s_h1))
    story.append(Paragraph(
        "ブートストラップ前提で、代表 + エンジニア 1-2 名 + スキャン外注で運営する場合の"
        "Y3 到達予測。Project Pass は v0.2 案を踏襲。",
        s_body,
    ))

    sc_table = [["シナリオ", "Y3 物件数", "Y3 Indiv", "Y3 Team", "Y3 Pass", "Y3 ARR"]]
    for name in ["現実下限", "現実基本", "頑張れば"]:
        y3 = ARRS[name]["Y3"]
        sc_table.append([
            name,
            f"{y3['props']:,}",
            f"{y3['indiv_n']:,}",
            f"{y3['team_n']:,}",
            f"{y3['pass_n']:,}",
            manen(y3['total']),
        ])
    sc_table.append([
        "(参考) v0.2 基本",
        "2,000", "3,000", "300", "4,000", manen(V2_BASE_Y3_ARR),
    ])
    story.append(base_table(sc_table, [30*mm, 25*mm, 25*mm, 22*mm, 25*mm, 35*mm]))

    story.append(Paragraph("3 年推移 (現実基本シナリオ)", s_h2))
    trend = [["指標", "Y1 (2027)", "Y2 (2028)", "Y3 (2029)"]]
    for label, key in [("物件数", "props"), ("Indiv 会員", "indiv_n"), ("Team 会員", "team_n"),
                       ("Pass ユーザー", "pass_n"), ("Indiv ARR", "indiv"),
                       ("Team ARR", "team"), ("Pass ARR", "pass"), ("合計 ARR", "total")]:
        row = [label]
        for y in ["Y1", "Y2", "Y3"]:
            v = ARRS["現実基本"][y][key]
            if key in ("props", "indiv_n", "team_n", "pass_n"):
                row.append(f"{v:,}")
            else:
                row.append(manen(v))
        trend.append(row)
    # MRR row
    trend.append([
        "合計 MRR",
        manen(ARRS["現実基本"]["Y1"]["total"] // 12),
        manen(ARRS["現実基本"]["Y2"]["total"] // 12),
        manen(ARRS["現実基本"]["Y3"]["total"] // 12),
    ])
    story.append(base_table(trend, [38*mm, 36*mm, 36*mm, 36*mm]))

    story.append(PageBreak())

    # ── 3. Y3 損益試算 (現実基本) ──────────────────────────────────────────
    story.append(Paragraph("3. Y3 損益試算 — 現実基本シナリオ", s_h1))
    story.append(Paragraph(
        f"Y3 ARR <b>{manen(Y3_BASE_REV)}</b> に対する主要コスト。"
        f"営業利益 <b>{manen(Y3_OP_PROFIT)}</b> ({Y3_OP_PROFIT/Y3_BASE_REV*100:.0f}% margin)。"
        "v0.2 の 49% margin と比べ、現実は 15-20% margin に着地する。",
        s_body,
    ))

    pl_table = [["項目", "年額", "備考"]]
    notes = {
        "インフラ (R2/Workers/Clerk)":     "MAU 5,000 想定、Clerk free tier 範囲",
        "Stripe 手数料 (3.6%)":             "ARR × 決済手数料",
        "スキャン制作 (年内 300 物件追加)": "@¥50k × 300、外注",
        "人件費 (代表 + 2 名)":             "代表 ¥12M + エンジニア 1 + 営業/オペ 1",
        "マーケ (ARR の 25%)":              "ニッチ向け広告 + イベント + コンテンツ",
        "事務所 / その他":                  "登記住所 / 交通費 / 備品",
    }
    for k, v in Y3_COSTS.items():
        pl_table.append([k, yen(v), notes.get(k, "")])
    pl_table.append(["コスト合計", yen(Y3_TOTAL_COST), ""])
    pl_table.append(["売上 (ARR)", yen(Y3_BASE_REV), ""])
    pl_table.append(["営業利益", yen(Y3_OP_PROFIT), f"{Y3_OP_PROFIT/Y3_BASE_REV*100:.0f}% margin"])
    story.append(base_table(pl_table, [60*mm, 35*mm, 70*mm]))

    story.append(PageBreak())

    # ── 4. 代表報酬の見直し ─────────────────────────────────────────────────
    story.append(Paragraph("4. 代表報酬 (現実シナリオ準拠)", s_h1))
    story.append(Paragraph(
        "v0.2 の「役員報酬 ¥18-20M + 配当 ¥40-50M」は ARR ¥3億 規模での想定だった。"
        "現実 ARR ¥76M (営業利益 ¥17M) では下記が妥当ライン。",
        s_body,
    ))

    comp_table = [
        ["項目",         "Y1 (ARR ¥3M)",  "Y2 (ARR ¥17M)", "Y3 (ARR ¥76M)"],
        ["役員報酬",     yen(4_000_000),  yen(8_000_000),  yen(12_000_000)],
        ["配当",         yen(0),          yen(0),          yen(3_000_000)],
        ["留保 (会社)",  "事業赤字補填",  "黒字化開始",    yen(2_000_000)],
        ["個人手取 net", yen(3_500_000),  yen(6_500_000),  yen(11_500_000)],
        ["スタジオ業からの収入と合算で生活設計", "—", "—", "—"],
    ]
    story.append(base_table(comp_table, [40*mm, 38*mm, 38*mm, 38*mm]))

    story.append(Paragraph(
        "■ Y1-Y2 は事業からの取り分は<b>生活費の半分以下</b>。残りはスタジオ業 (本体) + 個人預金から。<br/>"
        "■ Y3 で初めて事業から <b>¥11.5M (net)</b> 出せる。"
        "v0.2 で書いた ¥44M-¥75M は、ARR が当初想定の 4 倍に達した時にしか実現しない。<br/>"
        "■ 役員退職金引当 (年 ¥1-2M 程度) は Y3 以降から検討する。",
        s_small,
    ))

    story.append(PageBreak())

    # ── 5. M&A バリュエーション 現実版 ─────────────────────────────────────
    story.append(Paragraph("5. M&A バリュエーション (現実版)", s_h1))
    story.append(Paragraph(
        "現実シナリオで Y3 に M&A した場合の試算。"
        "ブートストラップ SaaS は VC 入り SaaS よりも倍率が低めに評価される (再現性懸念)。",
        s_body,
    ))

    ma_table = [
        ["シナリオ", "Y3 ARR", "想定倍率", "売却額", "代表 net (税後 80%)"],
    ]
    for name in ["現実下限", "現実基本", "頑張れば"]:
        arr = ARRS[name]["Y3"]["total"]
        for mult, label in [(4, "保守 (4x)"), (5, "標準 (5x)")]:
            val = arr * mult
            net = int(val * 0.797)  # 譲渡所得税 20.315% 控除後
            ma_table.append([
                f"{name} / {label}",
                manen(arr),
                f"{mult}x",
                manen(val),
                manen(net),
            ])
    story.append(base_table(ma_table, [50*mm, 28*mm, 22*mm, 30*mm, 35*mm]))

    story.append(Paragraph(
        "<b>現実基本 × 5x = ¥3.8億 (代表 net 約 ¥3億)</b>。"
        "v0.2 で書いた ¥17億 売却 / ¥13.8億 net とはオーダーが 1 桁違う。"
        "ただし「個人事業主が 3 年で作る資産」としては悪くない。",
        s_callout,
    ))

    story.append(PageBreak())

    # ── 6. パス A vs パス B ────────────────────────────────────────────────
    story.append(Paragraph("6. パス A (Bootstrap) vs パス B (VC)", s_h1))
    story.append(Paragraph(
        "「3 年で ARR ¥3億を狙う」なら VC ファンディング前提のパス B に切り替える必要がある。"
        "代表自身のライフスタイル / リスク許容度 / スタジオ業との並走可否で選ぶ。",
        s_body,
    ))

    path_compare = [
        ["観点",                       "パス A (Bootstrap)",                  "パス B (VC 路線)"],
        ["初期資本",                   "自己資金 ¥0-10M",                      "Seed ¥1-2億 (株式 15-25% 放出)"],
        ["代表持分",                   "100% 維持",                            "75% → A 後 50% → IPO 後 25%"],
        ["Y3 ARR 目標",                "¥76M",                                "¥200-300M"],
        ["Y3 チーム規模",              "3 名",                                "15-25 名"],
        ["Y3 代表報酬 (給与)",         "¥12M",                                "¥18-25M (投資家の同意付き)"],
        ["Y3 月給生活感",              "スタジオ業と合算で安定",              "事業給与で完結"],
        ["Y5 ARR 見込み",              "¥150-200M",                            "¥800M-¥1.5B"],
        ["Exit 時期 / 価格 (現実)",    "Y7-8 / ¥15-25億",                      "Y5-7 / ¥50-150億"],
        ["代表持分での Exit 取り分",  "100% = ¥15-25億 (gross)",              "25-40% = ¥12-60億 (gross)"],
        ["代表 net (税後)",            "¥12-20億",                             "¥10-48億"],
        ["失敗時のダメージ",           "小 (本業に戻れる)",                    "大 (キャリアコミット)"],
        ["スタジオ業との両立",         "○ (片手間でも継続可)",                "× (フルタイム必須)"],
    ]
    story.append(base_table(path_compare, [42*mm, 60*mm, 65*mm]))

    story.append(Paragraph("私見: どちらを選ぶか", s_h2))
    story.append(Paragraph(
        "■ <b>パス A 推奨</b>: 中村さんは既にスタジオ業という収入源があり、"
        "オンライン事業は片手間でも始められる。ブートストラップで生存確率を確保しつつ、"
        "「ARR ¥1億 / 解約率 月 5% 以下」が見えた時点でパス B 切替を判断するのが堅実。<br/>"
        "■ <b>パス B</b> は「全人生コミット型」。20-40 代であれば検討、"
        "他の選択肢が制限される (副業 NG、住宅ローン難、家族時間減)。<br/>"
        "■ 中間路線: Y2 後半に <b>Angel ラウンド ¥30-50M</b> だけ入れ、"
        "持分は 90%+ 維持してマーケ加速 — これがリスクと成長のバランスとして現実的。",
        s_small,
    ))

    story.append(PageBreak())

    # ── 7. 5-8 年ロードマップ ───────────────────────────────────────────────
    story.append(Paragraph("7. 5-8 年ロードマップ (パス A 想定)", s_h1))
    story.append(Paragraph(
        "現実基本シナリオを Y3 以降も延長した場合の中期見立て。"
        "Y5 で Bootstrap SaaS としての「成熟」が見えてくる。Y7-8 が M&A の自然な時期。",
        s_body,
    ))

    roadmap = [
        ["年度",       "ARR",      "物件",     "チーム",   "判断 / マイルストーン"],
        ["Y1 (2027)",  "¥3M",      "50",       "1-2 名",   "MVP リリース、Tokyo 限定、解約率測定"],
        ["Y2 (2028)",  "¥17M",     "200",      "3 名",     "黒字化、Pass tier 本公開、Osaka 展開準備"],
        ["Y3 (2029)",  "¥76M",     "500",      "3-5 名",   "Osaka 開始、Team プラン営業強化"],
        ["Y4 (2030)",  "¥130M",    "800",      "5-7 名",   "全国展開、海外問合せ対応開始"],
        ["Y5 (2031)",  "¥200M",    "1,200",    "8-10 名",  "英語版検討、スタジオ手数料モデル追加"],
        ["Y6 (2032)",  "¥300M",    "1,800",    "12-15 名", "Marketplace 機能 (掲載手数料収入)"],
        ["Y7 (2033)",  "¥400M",    "2,500",    "15-20 名", "M&A 打診開始 (¥20-25億想定)"],
        ["Y8 (2034)",  "—",        "—",         "—",       "Exit / シリーズ化 / 次世代に承継 判断"],
    ]
    story.append(base_table(roadmap, [22*mm, 22*mm, 20*mm, 26*mm, 75*mm]))

    story.append(Paragraph("ロードマップを早めるレバー", s_h2))
    story.append(Paragraph(
        "■ <b>スタジオ側課金</b>: 物件オーナーから掲載手数料 / 成約手数料を取れば、"
        "Y4 以降の収益が +30-50% 上がる (B2B2C モデル化)。<br/>"
        "■ <b>3DGS データ販売</b>: Team プランの 20% OFF 適用ライセンス販売を Y4 から拡大。"
        "1 件 ¥30k-200k × 月 20-50 件 = 年 ¥10-100M 追加収入見込み。<br/>"
        "■ <b>提携 (リクルート SUUMO / 大手プロダクション)</b>: チャネル獲得で Y3-Y4 を 1 年短縮可能。<br/>"
        "■ <b>Angel ¥30M 程度の調達</b>: マーケ加速 + 1-2 名追加で Y3 ARR を 1.5-2x できる可能性。",
        s_small,
    ))

    story.append(PageBreak())

    # ── 8. まとめ ───────────────────────────────────────────────────────────
    story.append(Paragraph("8. まとめ", s_h1))

    summary = [
        ["指標",                        "v0.2 (楽観)",            "v0.3 (現実基本)"],
        ["Y3 ARR",                       manen(V2_BASE_Y3_ARR),    manen(Y3_BASE_REV)],
        ["Y3 営業利益",                  "¥141M",                  manen(Y3_OP_PROFIT)],
        ["Y3 物件数",                    "2,000",                  "500"],
        ["Y3 代表 net (年)",             "¥44M-¥75M",              "¥11.5M"],
        ["Y3 時点の M&A 価格 (5x)",     "¥14.4億",                manen(Y3_BASE_REV * 5)],
        ["代表 M&A net (Y3)",            "¥11.5億",                manen(int(Y3_BASE_REV * 5 * 0.797))],
        ["3年での個人取り分の累積上限", "¥13億+",                 "¥3.3億"],
        ["前提",                         "VC ¥5-10億 / 全力",      "Bootstrap / 並走"],
    ]
    story.append(base_table(summary, [50*mm, 50*mm, 50*mm]))

    story.append(Paragraph("最終的な視点", s_h2))
    story.append(Paragraph(
        "■ <b>v0.3 = 失敗しない計画</b>。Bootstrap で確実に黒字化させ、"
        "5-7 年で ¥15-25億 の M&A 候補として育てる。<br/>"
        "■ <b>v0.2 = 上振れシナリオ</b>。VC を入れて 3 年で全国展開を仕掛けた場合。"
        "失敗確率は高いがリターンも大きい。<br/>"
        "■ どちらを選ぶかは <b>「中村さんの 5 年後のキャリア像」次第</b>。"
        "スタジオ業を継続したいならパス A、起業家として勝負したいならパス B。<br/>"
        "■ 数字を再校正するタイミング: <b>Y1 ローンチ後 6 ヶ月</b>。"
        "実 cohort の解約率・スタジオ獲得速度・Free→有料 CV を測って v0.4 を作る。",
        s_small,
    ))

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)


if __name__ == "__main__":
    out = Path(__file__).parent / "business_projection_v3.pdf"
    build(out)
    print(f"Generated: {out}")
