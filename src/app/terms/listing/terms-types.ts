/** 条・項・号の構造で規約本文を持つための型（/terms/listing）。 */
export type TermsPara = string | { text: string; items: string[] };

export interface TermsArticle {
  /** 見出し（「目的・適用」など。条番号は配列の順番から付ける）。 */
  title: string;
  /** true なら各段落を項として 1. 2. … と番号を振る。false なら段落をそのまま出す。 */
  numbered: boolean;
  /** 段落（項）。items があればその下に号 (1)(2)… を並べる。 */
  paras: TermsPara[];
}
