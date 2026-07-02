import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Users2 } from "lucide-react";
import api from "../api/client";
import { RoleBadge } from "../components/Badges";
import type { Department, Role, User } from "../types";

const ROLES: Role[] = ["SUPER_ADMIN", "DEPT_ADMIN", "FACULTY", "STUDENT"];

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    username: "", email: "", first_name: "", last_name: "",
    password: "", password2: "", role: "FACULTY", department: "",
  });

  const load = () => {
    api.get("/users/").then((r) => setUsers(r.data.results ?? r.data));
    api.get("/campus/departments/").then((r) => setDepartments(r.data.results ?? r.data));
  };

  useEffect(load, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post("/auth/register/", {
        ...form,
        department: form.department ? Number(form.department) : null,
      });
      setShowForm(false);
      load();
    } catch (err: any) {
      const data = err?.response?.data;
      setError(data ? Object.values(data).flat().join(" ") : "Could not create user.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: User) => {
    await api.patch(`/users/${u.id}/`, { is_active: !u.is_active });
    load();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">User Management</h1>
          <p className="mt-1 text-sm text-slate-500">Create and manage Super Admin, Department Admin, Faculty, and Student accounts.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          <Plus size={16} /> Add User
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6 grid grid-cols-1 gap-4 p-6 sm:grid-cols-3">
          {error && <div className="sm:col-span-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-600">{error}</div>}
          <div>
            <label className="label">First Name</label>
            <input className="input" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          </div>
          <div>
            <label className="label">Last Name</label>
            <input className="input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          </div>
          <div>
            <label className="label">Username</label>
            <input className="input" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Department</label>
            <select className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
              <option value="">None</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" className="input" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className="label">Confirm Password</label>
            <input type="password" className="input" required value={form.password2} onChange={(e) => setForm({ ...form, password2: e.target.value })} />
          </div>
          <div className="sm:col-span-3">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        {users.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Users2 className="mb-3 text-slate-300" size={36} />
            <p className="text-sm text-slate-500">No users found.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Username</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Department</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800">{u.first_name} {u.last_name}</td>
                  <td className="px-5 py-3 text-slate-500">{u.username}</td>
                  <td className="px-5 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-5 py-3 text-slate-500">{u.department_name || "—"}</td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => toggleActive(u)}
                      className={`badge cursor-pointer ${u.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}
                    >
                      {u.is_active ? "Active" : "Disabled"}
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
