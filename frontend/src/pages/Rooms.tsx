import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Trash2, DoorOpen, Wifi, Monitor, Snowflake, Projector, UploadCloud, Edit3 } from "lucide-react";
import api, { fetchAll } from "../api/client";
import { subscribe } from "../utils/broadcast";
import { StatusBadge } from "../components/Badges";
import type { Department, Floor, Room, RoomStatus, RoomType } from "../types";

const ROOM_TYPES: RoomType[] = ["CLASSROOM", "LAB", "SEMINAR_HALL", "LIBRARY", "AUDITORIUM", "OTHER"];
const STATUSES: RoomStatus[] = ["FREE", "ALLOCATED", "OCCUPIED", "RESERVED", "MAINTENANCE"];

export default function Rooms() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [tempAllocated, setTempAllocated] = useState<Record<number, any>>({});
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    floor: "", room_number: "", room_type: "CLASSROOM", capacity: "60",
    department: "", status: "FREE", has_projector: false, has_smart_board: false,
    is_computer_lab: false, has_ac: false, has_wifi: true,
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      fetchAll("/campus/temporary-allocations/"),
      fetchAll("/campus/rooms/"),
      fetchAll("/campus/floors/"),
      fetchAll("/campus/departments/"),
    ]).then(([allocs, r, f, d]) => {
      setRooms(r as any[]);
      setFloors(f as any[]);
      setDepartments(d as any[]);
      const map: Record<number, any> = {};
      const list = allocs as any[];
      list.forEach((a: any) => {
        if (!a?.room) return;
        const key = a.room;
        const existing = map[key];
        if (!existing) map[key] = a;
        else {
          const t1 = existing.created_at ? Date.parse(existing.created_at) : (existing.id ?? 0);
          const t2 = a.created_at ? Date.parse(a.created_at) : (a.id ?? 0);
          if (t2 > t1) map[key] = a;
        }
      });
      setTempAllocated(map);
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
        floor: Number(form.floor),
        capacity: Number(form.capacity),
        department: form.department ? Number(form.department) : null,
      };
      if (editingId) {
        await api.put(`/campus/rooms/${editingId}/`, payload);
      } else {
        await api.post("/campus/rooms/", payload);
      }
      setEditingId(null);
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this room?")) return;
    await api.delete(`/campus/rooms/${id}/`);
    if (editingId === id) {
      setEditingId(null);
      setForm({
        floor: "", room_number: "", room_type: "CLASSROOM", capacity: "60",
        department: "", status: "FREE", has_projector: false, has_smart_board: false,
        is_computer_lab: false, has_ac: false, has_wifi: true,
      });
      setShowForm(false);
    }
    load();
  };

  const handleEdit = (room: Room) => {
    setForm({
      floor: String(room.floor),
      room_number: room.room_number,
      room_type: room.room_type,
      capacity: String(room.capacity),
      department: room.department ? String(room.department) : "",
      status: room.status,
      has_projector: room.has_projector,
      has_smart_board: room.has_smart_board,
      is_computer_lab: room.is_computer_lab,
      has_ac: room.has_ac,
      has_wifi: room.has_wifi,
    });
    setEditingId(room.id);
    setShowForm(true);
  };

  const downloadTemplate = async () => {
    const headers = ["floor", "room_number", "room_type", "capacity", "department", "status", "has_projector", "has_smart_board", "is_computer_lab", "has_ac", "has_wifi"];
    // include a few sample rows to demonstrate bulk format
    const rows = [] as string[][];
    for (let i = 0; i < 20; i++) {
      rows.push(["2", `LHA${200 + i}`, "CLASSROOM", "60", "", "FREE", "TRUE", "FALSE", "FALSE", "TRUE", "TRUE"]);
    }

    const downloadBlob = (blob: Blob, filename: string) => {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    };

    try {
      const response = await api.get("/campus/rooms-template/", { responseType: "blob" });
      downloadBlob(response.data, "rooms-template.xlsx");
      return;
    } catch (error) {
      // fallback to CSV if XLSX download fails
    }

    try {
      const res = await api.get("/campus/room-choices/");
      const types = res.data.room_types.map((t: any) => t.value).join("|");
      const statuses = res.data.statuses.map((s: any) => s.value).join("|");
      const meta = [
        `# Allowed room_type: ${types}`,
        `# Allowed status: ${statuses}`,
        `# Note: include 'block' and 'floor' to auto-create locations when importing`,
      ];
      const content = [...meta, headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))].join("\n");
      downloadBlob(new Blob([content], { type: "text/csv;charset=utf-8;" }), "rooms-template.csv");
    } catch (error) {
      const content = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))].join("\n");
      downloadBlob(new Blob([content], { type: "text/csv;charset=utf-8;" }), "rooms-template.csv");
    }
  };

  const handleUpload = async (file?: File) => {
    if (!file) return;
    setUploadError("");
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      // include a longer timeout and multipart hints to better support large files
      const response = await api.post("/campus/import-rooms/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
        // axios/browser hints for large payloads
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      alert(`Imported ${response.data.imported} rooms.`);
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
          <h1 className="text-2xl font-bold text-slate-800">Rooms</h1>
          <p className="mt-1 text-sm text-slate-500">Manage classrooms, labs, and shared spaces.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-secondary" type="button" onClick={downloadTemplate}>
            Download Template
          </button>
          <button className="btn-secondary" type="button" disabled={uploading} onClick={() => uploadInputRef.current?.click()}>
            <UploadCloud size={16} /> {uploading ? "Uploading..." : "Upload CSV/XLSX"}
          </button>
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            <Plus size={16} /> Add Room
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
            <label className="label">Floor</label>
            <select className="input" required value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })}>
              <option value="">Select floor</option>
              {floors.map((f) => <option key={f.id} value={f.id}>{f.block_name} — {f.name || `Floor ${f.number}`}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Room Number</label>
            <input className="input" required placeholder="LHA202" value={form.room_number} onChange={(e) => setForm({ ...form, room_number: e.target.value })} />
          </div>
          <div>
            <label className="label">Capacity</label>
            <input type="number" className="input" required value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          </div>
          <div>
            <label className="label">Room Type</label>
            <select className="input" value={form.room_type} onChange={(e) => setForm({ ...form, room_type: e.target.value })}>
              {ROOM_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Assigned Department</label>
            <select className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
              <option value="">Unassigned / shared</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="sm:col-span-3 flex flex-wrap gap-4">
            {[
              ["has_projector", "Projector"], ["has_smart_board", "Smart Board"],
              ["is_computer_lab", "Computer Lab"], ["has_ac", "Air Conditioner"], ["has_wifi", "Wi-Fi"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={(form as any)[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                  className="rounded border-slate-300"
                />
                {label}
              </label>
            ))}
          </div>

          <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving..." : editingId ? "Update Room" : "Save Room"}
            </button>
            {editingId && (
              <button type="button" className="btn-secondary" onClick={() => {
                setEditingId(null);
                setForm({
                  floor: "", room_number: "", room_type: "CLASSROOM", capacity: "60",
                  department: "", status: "FREE", has_projector: false, has_smart_board: false,
                  is_computer_lab: false, has_ac: false, has_wifi: true,
                });
                setShowForm(false);
              }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {loading ? (
        <div className="card p-6 text-sm text-slate-400">Loading...</div>
      ) : rooms.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <DoorOpen className="mb-3 text-slate-300" size={36} />
          <p className="text-sm text-slate-500">No rooms yet. Add your first one above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <div key={room.id} className="card p-5">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="text-base font-bold text-slate-800">{room.room_number}</p>
                  <p className="text-xs text-slate-500">{room.block_name} · Floor {room.floor_number}</p>
                </div>
                <div>
                  {tempAllocated[room.id] ? (
                    <>
                      <span
                        className="badge bg-amber-50 text-amber-700"
                        title={`${tempAllocated[room.id].section_label ?? ''} · ${tempAllocated[room.id].day ?? ''} ${tempAllocated[room.id].start_time ? tempAllocated[room.id].start_time.slice(0,5) : ''}-${tempAllocated[room.id].end_time ? tempAllocated[room.id].end_time.slice(0,5) : ''}${tempAllocated[room.id].reason ? ' · ' + tempAllocated[room.id].reason : ''}`}
                      >
                        Allocated (temp)
                      </span>
                      <div className="mt-2 text-xs text-slate-600">
                        {tempAllocated[room.id].section_label ? <span>{tempAllocated[room.id].section_label}</span> : null}
                        {tempAllocated[room.id].start_time ? (
                          <span>{` · ${tempAllocated[room.id].start_time.slice(0,5)}-${tempAllocated[room.id].end_time?.slice(0,5) ?? ''}`}</span>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <StatusBadge status={room.status} />
                  )}
                </div>
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                <span className="badge bg-slate-100 text-slate-600">{room.room_type.replace("_", " ")}</span>
                <span className="badge bg-slate-100 text-slate-600">Cap. {room.capacity}</span>
                {room.department_code && <span className="badge bg-brand-50 text-brand-700">{room.department_code}</span>}
              </div>
              <div className="flex items-center gap-3 text-slate-400">
                {room.has_wifi && <Wifi size={15} />}
                {room.has_projector && <Projector size={15} />}
                {room.is_computer_lab && <Monitor size={15} />}
                {room.has_ac && <Snowflake size={15} />}
                <button onClick={() => handleEdit(room)} className="text-slate-300 hover:text-brand-700">
                  <Edit3 size={15} />
                </button>
                <button onClick={() => handleDelete(room.id)} className="ml-auto text-slate-300 hover:text-rose-500">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
