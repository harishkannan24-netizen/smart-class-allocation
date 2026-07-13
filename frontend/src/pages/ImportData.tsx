import { useRef, useState } from "react";
import { UploadCloud, CheckCircle2, AlertCircle, FileSpreadsheet, Database } from "lucide-react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

const IMPORT_TYPES = [
  { value: "timetable", label: "Timetable Entries", description: "Import classes, days, times, faculty and subject information." },
  { value: "sections", label: "Sections", description: "Import sections, years, semesters and advisors." },
  { value: "rooms", label: "Rooms", description: "Import rooms, floors, capacities and status." },
  { value: "departments", label: "Departments", description: "Import departments and codes." },
] as const;

export default function ImportData() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("SUPER_ADMIN", "DEPT_ADMIN");

  const [importType, setImportType] = useState<(typeof IMPORT_TYPES)[number]["value"]>("timetable");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUpload = async (file?: File) => {
    if (!file || !canEdit) return;
    setUploadedFile(file);
    setUploading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("preview", "true");

    try {
      const endpoint = `/campus/import-${importType === "timetable" ? "timetable-entries" : importType + "s"}/`;
      const response = await api.post(endpoint, formData);
      setResult(response.data);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || "Upload failed.";
      setError(typeof detail === "string" ? detail : JSON.stringify(detail));
    } finally {
      setUploading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Import Data</h1>
            <p className="mt-1 text-sm text-slate-500">Upload CSV or Excel files and map them intelligently without strict header matching.</p>
          </div>
          <button className="btn-primary" type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading || !canEdit}>
            <UploadCloud size={16} /> {uploading ? "Processing..." : "Upload File"}
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Import type</label>
            <select className="input" value={importType} onChange={(e) => setImportType(e.target.value as any)}>
              {IMPORT_TYPES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            <div className="mb-2 flex items-center gap-2 font-semibold text-slate-700">
              <FileSpreadsheet size={16} /> Supported formats
            </div>
            <div>.csv, .xls, .xlsx</div>
            <div className="mt-2 text-xs text-slate-500">The system will auto-detect columns such as section, subject, faculty, day, time, activity and room.</div>
          </div>
        </div>

        <input ref={fileInputRef} type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={onFileChange} />
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <div className="flex items-center gap-2 font-semibold"><AlertCircle size={16} /> Import failed</div>
          <div className="mt-2">{error}</div>
        </div>
      )}

      {result && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-brand-700">
              <CheckCircle2 size={18} />
              <span className="font-semibold">Preview detected</span>
            </div>
            <div className="text-sm text-slate-500">{result.valid_rows ?? 0} valid rows • {result.error_rows ?? 0} skipped rows</div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 text-sm font-semibold text-slate-700">Detected column mapping</div>
              <div className="space-y-2 text-sm text-slate-600">
                {Object.entries(result.column_mapping || {}).map(([source, target]: [string, any]) => (
                  <div key={source} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span>{source}</span>
                    <span className="font-medium text-slate-700">→ {target}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 text-sm font-semibold text-slate-700">Sample rows</div>
              <div className="space-y-2 text-sm text-slate-600">
                {(result.valid_data || []).slice(0, 6).map((row: any, index: number) => (
                  <div key={index} className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="font-medium text-slate-700">{row.data?.section || "—"}</div>
                    <div className="text-xs">{row.data?.day || "—"} • {row.data?.start_time || "—"}-{row.data?.end_time || "—"}</div>
                    <div className="text-xs">{row.data?.subject || "—"} • {row.data?.faculty_name || "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button className="btn-primary" type="button" onClick={() => {
              const file = uploadedFile;
              if (file) {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("preview", "false");
                const endpoint = `/campus/import-${importType === "timetable" ? "timetable-entries" : importType + "s"}/`;
                api.post(endpoint, formData).then((response) => {
                  setResult({ ...result, imported: response.data.imported, skipped: response.data.skipped, confirmed: true, message: response.data.message });
                }).catch((err) => {
                  const detail = err?.response?.data?.detail || err?.message || "Import failed.";
                  setError(typeof detail === "string" ? detail : JSON.stringify(detail));
                });
              }
            }}>
              <Database size={16} /> Confirm Import
            </button>
            <button className="btn-secondary" type="button" onClick={() => { setResult(null); setError(""); }}>
              Clear Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
