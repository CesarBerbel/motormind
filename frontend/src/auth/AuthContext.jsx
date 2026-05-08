import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import api, { clearAuthTokens, getAccessToken, getRefreshToken, setAuthTokens } from "../api/client";
import { defaultDashboardPath, hasPermission } from "./permissions";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [workshopProfile, setWorkshopProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadWorkshopProfile() {
    try {
      const { data } = await api.get("/workshop/company-profile/");
      setWorkshopProfile(data);
      return data;
    } catch {
      setWorkshopProfile(null);
      return null;
    }
  }

  async function loadUser() {
    const token = getAccessToken();
    const refresh = getRefreshToken();
    if (!token && !refresh) {
      setLoading(false);
      return;
    }
    try {
      const [me] = await Promise.all([api.get("/me/"), loadWorkshopProfile()]);
      setUser(me.data);
    } catch {
      clearAuthTokens("Não foi possível validar sua sessão. Entre novamente.", { notify: false });
      setUser(null);
      setWorkshopProfile(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUser();

    function handleSessionEnded() {
      setUser(null);
      setWorkshopProfile(null);
      setLoading(false);
    }

    window.addEventListener("auth:session-ended", handleSessionEnded);
    return () => window.removeEventListener("auth:session-ended", handleSessionEnded);
  }, []);

  async function login(username, password) {
    clearAuthTokens("Preparando novo login.", { notify: false });
    setUser(null);
    setWorkshopProfile(null);

    const { data } = await api.post("/token/", { username, password });
    setAuthTokens({ access: data.access, refresh: data.refresh });

    try {
      const [me] = await Promise.all([api.get("/me/"), loadWorkshopProfile()]);
      setUser(me.data);
      return me.data;
    } catch {
      clearAuthTokens("Não foi possível carregar o usuário autenticado.", { notify: false });
      setUser(null);
      setWorkshopProfile(null);
      throw new Error("Login realizado, mas não foi possível carregar os dados do usuário. Verifique se o backend está rodando e tente novamente.");
    }
  }

  function logout() {
    clearAuthTokens("Sessão encerrada pelo usuário.");
    setUser(null);
    setWorkshopProfile(null);
  }

  const value = useMemo(
    () => ({
      user,
      workshopProfile,
      loading,
      login,
      logout,
      refreshWorkshopProfile: loadWorkshopProfile,
      hasPermission: (permission) => hasPermission(user, permission),
      defaultDashboardPath: () => defaultDashboardPath(user),
    }),
    [user, workshopProfile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
