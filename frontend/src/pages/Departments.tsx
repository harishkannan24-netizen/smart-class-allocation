import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Trash2, Layers, UploadCloud, Edit3 } from "lucide-react";
import api, { fetchAll } from "../api/client";
import type { Department } from "../types";

export default function Departments() {
  const [items, setItems] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", hod_name: "" });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const load = () => {
    setLoading(true);
    fetchAll("/campus/departments/").then((res: any) => {
      const data = res;
      setItems(Array.isArray(data) ? data : data.results ?? []);
    }).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/campus/departments/${editingId}/`, form);
      } else {
        await api.post("/campus/departments/", form);
      }
      setForm({ name: "", code: "", hod_name: "" });
      setEditingId(null);
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this department?")) return;
    await api.delete(`/campus/departments/${id}/`);
    if (editingId === id) {
      setEditingId(null);
      setForm({ name: "", code: "", hod_name: "" });
      setShowForm(false);
    }
    load();
  };

  const handleEdit = (department: Department) => {
    setForm({ name: department.name, code: department.code, hod_name: department.hod_name || "" });
    setEditingId(department.id);
    setShowForm(true);
  };

  const downloadTemplate = () => {
    const headers = ["name", "code", "hod_name"];
    const rows = [["Computer Science Engineering", "CSE", "Dr. Jane Doe"]];
    const content = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "departments-template.csv";
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
      const response = await api.post("/campus/import-departments/", formData);
      alert(`Imported ${response.data.imported} departments.`);
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
          <h1 className="text-2xl font-bold text-slate-800">Departments</h1>
          <p className="mt-1 text-sm text-slate-500">Manage academic departments across campus.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-secondary" type="button" onClick={downloadTemplate}>
            Download Template
          </button>
          <button className="btn-secondary" type="button" disabled={uploading} onClick={() => uploadInputRef.current?.click()}>
            <UploadCloud size={16} /> {uploading ? "Uploading..." : "Upload CSV/XLSX"}
          </button>
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            <Plus size={16} /> Add Department
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
            <label className="label">Department Name</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Computer Science Engineering" />
          </div>
          <div>
            <label className="label">Code</label>
            <input className="input" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CSE" />
          </div>
          <div>
            <label className="label">HOD Name</label>
            <input className="input" value={form.hod_name} onChange={(e) => setForm({ ...form, hod_name: e.target.value })} placeholder="Dr. Jane Doe" />
          </div>
          <div className="sm:col-span-3 flex items-center gap-3">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving..." : editingId ? "Update Department" : "Save Department"}
            </button>
            {editingId && (
              <button type="button" className="btn-secondary" onClick={() => {
                setEditingId(null);
                setForm({ name: "", code: "", hod_name: "" });
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
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Layers className="mb-3 text-slate-300" size={36} />
            <p className="text-sm text-slate-500">No departments yet. Add your first one above.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Code</th>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">HOD</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-semibold text-brand-700">{d.code}</td>
                  <td className="px-5 py-3 text-slate-700">{d.name}</td>
                  <td className="px-5 py-3 text-slate-500">{d.hod_name || "—"}</td>
                  <td className="px-5 py-3 text-right flex items-center justify-end gap-3">
                    <button onClick={() => handleEdit(d)} className="text-slate-400 hover:text-brand-700">
                      <Edit3 size={16} />
                    </button>
                    <button onClick={() => handleDelete(d.id)} className="text-slate-400 hover:text-rose-600">
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
