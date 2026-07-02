import type { Role, RoomStatus } from "../types";

const roleStyles: Record<Role, string> = {
  SUPER_ADMIN: "bg-brand-100 text-brand-700",
  DEPT_ADMIN: "bg-violet-100 text-violet-700",
  FACULTY: "bg-amber-100 text-amber-700",
  STUDENT: "bg-slate-100 text-slate-700",
};

const roleLabels: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  DEPT_ADMIN: "Department Admin",
  FACULTY: "Faculty",
  STUDENT: "Student",
};

export function RoleBadge({ role }: { role: Role }) {
  return <span className={`badge ${roleStyles[role]}`}>{roleLabels[role]}</span>;
}

const statusStyles: Record<RoomStatus, string> = {
  FREE: "bg-emerald-100 text-emerald-700",
  ALLOCATED: "bg-blue-100 text-blue-700",
  OCCUPIED: "bg-rose-100 text-rose-700",
  RESERVED: "bg-amber-100 text-amber-700",
  MAINTENANCE: "bg-slate-200 text-slate-600",
};

const statusDot: Record<RoomStatus, string> = {
  FREE: "bg-emerald-500",
  ALLOCATED: "bg-blue-500",
  OCCUPIED: "bg-rose-500",
  RESERVED: "bg-amber-500",
  MAINTENANCE: "bg-slate-500",
};

export function StatusBadge({ status }: { status: RoomStatus }) {
  return (
    <span className={`badge ${statusStyles[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${statusDot[status]}`} />
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
