import { suggestHeader } from "../../../shared/table-data.mjs";
export type UploadCell = string | number | boolean | null;
export type UploadSheet = { name: string; rows: UploadCell[][] };
export type UploadWorkbook = { name: string; sheets: UploadSheet[] };

export async function readWorkbook(file: File): Promise<UploadWorkbook> {
  if (!/\.(xlsx|csv)$/i.test(file.name))
    throw Error(
      "Choose an Excel (.xlsx) or CSV file. For older .xls files, save as .xlsx first.",
    );
  if (!file.size || file.size > 5 * 1024 * 1024)
    throw Error("Choose a nonempty file smaller than 5 MB.");
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./sheet-upload.worker.ts", import.meta.url),
      { type: "module" },
    );
    const cleanup = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        Error(
          "This workbook is taking too long to read. Try a smaller file or export the worksheet as CSV.",
        ),
      );
    }, 20000);
    worker.onerror = () => {
      cleanup();
      reject(
        Error(
          "Could not read this workbook. Try saving it as .xlsx or CSV and upload again.",
        ),
      );
    };
    worker.onmessage = (
      event: MessageEvent<{ sheets?: UploadSheet[]; error?: string }>,
    ) => {
      cleanup();
      if (event.data.error || !event.data.sheets)
        reject(Error(event.data.error || "No worksheets found."));
      else resolve({ name: file.name, sheets: event.data.sheets });
    };
    worker.postMessage(file);
  });
}

export function suggestHeaderRow(rows: UploadCell[][]): number {
  return suggestHeader(rows);
}
