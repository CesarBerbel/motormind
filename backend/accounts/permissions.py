from rest_framework.permissions import BasePermission, SAFE_METHODS

from .services import user_has_permission


class HasViewPermission(BasePermission):
    message = "Você não tem permissão para executar esta ação."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        required = self._required_permission(request, view)
        return user_has_permission(request.user, required)

    def _required_permission(self, request, view):
        mapping = getattr(view, "permission_code_map", {}) or {}
        action = getattr(view, "action", None)
        if action and action in mapping:
            return mapping[action]
        if request.method in SAFE_METHODS:
            return mapping.get("read") or getattr(view, "read_permission_code", None) or getattr(view, "permission_code", "authenticated")
        return mapping.get("write") or getattr(view, "write_permission_code", None) or getattr(view, "permission_code", "authenticated")
