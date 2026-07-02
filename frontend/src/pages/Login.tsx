import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { School, Lock, User as UserIcon, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/dashboard");
    } catch (err: any) {
      const message = err?.response?.data?.detail || "Invalid username or password. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/20">
            <School size={26} />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Smart Classroom Allocation</h1>
          <p className="mt-1 text-sm text-slate-500">Room Management System</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-8">
          <h2 className="mb-6 text-lg font-semibold text-slate-800">Sign in to your account</h2>

          {error && (
            <div className="mb-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-600">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="label">Username</label>
            <div className="relative">
              <UserIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-10"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="label">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showPassword ? "text" : "password"}
                className="input pr-12 pl-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <p className="mt-5 text-center text-sm text-slate-500">
            Don't have an account?{" "}
            <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700">
              Register
            </Link>
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Demo Super Admin — username: <span className="font-mono">iqac</span> · password: <span className="font-mono">Iqac@2024</span>
        </p>
      </div>
    </div>
  );
}
