import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedSheet {
  headers: string[];
  rows: string[][];
}

export async function parseScheduleFile(file: File): Promise<ParsedSheet> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const text = await file.text();
    const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
    const rows = (result.data as string[][]).filter((r) => r.some((c) => c && c.trim()));
    return { headers: rows[0] ?? [], rows: rows.slice(1) };
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "", raw: false }) as unknown as string[][];
  const rows = data.filter((r) => r.some((c) => String(c ?? "").trim()));
  return { headers: (rows[0] ?? []).map(String), rows: rows.slice(1).map((r) => r.map((c) => String(c ?? ""))) };
}
