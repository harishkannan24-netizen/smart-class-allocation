import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import api, { tokenStore } from "../api/client";
import type { Role, User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = async () => {
    try {
      const { data } = await api.get<User>("/auth/me/");
      setUser(data);
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    (async () => {
      if (tokenStore.getAccess()) {
        await refreshMe();
      }
      setLoading(false);
    })();
  }, []);

  const login = async (username: string, password: string) => {
    const { data } = await api.post("/auth/login/", { username, password });
    tokenStore.setTokens(data.access, data.refresh);
    setUser(data.user);
  };

  const logout = () => {
    tokenStore.clear();
    setUser(null);
  };

  const hasRole = (...roles: Role[]) => !!user && roles.includes(user.role);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
