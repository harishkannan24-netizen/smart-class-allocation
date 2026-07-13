import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Check, X, ArrowLeftRight } from "lucide-react";
import api, { fetchAll } from "../api/client";
import { broadcast } from "../utils/broadcast";
import type { Department } from "../types";
import { useAuth } from "../context/AuthContext";
import type { Block, Day, Room, Section, TemporaryAllocation } from "../types";

const DAYS: { code: Day; label: string }[] = [
  { code: "MON", label: "Monday" }, { code: "TUE", label: "Tuesday" }, { code: "WED", label: "Wednesday" },
  { code: "THU", label: "Thursday" }, { code: "FRI", label: "Friday" }, { code: "SAT", label: "Saturday" },
];

const statusStyle: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
  COMPLETED: "bg-slate-100 text-slate-600",
  CANCELLED: "bg-slate-100 text-slate-400",
};

export default function Allocations() {
  const { hasRole } = useAuth();
  const canApprove = hasRole("SUPER_ADMIN", "DEPT_ADMIN");

  const [allocations, setAllocations] = useState<TemporaryAllocation[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    department: "", block: "", room: "", section: "", year: "1", day: "MON", start_time: "10:00", end_time: "12:00", reason: "",
  });

  const YEARS = ["1", "2", "3", "4", "5"];
  const filteredSections = sections.filter((s) => String(s.year) === form.year);

  const load = () => {
    Promise.all([
      fetchAll("/campus/temporary-allocations/"),
      fetchAll("/campus/blocks/"),
      fetchAll("/campus/rooms/"),
      fetchAll("/campus/sections/"),
      fetchAll("/campus/departments/"),
    ]).then(([a, b, r, s, d]) => {
      setAllocations(a as any[]);
      setBlocks(b as any[]);
      setRooms(r as any[]);
      setSections(s as any[]);
      setDepartments(d as any[]);
    });
  };

  useEffect(load, []);

  const filteredRooms = rooms.filter((r) => (
    (form.block ? r.block === Number(form.block) : true)
    && (form.department ? String(r.department) === String(form.department) : true)
  ));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post("/campus/temporary-allocations/", {
        ...form, room: Number(form.room), section: Number(form.section),
      });
      // broadcast change so other pages can reload
      try { broadcast({ type: "temporary_allocation_created", payload: res.data }); } catch (e) { /* ignore */ }
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const act = async (id: number, action: "approve" | "reject") => {
    await api.post(`/campus/temporary-allocations/${id}/${action}/`);
    load();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Temporary Allocation</h1>
          <p className="mt-1 text-sm text-slate-500">Request and approve short-term use of free classrooms.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          <Plus size={16} /> New Request
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6 grid grid-cols-1 gap-4 p-6 sm:grid-cols-3">
          <div>
            <label className="label">Department</label>
            <select
              className="input"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value, room: "" })}
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.code}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Block</label>
            <select
              className="input"
              value={form.block}
              onChange={(e) => setForm({ ...form, block: e.target.value, room: "" })}
            >
              <option value="">All blocks</option>
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Room</label>
            <select className="input" required value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })}>
              <option value="">Select room</option>
              {filteredRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.block_name ? `${r.block_name} — ${r.room_number}` : r.room_number}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Year</label>
            <select
              className="input"
              required
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value, section: "" })}
            >
              {YEARS.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Section</label>
            <select className="input" required value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })}>
              <option value="">Select section</option>
              {filteredSections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.department_code ? `${s.department_code}-${s.name}` : s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Day</label>
            <select className="input" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })}>
              {DAYS.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Start Time</label>
            <input type="time" className="input" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </div>
          <div>
            <label className="label">End Time</label>
            <input type="time" className="input" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </div>
          <div>
            <label className="label">Reason</label>
            <input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. CSE-A has no free room" />
          </div>
          <div className="sm:col-span-3">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        {allocations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <ArrowLeftRight className="mb-3 text-slate-300" size={36} />
            <p className="text-sm text-slate-500">No allocation requests yet.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Room</th>
                <th className="px-5 py-3 font-medium">Section</th>
                <th className="px-5 py-3 font-medium">Year</th>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Reason</th>
                <th className="px-5 py-3 font-medium">Status</th>
                {canApprove && <th className="px-5 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allocations.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-semibold text-slate-800">
                    {a.room_block_name ? `${a.room_block_name} — ${a.room_number}` : a.room_number}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{a.section_label}</td>
                  <td className="px-5 py-3 text-slate-600">{a.section_year ?? "—"}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {a.day} · {a.start_time.slice(0, 5)}–{a.end_time.slice(0, 5)}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{a.reason || "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`badge ${statusStyle[a.status]}`}>{a.status}</span>
                  </td>
                  {canApprove && (
                    <td className="px-5 py-3 text-right">
                      {a.status === "PENDING" && (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => act(a.id, "approve")} className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 hover:bg-emerald-100">
                            <Check size={14} />
                          </button>
                          <button onClick={() => act(a.id, "reject")} className="rounded-lg bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100">
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
