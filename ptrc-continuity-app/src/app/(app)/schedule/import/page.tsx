"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/Button";
import { getActiveProductionId } from "@/db/repositories/productions";
import { parseScheduleFile, type ParsedSheet } from "@/lib/import/parseFile";
import { IMPORT_FIELDS, guessMapping, type ColumnMapping } from "@/lib/import/fields";
import { buildRows, type BuiltRow } from "@/lib/import/validate";
import { runScheduleImport, type ImportReport } from "@/lib/import/runImport";

type Step = "upload" | "map" | "preview" | "done";

export default function ScheduleImportPage() {
  const router = useRouter();
  const productionId = getActiveProductionId() ?? "";

  const [step, setStep] = useState<Step>("upload");
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [builtRows, setBuiltRows] = useState<BuiltRow[]>([]);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    try {
      const parsed = await parseScheduleFile(file);
      if (parsed.rows.length === 0) {
        setFileError("No data rows found in that file.");
        return;
      }
      setSheet(parsed);
      setMapping(guessMapping(parsed.headers));
      setStep("map");
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  };

  const handleValidate = () => {
    if (!sheet) return;
    setBuiltRows(buildRows(sheet.rows, mapping));
    setStep("preview");
  };

  const validCount = useMemo(() => builtRows.filter((r) => r.errors.length === 0).length, [builtRows]);

  const handleImport = async () => {
    setBusy(true);
    try {
      const result = await runScheduleImport(productionId, builtRows);
      setReport(result);
      setStep("done");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col">
      <TopBar title="Import Schedule" back />

      <div className="flex gap-1 px-4 pt-3 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
        {["Upload", "Map Columns", "Validate & Preview", "Import"].map((label, i) => (
          <span key={label} className={["upload", "map", "preview", "done"][i] === step ? "text-[var(--accent)]" : ""}>
            {i > 0 && " → "}
            {label}
          </span>
        ))}
      </div>

      {step === "upload" && (
        <div className="flex flex-col gap-4 px-4 py-6">
          <p className="text-sm text-[var(--text-muted)]">
            Upload the production&apos;s shooting schedule as CSV or Excel (.xlsx). You&apos;ll map its columns to the
            app&apos;s fields on the next step — nothing needs to match exactly.
          </p>
          <label className="tap-target flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--surface)] py-10">
            <span className="text-3xl">📄</span>
            <span className="font-semibold text-[var(--text)]">Choose CSV or XLSX file</span>
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          </label>
          {fileError && <p className="text-sm text-[var(--danger)]">{fileError}</p>}
        </div>
      )}

      {step === "map" && sheet && (
        <div className="flex flex-col gap-3 px-4 py-4">
          <p className="text-sm text-[var(--text-muted)]">
            Match each app field to a column from your file. Fields left unmapped are simply skipped.
          </p>
          <div className="flex flex-col gap-2">
            {IMPORT_FIELDS.map((field) => (
              <div key={field.key} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5">
                <span className="text-sm font-semibold text-[var(--text)]">
                  {field.label}
                  {field.required && <span className="text-[var(--danger)]"> *</span>}
                </span>
                <select
                  value={mapping[field.key] ?? ""}
                  onChange={(e) =>
                    setMapping((prev) => ({ ...prev, [field.key]: e.target.value === "" ? undefined : Number(e.target.value) }))
                  }
                  className="tap-target rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-sm text-[var(--text)]"
                >
                  <option value="">— none —</option>
                  {sheet.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <Button fullWidth onClick={handleValidate}>Validate & Preview →</Button>
        </div>
      )}

      {step === "preview" && (
        <div className="flex flex-col gap-3 px-4 py-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
            <span className="font-bold text-[var(--success)]">{validCount} rows ready to import</span>
            {builtRows.length - validCount > 0 && (
              <span className="ml-2 text-[var(--danger)]">{builtRows.length - validCount} rows have errors and will be skipped</span>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[var(--surface)]">
                <tr>
                  <th className="p-2">Row</th>
                  <th className="p-2">Scene</th>
                  <th className="p-2">Day</th>
                  <th className="p-2">Date</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {builtRows.map((r) => (
                  <tr key={r.rowIndex} className="border-t border-[var(--border)]">
                    <td className="p-2">{r.rowIndex + 1}</td>
                    <td className="p-2">{r.values.sceneNumber || "—"}</td>
                    <td className="p-2">{r.values.shootDay || "—"}</td>
                    <td className="p-2">{r.values.shootDate || "—"}</td>
                    <td className="p-2">
                      {r.errors.length === 0 ? (
                        <span className="text-[var(--success)]">OK</span>
                      ) : (
                        <span className="text-[var(--danger)]" title={r.errors.join("; ")}>
                          {r.errors[0]}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep("map")}>← Back</Button>
            <Button fullWidth onClick={handleImport} disabled={validCount === 0 || busy}>
              {busy ? "Importing…" : `Import ${validCount} Rows`}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && report && (
        <div className="flex flex-col gap-4 px-4 py-6">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-center">
            <div className="text-3xl">✅</div>
            <p className="mt-2 font-bold text-[var(--text)]">Import complete</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {report.scenesCreated} scenes created · {report.scenesUpdated} updated · {report.shootDaysCreated} shoot days created
            </p>
          </div>
          {report.skipped.length > 0 && (
            <div className="rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 p-3 text-sm">
              <p className="mb-1 font-bold text-[var(--danger)]">{report.skipped.length} rows skipped</p>
              <ul className="list-inside list-disc text-xs text-[var(--text-muted)]">
                {report.skipped.slice(0, 10).map((s) => (
                  <li key={s.rowIndex}>Row {s.rowIndex + 1}: {s.errors.join(", ")}</li>
                ))}
              </ul>
            </div>
          )}
          <Button fullWidth onClick={() => router.push("/schedule")}>Go to Schedule</Button>
        </div>
      )}
    </div>
  );
}

