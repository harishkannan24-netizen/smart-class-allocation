import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Trash2, GraduationCap, UploadCloud, Edit3 } from "lucide-react";
import api, { fetchAll } from "../api/client";
import { subscribe } from "../utils/broadcast";
import type { Department, Room, Section } from "../types";

export default function Sections() {
  const [sections, setSections] = useState<Section[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tempAllocMap, setTempAllocMap] = useState<Record<number, { room_number: string; room_id: number }>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    department: "", year: "1", name: "", semester: "1",
    strength: "60", class_advisor: "", permanent_room: "",
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      fetchAll("/campus/temporary-allocations/"),
      fetchAll("/campus/sections/"),
      fetchAll("/campus/departments/"),
      fetchAll("/campus/rooms/"),
    ]).then(([allocations, s, d, r]) => {
      setSections(s as any[]);
      setDepartments(d as any[]);
      setRooms(r as any[]);
      const map: Record<number, { room_number: string; room_id: number }> = {};
      allocations.forEach((al: any) => {
        if (al?.section && al?.room_number) {
          map[al.section] = { room_number: al.room_number, room_id: al.room };
        }
      });
      setTempAllocMap(map);
    }).finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    const unsub = subscribe((m) => {
      if (m.type === "temporary_allocation_created") load();
    });
    return unsub;
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        department: Number(form.department),
        year: Number(form.year),
        semester: Number(form.semester),
        strength: Number(form.strength),
        permanent_room: form.permanent_room ? Number(form.permanent_room) : null,
      };
      if (editingId) {
        await api.put(`/campus/sections/${editingId}/`, payload);
      } else {
        await api.post("/campus/sections/", payload);
      }
      setEditingId(null);
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this section?")) return;
    await api.delete(`/campus/sections/${id}/`);
    if (editingId === id) {
      setEditingId(null);
      setForm({ department: "", year: "1", name: "", semester: "1", strength: "60", class_advisor: "", permanent_room: "" });
      setShowForm(false);
    }
    load();
  };

  const handleEdit = (section: Section) => {
    setForm({
      department: String(section.department),
      year: String(section.year),
      name: section.name,
      semester: String(section.semester),
      strength: String(section.strength),
      class_advisor: section.class_advisor || "",
      permanent_room: section.permanent_room ? String(section.permanent_room) : "",
    });
    setEditingId(section.id);
    setShowForm(true);
  };

  const downloadTemplate = () => {
    const headers = ["department", "year", "name", "semester", "strength", "class_advisor", "permanent_room"];
    const rows = [["1", "2", "A", "3", "60", "Dr. Priya Sharma", "202"]];
    const content = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "sections-template.csv";
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
      const response = await api.post("/campus/import-sections/", formData);
      alert(`Imported ${response.data.imported} sections.`);
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
          <h1 className="text-2xl font-bold text-slate-800">Sections</h1>
          <p className="mt-1 text-sm text-slate-500">Manage classes and their permanent room assignments.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-secondary" type="button" onClick={downloadTemplate}>
            Download Template
          </button>
          <button className="btn-secondary" type="button" disabled={uploading} onClick={() => uploadInputRef.current?.click()}>
            <UploadCloud size={16} /> {uploading ? "Uploading..." : "Upload CSV/XLSX"}
          </button>
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            <Plus size={16} /> Add Section
          </button>
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
        <form onSubmit={handleSubmit} className="card mb-6 grid grid-cols-1 gap-4 p-6 sm:grid-cols-3">
          <div>
            <label className="label">Department</label>
            <select className="input" required value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
              <option value="">Select department</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Year</label>
            <input type="number" min={1} max={5} className="input" required value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
          </div>
          <div>
            <label className="label">Section</label>
            <input className="input" required placeholder="A" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Semester</label>
            <input type="number" min={1} max={10} className="input" required value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} />
          </div>
          <div>
            <label className="label">Strength</label>
            <input type="number" className="input" required value={form.strength} onChange={(e) => setForm({ ...form, strength: e.target.value })} />
          </div>
          <div>
            <label className="label">Class Advisor</label>
            <input className="input" value={form.class_advisor} onChange={(e) => setForm({ ...form, class_advisor: e.target.value })} />
          </div>
          <div>
            <label className="label">Permanent Room</label>
            <select className="input" value={form.permanent_room} onChange={(e) => setForm({ ...form, permanent_room: e.target.value })}>
              <option value="">None</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.room_number}</option>)}
            </select>
          </div>
          <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving..." : editingId ? "Update Section" : "Save Section"}
            </button>
            {editingId && (
              <button type="button" className="btn-secondary" onClick={() => {
                setEditingId(null);
                setForm({ department: "", year: "1", name: "", semester: "1", strength: "60", class_advisor: "", permanent_room: "" });
                setShowForm(false);
              }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-400">Loading...</div>
        ) : sections.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <GraduationCap className="mb-3 text-slate-300" size={36} />
            <p className="text-sm text-slate-500">No sections yet. Add your first one above.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Section</th>
                <th className="px-5 py-3 font-medium">Advisor</th>
                <th className="px-5 py-3 font-medium">Strength</th>
                <th className="px-5 py-3 font-medium">Room</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sections.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-semibold text-slate-800">{s.label}</td>
                  <td className="px-5 py-3 text-slate-500">{s.class_advisor || "—"}</td>
                  <td className="px-5 py-3 text-slate-500">{s.strength}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {tempAllocMap[s.id] ? (
                      <span className="flex items-center gap-2">
                        <span>{tempAllocMap[s.id].room_number}</span>
                        <span className="badge bg-amber-50 text-amber-700">Temporary</span>
                      </span>
                    ) : (
                      s.permanent_room_number || "—"
                    )}
                  </td>
                  <td className="px-5 py-3 text-right flex items-center justify-end gap-3">
                    <button onClick={() => handleEdit(s)} className="text-slate-400 hover:text-brand-700">
                      <Edit3 size={16} />
                    </button>
                    <button onClick={() => handleDelete(s.id)} className="text-slate-400 hover:text-rose-600">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
