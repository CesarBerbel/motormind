export function permissionCodes(user) {
  return Array.isArray(user?.permission_codes) ? user.permission_codes : [];
}

export function hasPermission(user, permission) {
  if (!user || !user.is_active) return false;
  if (!permission || permission === "authenticated") return true;
  const codes = permissionCodes(user);
  if (codes.includes("*")) return true;
  if (Array.isArray(permission)) return permission.some((item) => hasPermission(user, item));
  return codes.includes(permission);
}

export function defaultDashboardPath(user) {
  return user?.dashboard_path || "/login";
}
