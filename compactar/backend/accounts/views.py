from django.db.models import Q
from django.utils import dateparse, timezone
from rest_framework import viewsets

from .models import AuditLog
from .permissions import HasViewPermission
from .serializers import AuditLogSerializer


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [HasViewPermission]
    permission_code = "settings.manage"
    queryset = AuditLog.objects.select_related("user").all()
    ordering_fields = ["created_at", "action", "app_label", "model_name", "user__username"]
    search_fields = ["description", "object_repr", "object_id", "app_label", "model_name", "user__username", "user__email"]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        search = params.get("search")
        action = params.get("action")
        app_label = params.get("app_label")
        model_name = params.get("model_name")
        user_id = params.get("user")
        date_from = params.get("date_from")
        date_to = params.get("date_to")

        if search:
            qs = qs.filter(
                Q(description__icontains=search)
                | Q(object_repr__icontains=search)
                | Q(object_id__icontains=search)
                | Q(app_label__icontains=search)
                | Q(model_name__icontains=search)
                | Q(user__username__icontains=search)
                | Q(user__email__icontains=search)
            )
        if action:
            qs = qs.filter(action=action)
        if app_label:
            qs = qs.filter(app_label=app_label)
        if model_name:
            qs = qs.filter(model_name=model_name)
        if user_id:
            qs = qs.filter(user_id=user_id)
        if date_from:
            parsed = dateparse.parse_date(date_from)
            if parsed:
                qs = qs.filter(created_at__date__gte=parsed)
        if date_to:
            parsed = dateparse.parse_date(date_to)
            if parsed:
                qs = qs.filter(created_at__date__lte=parsed)
        return qs
