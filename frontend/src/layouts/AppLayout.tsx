import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Building2, Layers, DoorOpen, GraduationCap,
  Users2, CalendarClock, Search, ArrowLeftRight, LogOut, School, FileUp,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { RoleBadge } from "../components/Badges";
import type { Role } from "../types";

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  roles?: Role[];
}

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/campus", label: "Campus Structure", icon: Building2, roles: ["SUPER_ADMIN"] },
  { to: "/departments", label: "Departments", icon: Layers, roles: ["SUPER_ADMIN"] },
  { to: "/rooms", label: "Rooms", icon: DoorOpen, roles: ["SUPER_ADMIN", "DEPT_ADMIN"] },
  { to: "/sections", label: "Sections", icon: GraduationCap, roles: ["SUPER_ADMIN", "DEPT_ADMIN"] },
  { to: "/import-data", label: "Import Data", icon: FileUp, roles: ["SUPER_ADMIN", "DEPT_ADMIN"] },
  { to: "/timetable", label: "Timetable", icon: CalendarClock },
  { to: "/free-rooms", label: "Find Free Room", icon: Search },
  { to: "/allocations", label: "Temporary Allocation", icon: ArrowLeftRight },
  { to: "/users", label: "Users", icon: Users2, roles: ["SUPER_ADMIN"] },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const visibleItems = navItems.filter((item) => !item.roles || item.roles.includes(user.role));

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-100">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
            <School size={20} />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-slate-800">Smart Classroom</p>
            <p className="text-xs text-slate-400 leading-tight">Allocation System</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3.5">
          <div />
          <div className="flex items-center gap-3">
            <RoleBadge role={user.role} />
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-800 leading-tight">
                {user.first_name || user.username}
              </p>
              <p className="text-xs text-slate-400 leading-tight">{user.email}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
              {(user.first_name?.[0] || user.username[0]).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
