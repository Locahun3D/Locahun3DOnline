"use client";

import { useEffect } from "react";

/**
 * Clerk のポップオーバー（ユーザーメニュー等）の位置ズレを補正する。
 *
 * ── 原因 ──────────────────────────────────────────────
 * このサイトは全体を CSS の `zoom` で縮小している（globals.css の --z 系）。
 * Clerk は getBoundingClientRect()＝zoom 適用「後」の実画面座標でトリガーを
 * 測るが、その結果を `left: 845.8px` として書き込むため、html の zoom が
 * もう一度掛かって 0.9 倍の位置に着地する。
 * 実測(--z=0.9): アバター右端 1221.8px に対しポップオーバー右端 1099.6px
 *               （= 1221.8 × 0.9）。左へ 122px ズレていた。
 *
 * ── 対処 ──────────────────────────────────────────────
 * Clerk が書いた値は使わず、トリガーの実座標から置き直す。
 * 単純に「Clerk の値 ÷ zoom」で戻すだけでは 37.6px 残る。Clerk が
 * 「実座標のトリガー位置 − ズーム前のポップオーバー幅」と単位を混ぜて
 * 左端を出しているため（残差は実測で 幅 × (1/z − 1) と一致した）。
 *
 * ── 試して駄目だった案（戻さないこと）──────────────────
 * ポータルに `zoom: calc(1 / var(--z))` を当てて打ち消す案は不可。
 * Clerk が offsetParent のジオメトリを測り直し、`top: -1369px` のような
 * 値を書く。「Clerk に計算させた後で座標を直す」順序でないと成立しない。
 *
 * 座標をズームで割り戻すという考え方自体は src/lib/effective-zoom.ts と同じ。
 *
 * ※ jsdom は CSS zoom もレイアウトも持たないため単体テストは書けない。
 *   検証はブラウザ実機で行う（--z=0.9・scrollY 0/250/559 で横ズレ 0px を確認）。
 */

/**
 * ── モーダル（ヘッダーの「ログイン」「新規登録」）は別の壊れ方をする ──
 * こちらはトリガー基準ではなく画面中央に置かれるため、上の座標補正では直らない。
 * `.cl-modalBackdrop` は position:fixed で `width:100vw` を持つが、100vw は
 * 「ズーム前の数値」で解決され、そこへ html の zoom が掛かるので実画面より縮む。
 * 実測(2026-07-28): 1440px/--z=.9 → 暗転幅 1296px(=1440×.9) で右144pxが暗転されず、
 * その狭い箱の中で中央寄せされるためカードが 72px(=144/2) 左へずれていた。
 * 1024px/--z=.8 では -102px、820px/--z=.8 では -82px（いずれも余り÷2 と一致）。
 * → 幅だけ実画面基準 calc(100vw / var(--z)) に戻せば、暗転もカード中央も同時に直る。
 *   高さは実測で既にビューポートと一致していたので触らない。
 * ⚠ globals.css ではなくこのコンポーネント内に閉じ込めている（Clerk 起因の補正を
 *   1ファイルに集約する意図。ポータルにも :root の --z は継承される）。
 */
const MODAL_FIX_CSS = `.cl-modalBackdrop{width:calc(100vw / var(--z, 1))}`;

/** ポップオーバーのクラス → それを開くトリガーのクラス */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  [".cl-userButtonPopoverCard", ".cl-userButtonTrigger"],
  [".cl-organizationSwitcherPopoverCard", ".cl-organizationSwitcherTrigger"],
];
const SELECTOR = PAIRS.map(([pop]) => pop).join(", ");
const GAP = 8; // トリガー下端との隙間（実画面px）

export default function ClerkPopoverZoomFix() {
  useEffect(() => {
    const zoomOf = () => {
      const z = parseFloat(getComputedStyle(document.documentElement).zoom);
      return Number.isFinite(z) && z > 0 ? z : 1;
    };

    const fix = (el: HTMLElement) => {
      const z = zoomOf();
      if (z === 1) return; // ズームしていないなら Clerk の計算で正しい
      const pair = PAIRS.find(([pop]) => el.matches(pop));
      if (!pair) return;
      const trigger = [...document.querySelectorAll<HTMLElement>(pair[1])].find(
        (t) => t.getBoundingClientRect().width > 0,
      );
      if (!trigger) return;

      const pr = el.getBoundingClientRect(); // 実画面での実寸
      // 挿入直後はまだレイアウトされておらず幅 0 のことがある。その状態で
      // 右揃えを計算すると一瞬あらぬ位置に出るので、次の通知まで待つ。
      if (pr.width === 0) return;

      const tr = trigger.getBoundingClientRect();
      // ⚠ Clerk のカードは position:absolute（基準は BODY＝ドキュメント座標）。
      // getBoundingClientRect はビューポート座標なので、スクロール量を足して
      // ドキュメント座標へ直す。忘れると縦がスクロール分ずれる（実測）。
      const desiredLeft = Math.max(GAP, tr.right - pr.width) + window.scrollX;
      const desiredTop = tr.bottom + GAP + window.scrollY;

      const nextLeft = `${desiredLeft / z}px`;
      const nextTop = `${desiredTop / z}px`;
      if (el.style.left === nextLeft && el.style.top === nextTop) return;
      el.style.left = nextLeft;
      el.style.top = nextTop;
    };

    const scan = () => {
      document.querySelectorAll<HTMLElement>(SELECTOR).forEach(fix);
    };

    /**
     * body 全体の style 変化を監視するが、Clerk 以外の変化で scan() を
     * 走らせない。カタログの地図（Leaflet）はパン/ズーム中に大量の
     * インラインスタイルを書き換えるため、素通しにすると毎フレーム
     * querySelectorAll が走る。
     */
    const isRelevant = (records: MutationRecord[]) => {
      for (const r of records) {
        if (r.type === "attributes") {
          if (r.target instanceof Element && r.target.matches(SELECTOR)) return true;
        } else {
          for (const n of r.addedNodes) {
            if (n instanceof Element && (n.matches(SELECTOR) || n.querySelector(SELECTOR))) {
              return true;
            }
          }
        }
      }
      return false;
    };

    const mo = new MutationObserver((records) => {
      if (isRelevant(records)) scan();
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });

    // ヘッダーは sticky でトリガーが動かないのに、カードはドキュメント基準で
    // 置かれるためスクロールすると離れていく。開いている間だけ追従させる。
    const onViewportChange = () => {
      if (document.querySelector(SELECTOR)) scan();
    };
    window.addEventListener("scroll", onViewportChange, { passive: true });
    window.addEventListener("resize", onViewportChange, { passive: true });

    scan();
    return () => {
      mo.disconnect();
      window.removeEventListener("scroll", onViewportChange);
      window.removeEventListener("resize", onViewportChange);
    };
  }, []);

  return <style href="clerk-zoom-fix" precedence="default">{MODAL_FIX_CSS}</style>;
}
