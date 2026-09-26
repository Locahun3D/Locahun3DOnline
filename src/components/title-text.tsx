import { Fragment } from "react";
import { propertyTitleSegments } from "@/lib/property-presentation";

/**
 * 物件名を「単語の途中で折らない」で出す（2026-09-26 本人指摘「スマホの改行デザインができてない
 * 文字が途切れて改行されて非常にみづらい　ルールとして修正」）。
 *
 * サイト全体は body の `word-break: auto-phrase` で文節折り返しをしているが、**iPhone の Safari は
 * これに対応していない**ため、カードの題名が「グ／リーン」のように切れていた。
 * 物件ページの見出し（property-detail-view の h1）と同じく、Intl.Segmenter で語に分けて
 * 1語ずつ inline-block にする（語の途中では折れず、語と語の間でだけ折れる）。
 * Intl.Segmenter はサーバーでもブラウザでも動くので、client component からも使える。
 * 長い本文には BudouX の <Jp>（components/jp.tsx）を使う。
 */
export default function TitleText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, li) => (
        <Fragment key={li}>
          {li > 0 && <br />}
          {propertyTitleSegments(line).map((part, i) => (
            <span key={i} className="inline-block max-w-full align-baseline [overflow-wrap:anywhere]">
              {part}
            </span>
          ))}
        </Fragment>
      ))}
    </>
  );
}
