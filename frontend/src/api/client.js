import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";
const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

const api = axios.create({
  baseURL: API_BASE_URL,
});

export function apiUrl(path = "") {
  const base = API_BASE_URL.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

const publicEndpoints = ["/token/", "/token/refresh/", "/password-setup/confirm/", "/workshop/customer-approvals/"];
let refreshPromise = null;

const NUMERIC_ZERO_FIELDS = new Set([
  "amount",
  "discount_amount",
  "manual_discount_amount",
  "payment_amount",
  "unit_price",
  "unit_cost",
  "cost_price",
  "sale_price",
  "stock_quantity",
  "minimum_stock",
  "estimated_hours",
  "mileage_in",
  "odometer_km",
  "paid_amount",
  "received_quantity",
  "position",
]);

function normalizeNumericEmptyValues(value, key = "") {
  if (Array.isArray(value)) return value.map((item) => normalizeNumericEmptyValues(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, normalizeNumericEmptyValues(childValue, childKey)]));
  }
  if (value === "" && NUMERIC_ZERO_FIELDS.has(key)) return "0.00";
  return value;
}

function normalizeUrl(url = "") {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      return parsed.pathname.replace(/^\/api/, "") || "/";
    } catch {
      return url;
    }
  }
  return url.startsWith("/") ? url : `/${url}`;
}

function isPublicEndpoint(url = "") {
  const normalized = normalizeUrl(url);
  return publicEndpoints.some((endpoint) => normalized === endpoint || normalized.startsWith(endpoint));
}

function isLoginEndpoint(url = "") {
  return normalizeUrl(url) === "/token/";
}

function isRefreshEndpoint(url = "") {
  return normalizeUrl(url) === "/token/refresh/";
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setAuthTokens({ access, refresh }) {
  if (access) localStorage.setItem(ACCESS_TOKEN_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
}

export function clearAuthTokens(reason = "Sessão encerrada.", { notify = true } = {}) {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  if (notify) {
    window.dispatchEvent(new CustomEvent("auth:session-ended", { detail: { reason } }));
  }
}

async function refreshAccessToken() {
  const refresh = getRefreshToken();
  if (!refresh) {
    throw new Error("Sessão expirada. Entre novamente.");
  }

  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE_URL.replace(/\/$/, "")}/token/refresh/`, { refresh })
      .then((response) => {
        const access = response.data?.access;
        if (!access) throw new Error("Resposta de renovação de sessão inválida.");
        setAuthTokens({ access });
        return access;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

api.interceptors.request.use((config) => {
  config.headers = config.headers || {};

  const token = getAccessToken();
  if (token && !isPublicEndpoint(config.url)) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (config.data && typeof config.data === "object" && !(config.data instanceof FormData)) {
    config.data = normalizeNumericEmptyValues(config.data);
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const status = error.response?.status;
    const requestUrl = originalRequest.url || "";

    if (status !== 401 || originalRequest._retry || isPublicEndpoint(requestUrl)) {
      return Promise.reject(error);
    }

    try {
      originalRequest._retry = true;
      const access = await refreshAccessToken();
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${access}`;
      return api(originalRequest);
    } catch (refreshError) {
      clearAuthTokens("Sua sessão expirou. Entre novamente para continuar.");
      return Promise.reject(refreshError.response ? refreshError : error);
    }
  }
);

export function results(data) {
  return Array.isArray(data) ? data : data?.results || [];
}

function flattenApiFields(fields, prefix = "") {
  if (!fields || typeof fields !== "object") return [];
  return Object.entries(fields).flatMap(([key, value]) => {
    const fieldName = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) return [`${fieldName}: ${value.join(", ")}`];
    if (value && typeof value === "object") return flattenApiFields(value, fieldName);
    return [`${fieldName}: ${value}`];
  });
}

export function apiError(error) {
  const status = error.response?.status;
  const data = error.response?.data;
  const requestUrl = error.config?.url || "";

  if (status === 401 && isLoginEndpoint(requestUrl)) {
    return data?.detail || "Usuário ou senha inválidos. Verifique os dados informados e tente novamente.";
  }

  if (status === 401 && isRefreshEndpoint(requestUrl)) {
    return "Sua sessão expirou. Entre novamente para continuar.";
  }

  if (status === 401) {
    return "Sua sessão expirou ou o login não foi identificado. Entre novamente para continuar.";
  }

  if (status === 403) {
    return data?.detail || "Você não tem permissão para executar esta ação.";
  }

  if (status === 404) {
    return data?.detail || "Registro ou endereço da API não encontrado.";
  }

  if (status >= 500) {
    return data?.detail || data?.message || "Erro interno no servidor. Verifique os logs do backend.";
  }

  if (error.code === "ECONNABORTED") return "A requisição demorou demais para responder.";
  if (!error.response) return "Não foi possível conectar ao backend. Verifique se o servidor está rodando.";

  if (!data) return error.message || "Erro inesperado";
  if (typeof data === "string") return data;

  if (data.message || data.fields) {
    const fieldMessages = flattenApiFields(data.fields);
    return [data.message, ...fieldMessages].filter(Boolean).join(" | ");
  }

  if (data.detail) return data.detail;

  return Object.entries(data)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : JSON.stringify(value)}`)
    .join(" | ");
}

export function isAuthPublicEndpoint(url = "") {
  return isPublicEndpoint(url);
}

export default api;
