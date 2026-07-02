import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { School } from "lucide-react";
import api from "../api/client";

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: "", email: "", first_name: "", last_name: "",
    password: "", password2: "", role: "STUDENT",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/register/", form);
      navigate("/login");
    } catch (err: any) {
      const data = err?.response?.data;
      const message = data ? Object.values(data).flat().join(" ") : "Registration failed. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/20">
            <School size={26} />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Create your account</h1>
          <p className="mt-1 text-sm text-slate-500">Register as Faculty or Student</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-8">
          {error && (
            <div className="mb-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-600">{error}</div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">First name</label>
              <input className="input" value={form.first_name} onChange={(e) => update("first_name", e.target.value)} required />
            </div>
            <div>
              <label className="label">Last name</label>
              <input className="input" value={form.last_name} onChange={(e) => update("last_name", e.target.value)} />
            </div>
          </div>

          <div className="mb-4">
            <label className="label">Username</label>
            <input className="input" value={form.username} onChange={(e) => update("username", e.target.value)} required />
          </div>

          <div className="mb-4">
            <label className="label">Email</label>
            <input type="email" className="input" value={form.email} onChange={(e) => update("email", e.target.value)} required />
          </div>

          <div className="mb-4">
            <label className="label">I am a</label>
            <select className="input" value={form.role} onChange={(e) => update("role", e.target.value)}>
              <option value="STUDENT">Student</option>
              <option value="FACULTY">Faculty</option>
            </select>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Password</label>
              <input type="password" className="input" value={form.password} onChange={(e) => update("password", e.target.value)} required />
            </div>
            <div>
              <label className="label">Confirm password</label>
              <input type="password" className="input" value={form.password2} onChange={(e) => update("password2", e.target.value)} required />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Creating account..." : "Create account"}
          </button>

          <p className="mt-5 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
