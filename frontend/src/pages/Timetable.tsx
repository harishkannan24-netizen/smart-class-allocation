import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Trash2, Edit3, CalendarClock, UploadCloud } from "lucide-react";
import api from "../api/client";
import type { ActivityType, Day, Room, Section, TimetableEntry } from "../types";
import { useAuth } from "../context/AuthContext";

const DAYS: { code: Day; label: string }[] = [
  { code: "MON", label: "Monday" }, { code: "TUE", label: "Tuesday" }, { code: "WED", label: "Wednesday" },
  { code: "THU", label: "Thursday" }, { code: "FRI", label: "Friday" }, { code: "SAT", label: "Saturday" },
];

const ACTIVITY_TYPES: ActivityType[] = [
  "LECTURE", "LAB", "LIBRARY", "SEMINAR", "WORKSHOP", "SPORTS", "INTERNSHIP", "EXAM", "HOLIDAY",
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
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    section: "", room: "", subject: "", faculty_name: "",
    activity_type: "LECTURE", day: "MON", start_time: "09:00", end_time: "10:00",
  });

  const load = () => {
    Promise.all([
      api.get("/campus/timetable-entries/", { params: selectedSection ? { section: selectedSection } : {} }),
      api.get("/campus/sections/"),
      api.get("/campus/rooms/"),
    ]).then(([e, s, r]) => {
      setEntries(e.data.results ?? e.data);
      setSections(s.data.results ?? s.data);
      setRooms(r.data.results ?? r.data);
    });
  };

  useEffect(load, [selectedSection]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        section: Number(form.section),
        room: form.room ? Number(form.room) : null,
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
        section: "", room: "", subject: "", faculty_name: "",
        activity_type: "LECTURE", day: "MON", start_time: "09:00", end_time: "10:00",
      });
    }
    load();
  };

  const handleEdit = (entry: TimetableEntry) => {
    setForm({
      section: String(entry.section),
      room: entry.room ? String(entry.room) : "",
      subject: entry.subject || "",
      faculty_name: entry.faculty_name || "",
      activity_type: entry.activity_type,
      day: entry.day,
      start_time: entry.start_time,
      end_time: entry.end_time,
    });
    setEditingId(entry.id);
    setShowForm(true);
  };

  const downloadTemplate = () => {
    const headers = ["section", "room", "subject", "faculty_name", "activity_type", "day", "start_time", "end_time"];
    const rows = [["1", "202", "Operating Systems", "Dr. Priya Sharma", "LECTURE", "WED", "09:00", "10:00"]];
    const content = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "timetable-template.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleUpload = async (file?: File) => {
    if (!file) return;
    setUploadError("");
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await api.post("/campus/import-timetable-entries/", formData);
      alert(`Imported ${response.data.imported} timetable entries.`);
      load();
    } catch (error: any) {
      const detail = error?.response?.data?.detail || error?.message || "Upload failed.";
      setUploadError(typeof detail === "string" ? detail : JSON.stringify(detail));
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
        <div className="flex flex-wrap items-center gap-3">
          <select className="input w-56" value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)}>
            <option value="">All sections</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
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
                  section: "", room: "", subject: "", faculty_name: "",
                  activity_type: "LECTURE", day: "MON", start_time: "09:00", end_time: "10:00",
                });
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
          if (file) handleUpload(file);
          e.target.value = "";
        }}
      />
      {uploadError && <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{uploadError}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6 grid grid-cols-1 gap-4 p-6 sm:grid-cols-4">
          {error && <div className="sm:col-span-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-600">{error}</div>}
          <div>
            <label className="label">Section</label>
            <select className="input" required value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })}>
              <option value="">Select section</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Room (leave blank if off-site)</label>
            <select className="input" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })}>
              <option value="">No room</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.room_number}</option>)}
            </select>
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
              {DAYS.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
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
                  section: "", room: "", subject: "", faculty_name: "",
                  activity_type: "LECTURE", day: "MON", start_time: "09:00", end_time: "10:00",
                });
                setShowForm(false);
              }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {entries.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <CalendarClock className="mb-3 text-slate-300" size={36} />
          <p className="text-sm text-slate-500">No timetable entries yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {DAYS.map((day) => {
            const dayEntries = entries
              .filter((e) => e.day === day.code)
              .sort((a, b) => a.start_time.localeCompare(b.start_time));
            if (dayEntries.length === 0) return null;
            return (
              <div key={day.code} className="card p-5">
                <h3 className="mb-3 text-sm font-bold text-slate-700">{day.label}</h3>
                <div className="space-y-2">
                  {dayEntries.map((entry) => (
                    <div key={entry.id} className={`rounded-xl border px-3.5 py-2.5 ${activityColor[entry.activity_type]}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">
                          {entry.start_time.slice(0, 5)} – {entry.end_time.slice(0, 5)}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{entry.activity_type}</span>
                          {canEdit && (
                            <>
                              <button onClick={() => handleEdit(entry)} className="text-slate-300 hover:text-brand-700">
                                <Edit3 size={13} />
                              </button>
                              <button onClick={() => handleDelete(entry.id)} className="opacity-50 hover:opacity-100">
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 text-sm font-semibold">{entry.section_label}</p>
                      <p className="text-xs opacity-80">
                        {entry.subject || entry.activity_type} {entry.room_number ? `· ${entry.room_number}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
