import { useEffect, useState } from "react";
import {
  Building2, DoorOpen, CheckCircle2, XCircle, BookOpen,
  FlaskConical, ArrowLeftRight, Clock,
} from "lucide-react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { DashboardStats, TimetableEntry } from "../types";

interface CardDef {
  label: string;
  value: number;
  icon: React.ElementType;
  tint: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignedClasses, setAssignedClasses] = useState<TimetableEntry[]>([]);
  const [classLoading, setClassLoading] = useState(false);

  useEffect(() => {
    api.get<DashboardStats>("/campus/dashboard/")
      .then((res) => setStats(res.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user?.role !== "FACULTY") return;
    setClassLoading(true);
    api.get<{ results: TimetableEntry[] }>("/campus/timetable-entries/?page_size=100")
      .then((res) => {
        const facultyName = `${user.first_name} ${user.last_name}`.trim();
        const matches = res.data.results.filter((entry) =>
          entry.faculty_name?.toLowerCase().includes(facultyName.toLowerCase()) ||
          entry.faculty_name?.toLowerCase().includes(user.username.toLowerCase())
        );
        setAssignedClasses(matches.slice(0, 5));
      })
      .catch(() => setAssignedClasses([]))
      .finally(() => setClassLoading(false));
  }, [user]);

  const cards: CardDef[] = stats
    ? [
        { label: "Total Rooms", value: stats.total_rooms, icon: DoorOpen, tint: "bg-brand-50 text-brand-600" },
        { label: "Available Rooms", value: stats.available_rooms, icon: CheckCircle2, tint: "bg-emerald-50 text-emerald-600" },
        { label: "Occupied Rooms", value: stats.occupied_rooms, icon: XCircle, tint: "bg-rose-50 text-rose-600" },
        { label: "Total Blocks", value: stats.total_blocks, icon: Building2, tint: "bg-violet-50 text-violet-600" },
        { label: "Today's Classes", value: stats.todays_classes, icon: BookOpen, tint: "bg-amber-50 text-amber-600" },
        { label: "Today's Labs", value: stats.todays_labs, icon: FlaskConical, tint: "bg-cyan-50 text-cyan-600" },
        { label: "Temp. Allocations Today", value: stats.temporary_allocations_today, icon: ArrowLeftRight, tint: "bg-indigo-50 text-indigo-600" },
        { label: "Pending Requests", value: stats.pending_requests, icon: Clock, tint: "bg-orange-50 text-orange-600" },
      ]
    : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">
          Welcome back, {user?.first_name || user?.username} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Here's what's happening across your campus today.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card h-28 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">{card.label}</p>
                  <p className="mt-2 text-3xl font-bold text-slate-800">{card.value}</p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.tint}`}>
                  <card.icon size={20} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {user?.role === "FACULTY" ? (
        <div className="mt-6 rounded-3xl border border-brand-100 bg-brand-50 p-6">
          <h2 className="text-lg font-semibold text-brand-800">Faculty classes</h2>
          <p className="mt-2 text-sm text-slate-600">
            These are the next classes associated with you. If no classes appear, go to the Timetable page to review your full schedule.
          </p>
          {classLoading ? (
            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : assignedClasses.length > 0 ? (
            <div className="mt-4 space-y-3">
              {assignedClasses.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3 text-sm text-slate-700">
                    <span>{entry.day} {entry.start_time} - {entry.end_time}</span>
                    <span className="rounded-full bg-brand-100 px-2 py-1 text-xs font-semibold text-brand-700">{entry.activity_type}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{entry.subject || "Untitled class"}</p>
                  <p className="mt-1 text-sm text-slate-500">Room: {entry.room_number || "TBD"}</p>
                  <p className="mt-1 text-sm text-slate-500">Section: {entry.section_label || entry.section}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No assigned classes found for your account yet.</p>
          )}
        </div>
      ) : user?.role === "STUDENT" ? (
        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-800">Student classroom</h2>
          <p className="mt-2 text-sm text-slate-600">
            Your classroom assignments are available on the Timetable page. Open the timetable to see your room name and schedule.
          </p>
        </div>
      ) : (
        <div className="mt-6 card p-6">
          <h2 className="mb-2 text-base font-semibold text-slate-800">Quick tip</h2>
          <p className="text-sm text-slate-500">
            Use <span className="font-medium text-slate-700">Find Free Room</span> to instantly see which
            classrooms are empty right now — for example, a room becomes free automatically whenever its
            section is away at a lab, library, or workshop session.
          </p>
        </div>
      )}
    </div>
  );
}
