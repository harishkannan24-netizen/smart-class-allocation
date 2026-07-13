import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Trash2, Edit3, UploadCloud } from "lucide-react";
import api, { fetchAll } from "../api/client";
import { subscribe } from "../utils/broadcast";
import type { ActivityType, Day, Section, TimetableEntry } from "../types";
import { useAuth } from "../context/AuthContext";

const DEFAULT_DAYS: { code: Day; label: string }[] = [
  { code: "MON", label: "Monday" },
  { code: "TUE", label: "Tuesday" },
  { code: "WED", label: "Wednesday" },
  { code: "THU", label: "Thursday" },
  { code: "FRI", label: "Friday" },
];

const ACTIVITY_TYPES: ActivityType[] = [
  "LECTURE", "LAB", "LIBRARY", "SEMINAR", "WORKSHOP", "SPORTS", "INTERNSHIP", "EXAM", "HOLIDAY",
];

// Fixed template timeslot columns (use labels and ranges from the image template)
const DEFAULT_TEMPLATE_TIMESLOTS = [
  { id: 1, label: '08:45 a.m. - 09:45 a.m.', start_time: '08:45:00', end_time: '09:45:00', order: 1 },
  { id: 2, label: '09:45 a.m. - 10:45 a.m.', start_time: '09:45:00', end_time: '10:45:00', order: 2 },
  { id: 3, label: '10:45 a.m. - 11:00 a.m. (BREAK)', start_time: '10:45:00', end_time: '11:00:00', order: 3 },
  { id: 4, label: '11:00 a.m. - 12:00 p.m.', start_time: '11:00:00', end_time: '12:00:00', order: 4 },
  { id: 5, label: '12:00 p.m. - 01:00 p.m.', start_time: '12:00:00', end_time: '13:00:00', order: 5 },
  { id: 6, label: '01:00 p.m. - 02:00 p.m. (LUNCH)', start_time: '13:00:00', end_time: '14:00:00', order: 6 },
  { id: 7, label: '02:00 p.m. - 03:00 p.m.', start_time: '14:00:00', end_time: '15:00:00', order: 7 },
  { id: 8, label: '03:00 p.m. - 03:50 p.m.', start_time: '15:00:00', end_time: '15:50:00', order: 8 },
  { id: 9, label: '03:50 p.m. - 04:40 p.m.', start_time: '15:50:00', end_time: '16:40:00', order: 9 },
];

