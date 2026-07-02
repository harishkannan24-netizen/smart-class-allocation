import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Search, DoorOpen, Sparkles } from "lucide-react";
import api from "../api/client";
import { StatusBadge } from "../components/Badges";
import type { Day, Department, Room, RoomType } from "../types";
import { useAuth } from "../context/AuthContext";

const DAYS: { code: Day; label: string }[] = [
  { code: "MON", label: "Monday" }, { code: "TUE", label: "Tuesday" }, { code: "WED", label: "Wednesday" },
  { code: "THU", label: "Thursday" }, { code: "FRI", label: "Friday" }, { code: "SAT", label: "Saturday" },
];
const ROOM_TYPES: RoomType[] = ["CLASSROOM", "LAB", "SEMINAR_HALL", "LIBRARY", "AUDITORIUM", "OTHER"];

function currentDayCode(): Day {
  const map: Day[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return map[new Date().getDay()];
}
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function plusOneHour(t: string) {
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h + 1, m);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function FreeRoomFinder() {
  const { hasRole } = useAuth();
  const canAllocate = hasRole("SUPER_ADMIN", "DEPT_ADMIN");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [results, setResults] = useState<Room[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const [form, setForm] = useState({
    day: currentDayCode(),
    start_time: nowTime(),
    end_time: plusOneHour(nowTime()),
    room_type: "",
    min_capacity: "",
    department_id: "",
  });

  useEffect(() => {
    api.get("/campus/departments/").then((r) => setDepartments(r.data.results ?? r.data));
  }, []);

  const search = async (e?: FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setSearched(true);
    try {
      const params: Record<string, string> = {
        day: form.day, start_time: form.start_time, end_time: form.end_time,
      };
      if (form.room_type) params.room_type = form.room_type;
      if (form.min_capacity) params.min_capacity = form.min_capacity;
      if (form.department_id) params.department_id = form.department_id;
      const { data } = await api.get<Room[]>("/campus/free-rooms/", { params });
      setResults(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
          <Sparkles className="text-brand-600" size={22} /> Find Free Room
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Instantly see which classrooms are empty — including rooms freed up by labs, library sessions, or workshops.
        </p>
      </div>

      <form onSubmit={search} className="card mb-6 grid grid-cols-1 gap-4 p-6 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <label className="label">Day</label>
          <select className="input" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value as Day })}>
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
          <label className="label">Room Type</label>
          <select className="input" value={form.room_type} onChange={(e) => setForm({ ...form, room_type: e.target.value })}>
            <option value="">Any</option>
            {ROOM_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Min. Capacity</label>
          <input type="number" className="input" value={form.min_capacity} onChange={(e) => setForm({ ...form, min_capacity: e.target.value })} placeholder="e.g. 60" />
        </div>
        <div>
          <label className="label">Department</label>
          <select className="input" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
            <option value="">Any</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
          </select>
        </div>
        <div className="sm:col-span-3 lg:col-span-6">
          <button type="submit" disabled={loading} className="btn-primary">
            <Search size={16} /> {loading ? "Searching..." : "Search Free Rooms"}
          </button>
        </div>
      </form>

      {searched && (
        results && results.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((room) => (
              <div key={room.id} className="card p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <p className="text-base font-bold text-slate-800">{room.room_number}</p>
                    <p className="text-xs text-slate-500">{room.block_name} · Floor {room.floor_number}</p>
                  </div>
                  <StatusBadge status="FREE" />
                </div>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  <span className="badge bg-slate-100 text-slate-600">{room.room_type.replace("_", " ")}</span>
                  <span className="badge bg-slate-100 text-slate-600">Cap. {room.capacity}</span>
                  {room.department_code && <span className="badge bg-brand-50 text-brand-700">{room.department_code}</span>}
                </div>
                {canAllocate && (
                  <button className="btn-secondary w-full text-xs">
                    Allocate this room
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="card flex flex-col items-center justify-center p-12 text-center">
            <DoorOpen className="mb-3 text-slate-300" size={36} />
            <p className="text-sm font-medium text-slate-600">No free rooms found for this window.</p>
            <p className="mt-1 text-xs text-slate-400">Try widening the time range or removing a filter.</p>
          </div>
        )
      )}
    </div>
  );
}
