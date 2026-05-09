from .models import AuditLog


class AuditTrailMiddleware:
    """Registra ações HTTP mutáveis como trilha mínima de auditoria operacional."""

    MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.method not in self.MUTATING_METHODS:
            return response
        if request.path.startswith("/static/") or request.path.startswith("/media/"):
            return response
        if response.status_code >= 400:
            return response
        try:
            AuditLog.objects.create(
                action=AuditLog.Action.SYSTEM,
                user=request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
                description=f"{request.method} {request.path}",
                metadata={
                    "method": request.method,
                    "path": request.path,
                    "query_string": request.META.get("QUERY_STRING", ""),
                    "status_code": response.status_code,
                },
                ip_address=self._client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
            )
        except Exception:
            # Auditoria não pode derrubar a operação principal.
            pass
        return response

    def _client_ip(self, request):
        forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR")
