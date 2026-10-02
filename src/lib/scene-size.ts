/**
 * シーンの容量表示（2026-10-02 本人指摘「まきのした住宅が 1 MB」）。
 *
 * オンラインで向きや初期視点を直して保存すると、splatUrl は編集内容だけを持つ小さなアーカイブ
 * （wf_…-project.zip・数KB）に切り替わり、sizeMb もその大きさ（1 MB）で上書きされる。
 * 実際に読み込む本体は streamUrl（.rad / ビューアー用 .zip）で、その容量は streamSizeMb に残っている。
 * 画面に出す容量は、本体があるならそちらを使う（ビューアーが実際に読む量と合わせる）。
 */
export function displaySceneSizeMb(item: { sizeMb?: number; streamUrl?: string; streamSizeMb?: number }): number {
  const own = item.sizeMb ?? 0;
  const stream = item.streamUrl ? item.streamSizeMb ?? 0 : 0;
  return Math.max(own, stream);
}
