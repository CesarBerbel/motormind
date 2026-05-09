from .models import AuditLog


def get_client_ip(request):
    if not request:
        return None
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def audit_log(*, action, instance=None, user=None, request=None, description="", before=None, after=None, metadata=None):
    app_label = ""
    model_name = ""
    object_id = ""
    object_repr = ""
    if instance is not None:
        meta = instance._meta
        app_label = meta.app_label
        model_name = meta.model_name
        object_id = str(getattr(instance, "pk", "") or "")
        object_repr = str(instance)[:255]
    actor = user
    if request is not None and getattr(request, "user", None) and request.user.is_authenticated:
        actor = request.user
    return AuditLog.objects.create(
        action=action,
        app_label=app_label,
        model_name=model_name,
        object_id=object_id,
        object_repr=object_repr,
        user=actor if getattr(actor, "is_authenticated", False) else None,
        description=description[:255],
        before=before or {},
        after=after or {},
        metadata=metadata or {},
        ip_address=get_client_ip(request),
        user_agent=(request.META.get("HTTP_USER_AGENT", "") if request else ""),
    )
