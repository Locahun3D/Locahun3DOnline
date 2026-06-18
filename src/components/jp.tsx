import { Fragment } from "react";
import { loadDefaultJapaneseParser } from "budoux";

const parser = loadDefaultJapaneseParser();

/**
 * Renders Japanese body text with phrase-boundary line breaks (BudouX).
 * Inserts <wbr> at natural 文節 boundaries; the `jp` utility sets
 * `word-break: keep-all` so the text only ever wraps at those points —
 * never mid-word (e.g. avoids 「撮影・制／作」「レン／ズ」). Server component:
 * the segmentation runs at render time, shipping zero client JS.
 */
export default function Jp({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  const phrases = parser.parse(children);
  return (
    <span className={`jp ${className}`.trim()}>
      {phrases.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {p}
        </Fragment>
      ))}
    </span>
  );
}
