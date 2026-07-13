import axios, { AxiosError } from "axios";
import type { InternalAxiosRequestConfig } from "axios";
import qs from "qs";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";

const ACCESS_KEY = "scarms_access";
const REFRESH_KEY = "scarms_refresh";

export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  setTokens: (access: string, refresh?: string) => {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.getAccess();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let queue: Array<() => void> = [];

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry && tokenStore.getRefresh()) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          queue.push(() => resolve(api(originalRequest)));
        });
      }
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh/`, {
          refresh: tokenStore.getRefresh(),
        });
        tokenStore.setTokens(data.access);
        queue.forEach((cb) => cb());
        queue = [];
        return api(originalRequest);
      } catch (refreshError) {
        tokenStore.clear();
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default api;

export const fetchAll = async (endpoint: string, params: Record<string, any> = {}): Promise<any[]> => {
  const pageSize = params.page_size ?? 1000;
  let page = 1;
  let all: any[] = [];
  while (true) {
    const p = { ...params, page, page_size: pageSize };
    const query = qs.stringify(p, { arrayFormat: "brackets" });
    const url = endpoint.includes("?") ? `${endpoint}&${query}` : `${endpoint}?${query}`;
    const res = await api.get(url);
    const data = res.data;
    const chunk = Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []);
    all.push(...chunk);
    if (!data.next || chunk.length === 0) break;
    page += 1;
  }
  return all;
}
