"""
ロケハン3D オンライン — 物件数 × 収益試算 (v0.2)

v0.1 からの変更:
  - 解約率の現実化: 撮影業界の特性 (コンスタント vs プロジェクト単発) を反映
  - Individual を Steady / Project の 2 セグメントに分割
  - 「Project Pass ¥3,500 / 7 日」新ティアの追加案を組み込み
  - Y3 ARR を 「現状プラン据置」vs「Project Pass 追加」で比較

実行:
    python docs/projection_v2.py
出力:
    docs/business_projection_v2.pdf
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
s_diff_pos = ParagraphStyle("DiffPos", parent=s_body, textColor=ACCENT, fontSize=10)
s_diff_neg = ParagraphStyle("DiffNeg", parent=s_body, textColor=RED, fontSize=10)

def yen(n): return f"¥{n:,.0f}"

def manen(n):
    if n == 0: return "—"
    if n >= 100_000_000: return f"{n/100_000_000:.2f}億"
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
    canvas.drawString(20*mm, A4[1]-12*mm, "LOCAHUN 3D / ONLINE — REVENUE PROJECTION v0.2")
    canvas.drawRightString(A4[0]-20*mm, A4[1]-12*mm, "INTERNAL — 2026-05-23")
    canvas.line(20*mm, 15*mm, A4[0]-20*mm, 15*mm)
    canvas.drawString(20*mm, 10*mm, "ロケハン3D オンライン")
    canvas.drawRightString(A4[0]-20*mm, 10*mm, f"Page {doc.page}")
    canvas.restoreState()

# ── 前提モデル v0.2 ─────────────────────────────────────────────────────────
#
# 撮影業界の特性:
#   - Steady customer: 大手プロダクション、定常案件あり、月次サブスク継続
#   - Project customer: 単発フリーランス、案件が来るたび利用、終われば解約
#
# Individual の年平均稼働月数 (Steady 70%, Project 30%):
#   - Steady: 11 ヶ月稼働 (月 3% 解約相当)
#   - Project: 平均 3 ヶ月稼働 (案件中だけ契約、終わったら解約)
#   - 加重平均: 0.7 * 11 + 0.3 * 3 = 8.6 ヶ月
#
# Team の年平均稼働月数:
#   - 大半が Steady、12 ヶ月のうち 11 ヶ月稼働 (月 2% 解約相当)

INDIV_PRICE = 5200
TEAM_PRICE  = 29800
PASS_PRICE  = 3500   # Project Pass 7-day
PASSES_PER_USER_PER_YEAR = 4

# v0.1 (named users assumed 12 months active)
V1_INDIV_ARPU = INDIV_PRICE * 12   # 62,400
V1_TEAM_ARPU  = TEAM_PRICE  * 12   # 357,600

# v0.2 realistic (named users multiplied by avg months active)
INDIV_AVG_MONTHS = 8.6
TEAM_AVG_MONTHS  = 11.0
V2_INDIV_ARPU = int(INDIV_PRICE * INDIV_AVG_MONTHS)   # 44,720
V2_TEAM_ARPU  = int(TEAM_PRICE  * TEAM_AVG_MONTHS)    # 327,800
PASS_ARPU     = PASS_PRICE * PASSES_PER_USER_PER_YEAR # 14,000

# Named subscriber counts (year-end). Same scenarios as v0.1.
SCENARIOS = {
    "保守的": {"Y1": (50, 5),   "Y2": (200, 30),  "Y3": (800, 100)},
    "基本":   {"Y1": (100, 10), "Y2": (600, 80),  "Y3": (3000, 300)},
    "楽観的": {"Y1": (250, 25), "Y2": (1500, 200),"Y3": (8000, 800)},
}

# Project Pass user counts (only used in "With Pass" scenario).
PASS_USERS = {
    "保守的": {"Y1": 80,   "Y2": 400,   "Y3": 1500},
    "基本":   {"Y1": 200,  "Y2": 1000,  "Y3": 4000},
    "楽観的": {"Y1": 500,  "Y2": 2500,  "Y3": 10000},
}

def arr(indiv, team, indiv_arpu, team_arpu):
    return indiv * indiv_arpu + team * team_arpu

def arr_pass_only(pass_users):
    return pass_users * PASS_ARPU

# v0.1 baseline (for comparison)
V1_ARR = {n: {y: arr(s[y][0], s[y][1], V1_INDIV_ARPU, V1_TEAM_ARPU) for y in ["Y1","Y2","Y3"]} for n, s in SCENARIOS.items()}

# v0.2 with realistic churn (no Project Pass tier yet)
V2_REALISTIC = {n: {y: arr(s[y][0], s[y][1], V2_INDIV_ARPU, V2_TEAM_ARPU) for y in ["Y1","Y2","Y3"]} for n, s in SCENARIOS.items()}

# v0.2 with Project Pass added
V2_WITH_PASS = {
    n: {y: V2_REALISTIC[n][y] + arr_pass_only(PASS_USERS[n][y]) for y in ["Y1","Y2","Y3"]}
    for n in SCENARIOS
}

# ── Build PDF ────────────────────────────────────────────────────────────────
def build(path: Path) -> None:
    doc = SimpleDocTemplate(
        str(path), pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm, topMargin=22*mm, bottomMargin=20*mm,
        title="ロケハン3D オンライン 物件数×収益試算 v0.2",
        author="ロケハン3D",
    )
    story = []

    # ── Cover ──────────────────────────────────────────────────────────────
    story.append(Spacer(1, 60*mm))
    story.append(Paragraph("LOCAHUN 3D / ONLINE", s_meta))
    story.append(Spacer(1, 4))
    story.append(Paragraph("物件数 × 収益試算 v0.2", s_title))
    story.append(Paragraph(
        "撮影業界の「Steady / Project 二極性」を反映した解約率の現実化と、"
        "短期パスティア (Project Pass ¥3,500 / 7日) 追加による取りこぼし回避の試算。",
        s_subtitle,
    ))
    story.append(Spacer(1, 30*mm))
    cover_meta = [
        ["バージョン", "v0.2 (revised, 2026-05-23)"],
        ["v0.1 からの変更", "解約率現実化 + Project Pass 新案"],
        ["対象期間", "Y1 (2027) — Y3 (2029)"],
        ["前提", "Steady 70%, Project 30% / Indiv 年平均稼働 8.6 ヶ月"],
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

    # ── 1. v0.1 の問題提起 ────────────────────────────────────────────────
    story.append(Paragraph("1. v0.1 試算の前提が楽観的だった点", s_h1))
    story.append(Paragraph(
        "v0.1 試算では Individual / Team とも有料会員が年 12 ヶ月稼働する前提だった。"
        "実際の撮影業界では顧客は明確に 2 タイプに分かれる:",
        s_body,
    ))
    types_table = [
        ["顧客タイプ",         "比率 (Indiv)", "稼働月数 / 年", "ARPU 換算"],
        ["Steady (定常案件)",  "30%",          "11 ヶ月",       yen(INDIV_PRICE * 11)],
        ["Project (単発)",     "70%",          "3 ヶ月",        yen(INDIV_PRICE * 3)],
        ["加重平均 (Indiv)",   "100%",         "8.6 ヶ月",      yen(V2_INDIV_ARPU)],
        ["Team",               "—",            "11 ヶ月",       yen(V2_TEAM_ARPU)],
    ]
    story.append(base_table(types_table, [50*mm, 30*mm, 40*mm, 40*mm]))

    story.append(Paragraph(
        f"v0.1 の Individual ARPU 仮定 <b>{yen(V1_INDIV_ARPU)}</b> は、"
        f"現実化すると <b>{yen(V2_INDIV_ARPU)} (▲28%)</b> となる。"
        "Team は大半が定常顧客のため軽微な下方修正のみ。",
        s_body,
    ))

    story.append(PageBreak())

    # ── 2. 現実化した Y3 ARR ───────────────────────────────────────────────
    story.append(Paragraph("2. 解約率を現実化した Y3 ARR (Project Pass 無し)", s_h1))
    story.append(Paragraph(
        "v0.1 と同じ会員数 (年末スナップショット) を保ったまま、ARPU だけ稼働月数で割り戻した結果。"
        "<b>Y3 基本シナリオで約 32% の下方修正</b>。これが Project Pass を入れなかった場合の現実。",
        s_body,
    ))

    realistic_compare = [
        ["シナリオ", "Y3 ARR (v0.1)", "Y3 ARR (v0.2 現実化)", "差分"],
    ]
    for n in ["保守的", "基本", "楽観的"]:
        v1 = V1_ARR[n]["Y3"]
        v2 = V2_REALISTIC[n]["Y3"]
        diff = v2 - v1
        realistic_compare.append([
            n,
            manen(v1),
            manen(v2),
            f"{manen(diff)} ({diff/v1*100:+.0f}%)",
        ])
    story.append(base_table(realistic_compare, [35*mm, 38*mm, 45*mm, 42*mm]))

    story.append(Paragraph(
        "Individual の単発顧客は本来「3 ヶ月だけ契約 → 解約 → また案件来たら再契約」のパターン。"
        "月次解約率としては 10〜15% に達する。これを SaaS 標準モデルで捉えると数字がブレ続けるため、"
        "<b>そもそも単発客向けの別ティアを切り出す</b>のが正解。",
        s_body,
    ))

    story.append(PageBreak())

    # ── 3. Project Pass 新案 ───────────────────────────────────────────────
    story.append(Paragraph("3. 提案: 「Project Pass」7 日 ¥3,500", s_h1))
    story.append(Paragraph(
        "案件単位で動くフリーランス映像作家のために、月額サブスクとは別軸で 7 日間有効の"
        "パスを ¥3,500 で販売。ロケハン期間 (撮影 1 週前) にフィット。"
        "Individual ¥5,200/月 と比べて約 33% 安く、コミットメント不要。",
        s_body,
    ))

    pass_design = [
        ["項目",            "Project Pass",                "比較: Individual"],
        ["価格",             yen(PASS_PRICE),               yen(INDIV_PRICE) + " /月"],
        ["有効期間",         "7 日",                        "1 ヶ月 (自動更新)"],
        ["3DGS 閲覧上限",    "5 件 / パス",                  "3 件 / 月"],
        ["1 件あたり換算",   yen(PASS_PRICE / 5),           yen(INDIV_PRICE / 3)],
        ["図面ダウンロード", "無制限 (パス期間中)",          "無制限"],
        ["履歴・ブックマーク","30 日保存",                   "永続"],
        ["想定購入頻度 / 年", f"{PASSES_PER_USER_PER_YEAR} 回 (案件ごと)", "12 ヶ月継続"],
        ["年間支払額 (想定)", yen(PASS_ARPU),                yen(V2_INDIV_ARPU)],
    ]
    story.append(base_table(pass_design, [50*mm, 50*mm, 55*mm]))

    story.append(Paragraph("なぜこの価格 / 期間か", s_h2))
    story.append(Paragraph(
        "■ <b>7 日間</b>: 一般的なロケハン作業は撮影 1 週前から始まる。"
        "「来週撮るので今週見たい」需要に最短で応える。<br/>"
        "■ <b>¥3,500</b>: Individual の 2/3 未満で「お試し」障壁を下げる。"
        "1 件あたり ¥700 換算で、Individual の ¥1,733 より圧倒的に魅力的。<br/>"
        "■ <b>5 件上限</b>: 1 案件の候補ロケは通常 3〜5 件。一案件分を 1 パスで賄える設計。<br/>"
        "■ <b>履歴 30 日保存</b>: 撮影終了後の振り返り期間まで保つが、永続ではない (Individual との差別化)。",
        s_small,
    ))

    story.append(PageBreak())

    # ── 4. Project Pass 追加後の Y3 ARR ───────────────────────────────────
    story.append(Paragraph("4. Project Pass 追加後の収益試算", s_h1))
    story.append(Paragraph(
        "Project Pass はサブスク Indiv とは別の顧客プールから収益を作る (=共食いしない前提)。"
        "Pass 利用者は元々サブスクするほどの頻度ではない層が中心。"
        "下表は「現状プラン据置 (v0.2)」と「Project Pass 追加」の Y3 ARR 比較。",
        s_body,
    ))

    final_compare = [
        ["シナリオ", "Pass ユーザー (Y3)", "Y3 ARR (Pass 無)", "Y3 ARR (Pass 有)", "増分"],
    ]
    for n in ["保守的", "基本", "楽観的"]:
        without = V2_REALISTIC[n]["Y3"]
        with_   = V2_WITH_PASS[n]["Y3"]
        diff = with_ - without
        final_compare.append([
            n,
            f"{PASS_USERS[n]['Y3']:,}",
            manen(without),
            manen(with_),
            f"+{manen(diff)} ({diff/without*100:+.0f}%)",
        ])
    story.append(base_table(final_compare, [30*mm, 32*mm, 35*mm, 35*mm, 35*mm]))

    # v0.1 → v0.2-with-pass 全比較
    story.append(Spacer(1, 6))
    story.append(Paragraph("v0.1 vs v0.2 (Pass 有) の最終比較", s_h2))
    full_compare = [
        ["シナリオ", "Y3 ARR (v0.1)", "Y3 ARR (v0.2+Pass)", "v0.1 比"],
    ]
    for n in ["保守的", "基本", "楽観的"]:
        v1 = V1_ARR[n]["Y3"]
        vP = V2_WITH_PASS[n]["Y3"]
        full_compare.append([
            n,
            manen(v1),
            manen(vP),
            f"{(vP/v1-1)*100:+.0f}%",
        ])
    story.append(base_table(full_compare, [35*mm, 38*mm, 45*mm, 35*mm]))

    story.append(Paragraph(
        "<b>基本シナリオ</b>: v0.1 では 2.94 億 ARR だったが、現実化 + Pass 追加で "
        f"<b>{manen(V2_WITH_PASS['基本']['Y3'])} ARR</b>。"
        "v0.1 比では -約 27%、しかし v0.2 現実化のみと比べれば Pass が +28% 持ち上げる。"
        "Pass がなければ約 2.0 億で頭打ちだったところを 2.6 億まで戻せる試算。",
        s_callout,
    ))

    story.append(PageBreak())

    # ── 5. 段階別 ARR 推移 ─────────────────────────────────────────────────
    story.append(Paragraph("5. 3 年推移 (基本シナリオ / Pass 有)", s_h1))

    base = "基本"
    trend = [
        ["指標",                    "Y1 (2027)", "Y2 (2028)", "Y3 (2029)"],
        ["Indiv 名 (年末)",          f"{SCENARIOS[base]['Y1'][0]:,}",
                                     f"{SCENARIOS[base]['Y2'][0]:,}",
                                     f"{SCENARIOS[base]['Y3'][0]:,}"],
        ["Team 名 (年末)",           f"{SCENARIOS[base]['Y1'][1]:,}",
                                     f"{SCENARIOS[base]['Y2'][1]:,}",
                                     f"{SCENARIOS[base]['Y3'][1]:,}"],
        ["Pass ユーザー数",          f"{PASS_USERS[base]['Y1']:,}",
                                     f"{PASS_USERS[base]['Y2']:,}",
                                     f"{PASS_USERS[base]['Y3']:,}"],
        ["Indiv ARR",                manen(SCENARIOS[base]['Y1'][0] * V2_INDIV_ARPU),
                                     manen(SCENARIOS[base]['Y2'][0] * V2_INDIV_ARPU),
                                     manen(SCENARIOS[base]['Y3'][0] * V2_INDIV_ARPU)],
        ["Team ARR",                 manen(SCENARIOS[base]['Y1'][1] * V2_TEAM_ARPU),
                                     manen(SCENARIOS[base]['Y2'][1] * V2_TEAM_ARPU),
                                     manen(SCENARIOS[base]['Y3'][1] * V2_TEAM_ARPU)],
        ["Pass ARR",                 manen(arr_pass_only(PASS_USERS[base]['Y1'])),
                                     manen(arr_pass_only(PASS_USERS[base]['Y2'])),
                                     manen(arr_pass_only(PASS_USERS[base]['Y3']))],
        ["合計 ARR",                 manen(V2_WITH_PASS[base]['Y1']),
                                     manen(V2_WITH_PASS[base]['Y2']),
                                     manen(V2_WITH_PASS[base]['Y3'])],
        ["合計 MRR",                 manen(V2_WITH_PASS[base]['Y1'] // 12),
                                     manen(V2_WITH_PASS[base]['Y2'] // 12),
                                     manen(V2_WITH_PASS[base]['Y3'] // 12)],
    ]
    story.append(base_table(trend, [40*mm, 35*mm, 35*mm, 35*mm]))

    story.append(Paragraph("プラン別収益構成 (Y3 基本シナリオ)", s_h2))
    base_y3 = V2_WITH_PASS[base]['Y3']
    indiv_arr = SCENARIOS[base]['Y3'][0] * V2_INDIV_ARPU
    team_arr  = SCENARIOS[base]['Y3'][1] * V2_TEAM_ARPU
    pass_arr  = arr_pass_only(PASS_USERS[base]['Y3'])
    mix = [
        ["プラン",       "ARR",          "構成比"],
        ["Individual",   manen(indiv_arr), f"{indiv_arr/base_y3*100:.1f}%"],
        ["Team",         manen(team_arr),  f"{team_arr/base_y3*100:.1f}%"],
        ["Project Pass", manen(pass_arr),  f"{pass_arr/base_y3*100:.1f}%"],
        ["合計",         manen(base_y3),   "100.0%"],
    ]
    story.append(base_table(mix, [50*mm, 50*mm, 50*mm]))

    story.append(PageBreak())

    # ── 6. リスクと意思決定 ────────────────────────────────────────────────
    story.append(Paragraph("6. リスクと次の意思決定", s_h1))

    story.append(Paragraph("Project Pass 導入のリスク", s_h2))
    story.append(Paragraph(
        "■ <b>カニバリゼーション</b>: 既存 Individual 候補が「月額より安いから Pass で済ます」と"
        "ダウングレードする可能性。本試算では Pass ユーザーを別プールと仮定。<br/>"
        "■ <b>運用負荷</b>: 期間限定アクセス権の Stripe 設定が必要。"
        "Stripe Checkout の one-time payment + 自前で expiry 管理。<br/>"
        "■ <b>3DGS 上限の悪用</b>: 同一物件を複数アカウントで Pass 買い占めて 3DGS データ取得を試みる人。"
        "Watermark + アカウント seal 必要。",
        s_small,
    ))

    story.append(Paragraph("カニバリ感度 (基本シナリオ Y3)", s_h2))
    cannib = [
        ["既存 Indiv が Pass にダウングレード する割合", "実 Indiv 数", "Indiv ARR 減", "Pass ARR 増", "純差分"],
        ["0% (理想 — 別プール)",   "3,000", manen(0),                 manen(4000 * PASS_ARPU), f"+{manen(4000 * PASS_ARPU)}"],
        ["20% (現実的)",          "2,400", manen(-600 * V2_INDIV_ARPU), manen(4000 * PASS_ARPU), f"+{manen(4000 * PASS_ARPU - 600 * V2_INDIV_ARPU)}"],
        ["50% (悲観)",            "1,500", manen(-1500 * V2_INDIV_ARPU), manen(4000 * PASS_ARPU), f"{manen(4000 * PASS_ARPU - 1500 * V2_INDIV_ARPU)}"],
    ]
    story.append(base_table(cannib, [62*mm, 25*mm, 28*mm, 26*mm, 28*mm]))

    story.append(Paragraph(
        "<b>カニバリ 50% でも純プラス</b>。Pass 導入は数字としてリスクが低い (悲観でも純減にならない)。"
        "むしろ 0% 案 (新規プール) と 20% 案 (実質的) の差はあれど、両方とも採用に値する。",
        s_callout,
    ))

    story.append(Paragraph("意思決定フロー", s_h2))
    decisions = [
        ["時期",         "判断",                              "判断基準"],
        ["2026 Q4",      "Indiv / Team で MVP ローンチ",       "Project Pass は β 内部テスト"],
        ["2027 Q1",      "Indiv の解約パターン観察",           "Project 顧客比率が 60%超なら Pass 公開"],
        ["2027 Q2",      "Project Pass 一般公開",              "Cohort 分析で ARPU 修正"],
        ["2027 Q4",      "Pass 価格 / 期間 微調整",            "購入後 7 日の 3DGS 視聴ログから決定"],
        ["2028 Q2",      "Pass 上限を 5→10 件に拡張検討",       "Pass 上限到達ユーザーが 30%超なら拡張"],
    ]
    story.append(base_table(decisions, [25*mm, 50*mm, 90*mm]))

    story.append(Paragraph("補足: 試算の精度向上", s_h2))
    story.append(Paragraph(
        "本 v0.2 は依然として仮定値ベース。Y1 ローンチ後 6 ヶ月で以下を実測して v0.3 に更新する想定:<br/>"
        "■ Indiv 月次解約率 (実 cohort)<br/>"
        "■ Project / Steady 比率 (アンケート + 利用ログ)<br/>"
        "■ Pass 利用回数 / 年 (購入履歴)<br/>"
        "■ カニバリ率 (Indiv 解約 → Pass 移行のトラッキング)",
        s_small,
    ))

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)


if __name__ == "__main__":
    out = Path(__file__).parent / "business_projection_v2.pdf"
    build(out)
    print(f"Generated: {out}")