const activityColor: Record<ActivityType, string> = {
  LECTURE: "bg-brand-50 text-brand-700 border-brand-200",
  LAB: "bg-cyan-50 text-cyan-700 border-cyan-200",
  LIBRARY: "bg-violet-50 text-violet-700 border-violet-200",
  SEMINAR: "bg-amber-50 text-amber-700 border-amber-200",
  WORKSHOP: "bg-orange-50 text-orange-700 border-orange-200",
  SPORTS: "bg-emerald-50 text-emerald-700 border-emerald-200",
  INTERNSHIP: "bg-pink-50 text-pink-700 border-pink-200",
  EXAM: "bg-rose-50 text-rose-700 border-rose-200",
  HOLIDAY: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function Timetable() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("SUPER_ADMIN", "DEPT_ADMIN");

  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  // use template timeslots fetched from backend (fall back to defaults)
  const [timeslots, setTimeslots] = useState<any[]>(DEFAULT_TEMPLATE_TIMESLOTS as any[]);
  const [days, setDays] = useState<{ code: Day; label: string }[]>(DEFAULT_DAYS);
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [departments, setDepartments] = useState<any[]>([]);
  const [roomInfo, setRoomInfo] = useState({
    room_number: "",
    block_name: "",
    floor_number: "",
    floor_name: "",
  });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadPreview, setUploadPreview] = useState<any>(null);
  const [confirmingUpload, setConfirmingUpload] = useState(false);
  const [previewEntries, setPreviewEntries] = useState<any[] | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  // editable timeslot labels (one per line in the UI)
  const [selectedTimeLabels, setSelectedTimeLabels] = useState<string[]>([
    '08:45 a.m. - 09:45 a.m.',
    '09:45 a.m. - 10:45 a.m.',
    '10:45 a.m. - 11:00 a.m. (BREAK)',
    '11:00 a.m. - 12:00 p.m.',
    '12:00 p.m. - 01:00 p.m.',
    '01:00 p.m. - 02:00 p.m. (LUNCH)',
    '02:00 p.m. - 03:00 p.m.',
    '03:00 p.m. - 03:50 p.m.',
    '03:50 p.m. - 04:40 p.m.',
  ]);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState<any>({
    section: "", subject: "", faculty_name: "",
    activity_type: "LECTURE", day: "MON",
    start_time: "08:45", end_time: "09:45",
  });

  const load = () => {
    Promise.all([
      fetchAll("/campus/timetable-entries/", { ...(selectedSection ? { section: selectedSection } : {}) }),
      fetchAll("/campus/sections/"),
      fetchAll("/campus/departments/"),
      api.get("/campus/timetable-template/"),
    ]).then(([entriesData, sectionsData, departmentsData, templateResp]) => {
      setEntries(entriesData as any[]);
      setSections(sectionsData as any[]);
      setDepartments(departmentsData as any[]);
      const template = templateResp.data || {};
      if (template.timeslots) setTimeslots(template.timeslots);
      if (template.days) setDays(template.days);
    }).catch(() => {
      // fallback already initialized
    });
  };

  useEffect(load, [selectedSection]);
  useEffect(() => {
    const unsub = subscribe((m) => {
      if (m.type === "temporary_allocation_created") load();
    });
    return unsub;
  }, [selectedSection]);

  useEffect(() => {
    setSelectedSection("");
  }, [selectedDepartment]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload: any = {
        section: Number(form.section),
        subject: form.subject,
        faculty_name: form.faculty_name,
        activity_type: form.activity_type,
        day: form.day,
        start_time: form.start_time,
        end_time: form.end_time,
      };
      if (editingId) {
        await api.put(`/campus/timetable-entries/${editingId}/`, payload);
      } else {
        await api.post("/campus/timetable-entries/", payload);
      }
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (err: any) {
      const data = err?.response?.data;
      setError(Array.isArray(data) ? data.join(" ") : data?.detail || "Could not save entry — check for conflicts.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this timetable entry?")) return;
    await api.delete(`/campus/timetable-entries/${id}/`);
    if (editingId === id) {
      setEditingId(null);
      setShowForm(false);
      setForm({
        section: "", subject: "", faculty_name: "",
        activity_type: "LECTURE", day: "MON",
        start_time: "08:45", end_time: "09:45",
      });
      setRoomInfo({ room_number: "", block_name: "", floor_number: "", floor_name: "" });
      setRoomInfo({ room_number: "", block_name: "", floor_number: "", floor_name: "" });
    }
    load();
  };

  const handleEdit = (entry: TimetableEntry) => {
    setForm({
      section: String(entry.section),
      subject: entry.subject || "",
      faculty_name: entry.faculty_name || "",
      activity_type: entry.activity_type,
      day: entry.day,
      start_time: entry.start_time ? entry.start_time.slice(0, 5) : "09:00",
      end_time: entry.end_time ? entry.end_time.slice(0, 5) : "10:00",
    });
    const sectionDetail = sections.find((s) => String(s.id) === String(entry.section));
    if (sectionDetail) {
      setRoomInfo({
        room_number: sectionDetail.permanent_room_number || "No Room Assigned",
        block_name: sectionDetail.permanent_room_block_name || "",
        floor_number: sectionDetail.permanent_room_floor_number ? String(sectionDetail.permanent_room_floor_number) : "",
        floor_name: sectionDetail.permanent_room_floor_name || "",
      });
    } else {
      setRoomInfo({ room_number: "", block_name: "", floor_number: "", floor_name: "" });
    }
    setEditingId(entry.id);
    setShowForm(true);
  };

  const downloadTemplate = () => {
    const headers = ["section", "subject", "faculty_name", "activity_type", "day", "start_time", "end_time"];
    const rows = [["1", "Operating Systems", "Dr. Priya Sharma", "LECTURE", "WED", "09:00", "10:00"]];
    const content = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "timetable-template.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleUpload = async (file?: File, previewOnly = true) => {
    if (!file) return;
    setUploadError("");
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("preview", previewOnly ? "true" : "false");
    try {
      formData.append("timeslot_labels", JSON.stringify(selectedTimeLabels));
    } catch (e) {
      // ignore
    }

    try {
      const response = await api.post("/campus/import-timetable-entries/", formData);
      if (previewOnly) {
        setUploadPreview(response.data);
        setConfirmingUpload(true);
        setPreviewFile(file);
        setPreviewGrid(response.data.grid_preview || null);
      } else {
        setUploadPreview(null);
        setConfirmingUpload(false);
        setPreviewFile(null);
        setPreviewGrid(null);
        alert(`Imported ${response.data.imported} timetable entries. Skipped ${response.data.skipped} invalid rows.`);
        load();
      }
    } catch (error: any) {
      const detail = error?.response?.data?.detail || error?.message || "Upload failed.";
      setUploadError(typeof detail === "string" ? detail : JSON.stringify(detail));
      setUploadPreview(null);
      setConfirmingUpload(false);
      setPreviewGrid(null);
      setPreviewFile(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Weekly Timetable</h1>
          <p className="mt-1 text-sm text-slate-500">Lectures, labs, library slots, and more — by section.</p>
        </div>
        <div className="w-full mt-2">
          {canEdit && (
            <div className="text-sm">
              <label className="label">Timeslot labels (one per line)</label>
              <textarea
                className="input w-full min-h-[80px] text-xs"
                value={selectedTimeLabels.join('\n')}
                onChange={(e) => setSelectedTimeLabels(e.target.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean))}
                placeholder="Paste or edit exact time labels to keep, one per line"
              />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select className="input w-56" value={selectedDepartment} onChange={(e) => setSelectedDepartment(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
          </select>
          <select className="input w-56" value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)}>
            <option value="">All sections</option>
            {sections.filter(s => !selectedDepartment || String(s.department) === String(selectedDepartment)).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {canEdit && (
            <>
              <button className="btn-secondary" type="button" onClick={downloadTemplate}>
                Download Template
              </button>
              <button className="btn-secondary" type="button" disabled={uploading} onClick={() => uploadInputRef.current?.click()}>
                <UploadCloud size={16} /> {uploading ? "Uploading..." : "Upload CSV/XLSX"}
              </button>
              <button className="btn-primary" onClick={() => {
                setEditingId(null);
                setForm({
                  section: "", subject: "", faculty_name: "",
                  activity_type: "LECTURE", day: "MON",
                  start_time: "08:45", end_time: "09:45",
                });
                setRoomInfo({ room_number: "", block_name: "", floor_number: "", floor_name: "" });
                setShowForm((s) => !s);
              }}>
                <Plus size={16} /> Add Entry
              </button>
            </>
          )}
        </div>
      </div>
      <input
        ref={uploadInputRef}
        type="file"
        accept=".csv,.xls,.xlsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file, true);
          e.target.value = "";
        }}
      />
      {uploadError && <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{uploadError}</div>}
      {uploadPreview && confirmingUpload && (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-slate-700">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-brand-800">Import preview ready</div>
              <div>{uploadPreview.valid_rows} valid rows detected from {uploadPreview.total_rows} rows.</div>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary" type="button" onClick={() => { setUploadPreview(null); setConfirmingUpload(false); }}>
                Cancel
              </button>
              <button className="btn-primary" type="button" disabled={uploading} onClick={() => {
                const file = previewFile || uploadInputRef.current?.files?.[0];
                if (file) handleUpload(file, false);
              }}>
                {uploading ? "Importing..." : "Confirm Import"}
              </button>
            </div>
          </div>
          <div className="max-h-60 overflow-auto rounded-lg border border-brand-100 bg-white p-3">
            {uploadPreview.grid_preview ? (
              <div className="overflow-auto">
                <table className="w-full table-auto border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="border px-2 py-1 text-left">Day / Time</th>
                      {uploadPreview.grid_preview.timeslots.map((t: any, i: number) => (
                        <th key={i} className="border px-2 py-1 text-left">{t.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(uploadPreview.grid_preview.days).map((dayCode) => (
                      <tr key={dayCode}>
                        <td className="border px-2 py-1 font-medium">{dayCode}</td>
                        {uploadPreview.grid_preview.days[dayCode].map((cell: any, ci: number) => (
                          <td key={ci} className="border px-2 py-1 align-top">
                            {cell ? (
                              <div>
                                <div className="font-semibold">{cell.subject}</div>
                                <div className="text-slate-500">{cell.department ? `${cell.department} • ` : ""}{cell.faculty_name || ""}</div>
                                <div className="text-xxs text-slate-400">{cell.room || ""}</div>
                              </div>
                            ) : (
                              <div className="text-xs opacity-50">—</div>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Preview rows</div>
                <ul className="space-y-2">
                  {uploadPreview.valid_data?.slice(0, 8).map((row: any, index: number) => (
                    <li key={index} className="rounded-md border border-slate-200 px-3 py-2 text-xs">
                      <div className="font-medium text-slate-700">{row.data.section || "Unknown section"}</div>
                      <div className="text-slate-500">{row.data.day} • {row.data.start_time}-{row.data.end_time} • {row.data.subject || "—"} • {row.data.faculty_name || "—"}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6 grid grid-cols-1 gap-4 p-6 sm:grid-cols-4">
          {error && <div className="sm:col-span-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-600">{error}</div>}
          <div>
            <label className="label">Section</label>
            <select
              className="input"
              required
              value={form.section}
              onChange={(e) => {
                const sectionId = e.target.value;
                const section = sections.find((s) => String(s.id) === sectionId);
                setForm({ ...form, section: sectionId });
                if (section) {
                  setRoomInfo({
                    room_number: section.permanent_room_number || "No Room Assigned",
                    block_name: section.permanent_room_block_name || "",
                    floor_number: section.permanent_room_floor_number ? String(section.permanent_room_floor_number) : "",
                    floor_name: section.permanent_room_floor_name || "",
                  });
                } else {
                  setRoomInfo({ room_number: "", block_name: "", floor_number: "", floor_name: "" });
                }
              }}
            >
              <option value="">Select section</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Assigned Room</label>
            <div className="input h-auto min-h-[42px] rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
              <div>{roomInfo.room_number || "No Room Assigned"}</div>
              {roomInfo.block_name && (
                <div className="text-xs text-slate-500">
                  {roomInfo.block_name}{roomInfo.floor_name ? ` · ${roomInfo.floor_name}` : roomInfo.floor_number ? ` · Floor ${roomInfo.floor_number}` : ""}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="label">Activity</label>
            <select className="input" value={form.activity_type} onChange={(e) => setForm({ ...form, activity_type: e.target.value })}>
              {ACTIVITY_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Day</label>
            <select className="input" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })}>
              {days.map((d: { code: Day; label: string }) => <option key={d.code} value={d.code}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Subject</label>
            <input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Operating Systems" />
          </div>
          <div>
            <label className="label">Faculty</label>
            <input className="input" value={form.faculty_name} onChange={(e) => setForm({ ...form, faculty_name: e.target.value })} />
          </div>
          {/* Timeslot field removed — using start_time/end_time only */}
          <div className="sm:col-span-4">
            <label className="label">Quick Time Presets</label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="px-3 py-1 bg-slate-100 hover:bg-brand-50 rounded-md text-sm border border-slate-200" onClick={() => setForm({ ...form, start_time: "08:45", end_time: "09:45" })}>08:45-09:45</button>
              <button type="button" className="px-3 py-1 bg-slate-100 hover:bg-brand-50 rounded-md text-sm border border-slate-200" onClick={() => setForm({ ...form, start_time: "09:45", end_time: "10:45" })}>09:45-10:45</button>
              <button type="button" className="px-3 py-1 bg-slate-100 hover:bg-brand-50 rounded-md text-sm border border-slate-200" onClick={() => setForm({ ...form, start_time: "10:45", end_time: "11:00" })}>10:45-11:00</button>
              <button type="button" className="px-3 py-1 bg-slate-100 hover:bg-brand-50 rounded-md text-sm border border-slate-200" onClick={() => setForm({ ...form, start_time: "11:00", end_time: "12:00" })}>11:00-12:00</button>
              <button type="button" className="px-3 py-1 bg-slate-100 hover:bg-brand-50 rounded-md text-sm border border-slate-200" onClick={() => setForm({ ...form, start_time: "12:00", end_time: "13:00" })}>12:00-13:00</button>
              <button type="button" className="px-3 py-1 bg-slate-100 hover:bg-brand-50 rounded-md text-sm border border-slate-200" onClick={() => setForm({ ...form, start_time: "13:00", end_time: "14:00" })}>13:00-14:00</button>
              <button type="button" className="px-3 py-1 bg-slate-100 hover:bg-brand-50 rounded-md text-sm border border-slate-200" onClick={() => setForm({ ...form, start_time: "14:00", end_time: "15:00" })}>14:00-15:00</button>
              <button type="button" className="px-3 py-1 bg-slate-100 hover:bg-brand-50 rounded-md text-sm border border-slate-200" onClick={() => setForm({ ...form, start_time: "15:00", end_time: "15:50" })}>15:00-15:50</button>
              <button type="button" className="px-3 py-1 bg-slate-100 hover:bg-brand-50 rounded-md text-sm border border-slate-200" onClick={() => setForm({ ...form, start_time: "15:50", end_time: "16:40" })}>15:50-16:40</button>
            </div>
          </div>
          <div>
            <label className="label">Start Time</label>
            <input type="time" className="input" required value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </div>
          <div>
            <label className="label">End Time</label>
            <input type="time" className="input" required value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </div>
          <div className="sm:col-span-4 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving..." : editingId ? "Update Entry" : "Save Entry"}
            </button>
            {editingId && (
              <button type="button" className="btn-secondary" onClick={() => {
                setEditingId(null);
                setForm({
                  section: "", subject: "", faculty_name: "",
                  activity_type: "LECTURE", day: "MON",
                  start_time: "09:00", end_time: "10:00",
                });
                setRoomInfo({ room_number: "", block_name: "", floor_number: "", floor_name: "" });
                setShowForm(false);
              }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      <div className="card p-4">
        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse">
            <thead>
              <tr>
                <th className="border px-3 py-2 text-left">Day / Time</th>
                {timeslots.sort((a,b)=> (a.order ?? 0) - (b.order ?? 0)).map((slot) => (
                  <th key={slot.id} className="border px-3 py-2 text-left">
                    <div className="font-mono text-sm">{slot.label}</div>
                    <div className="text-xs opacity-70">{slot.start_time.slice(0,5)}–{slot.end_time.slice(0,5)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d: { code: Day; label: string }) => (
                <tr key={d.code}>
                  <td className="border px-3 py-2 align-top font-medium">{d.label}</td>
                  {timeslots.sort((a,b)=> (a.order ?? 0) - (b.order ?? 0)).map((slot) => {
                    const cell = entries.find(e => e.day === d.code && (e.start_time && e.start_time >= slot.start_time && e.start_time < slot.end_time));
                    return (
                      <td key={slot.id + "-" + d.code} className="border px-3 py-2 align-top">
                        {cell ? (
                          <div className={`rounded-md border px-2 py-1 ${activityColor[cell.activity_type]}`}>
                            <div className="flex items-center justify-between">
                              <strong className="text-sm">{cell.subject || cell.activity_type}</strong>
                              <div className="flex items-center gap-2">
                                {canEdit && <button onClick={() => handleEdit(cell)} className="text-slate-400 hover:text-brand-700"><Edit3 size={14} /></button>}
                                {canEdit && <button onClick={() => handleDelete(cell.id)} className="text-red-500"><Trash2 size={14} /></button>}
                              </div>
                            </div>
                            <div className="text-xs opacity-80">{cell.section_label || `Section ${cell.section}`} {cell.room_number ? `· ${cell.room_number}` : ""}</div>
                          </div>
                        ) : (
                          <div className="text-xs opacity-50">—</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
