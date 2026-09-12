import type { PurchaseContent } from "@/lib/purchase-contents";

export default function PurchaseContents({ files, en }: { files: PurchaseContent[]; en: boolean }) {
  return (
    <section className="mt-3 border-t border-line pt-3 text-[13px] leading-[1.8]" aria-label={en ? "Included downloads" : "購入に含まれるデータ"}>
      <h4 className="font-medium">{en ? "Included downloads" : "購入に含まれるデータ"}</h4>
      {files.length ? (
        <>
          <p className="text-muted">{en ? `${files.length} downloadable file${files.length === 1 ? "" : "s"}` : `ダウンロード対象：${files.length}ファイル`}</p>
          <ul className="mt-1 space-y-1">
            {files.map((file, index) => (
              <li key={index} className="flex flex-wrap items-baseline gap-x-3 border-b border-line/50 py-1 last:border-0">
                <span className="font-medium break-words min-w-0">{file.format || (en ? "Format not registered" : "形式未登録")}</span>
                {file.kind === "version" && <span className="text-muted">{file.date || (en ? "Undated version" : "日付未登録の版")}</span>}
                <span className="text-muted">{file.sizeMb === null ? (en ? "Size not registered" : "容量未登録") : `${file.sizeMb.toLocaleString(en ? "en-US" : "ja-JP")} MB`}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-muted">{en ? "Only the files listed above are included. Viewer preview data is listed separately." : "購入に含まれるのは上記のファイルです。"}{!en && <br />}{!en && "閲覧用プレビューのデータとは区別して表示しています。"}</p>
        </>
      ) : (
        <p className="text-muted">{en ? "Download files are not registered. Preview availability does not confirm included purchase formats." : "購入用ファイルは未登録です。"}{!en && <br />}{!en && "プレビューがあっても、購入に含まれる形式は確認できません。"}</p>
      )}
    </section>
  );
}
