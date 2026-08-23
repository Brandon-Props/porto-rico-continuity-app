import type { ColumnMapping, ImportFieldKey } from "./fields";

export interface BuiltRow {
  rowIndex: number;
  values: Partial<Record<ImportFieldKey, string>>;
  errors: string[];
}

function cell(row: string[], mapping: ColumnMapping, key: ImportFieldKey): string {
  const idx = mapping[key];
  if (idx === undefined) return "";
  return (row[idx] ?? "").trim();
}

/** Lenient date parsing — production schedules arrive in every format imaginable. */
export function parseFlexibleDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Excel serial date number
  if (/^\d{4,6}(\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(epoch.getTime() + serial * 86400000);
    if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const usMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (usMatch) {
    const [, m, d, yRaw] = usMatch;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return null;
}

export function buildRows(rows: string[][], mapping: ColumnMapping): BuiltRow[] {
  return rows.map((row, rowIndex) => {
    const values: Partial<Record<ImportFieldKey, string>> = {};
    (Object.keys(mapping) as ImportFieldKey[]).forEach((key) => {
      values[key] = cell(row, mapping, key);
    });

    const errors: string[] = [];
    if (!values.sceneNumber) errors.push("Missing scene number");
    if (!values.shootDay) errors.push("Missing shoot day");
    if (values.shootDate) {
      const parsed = parseFlexibleDate(values.shootDate);
      if (!parsed) errors.push(`Unrecognized date "${values.shootDate}"`);
      else values.shootDate = parsed;
    } else {
      errors.push("Missing shooting date");
    }
    if (values.shootDay && !/^\d+$/.test(values.shootDay.trim())) {
      errors.push(`Shoot day "${values.shootDay}" is not a whole number`);
    }

    return { rowIndex, values, errors };
  });
}
