from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import AuditLog

User = get_user_model()


class AuditUserSummarySerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "full_name"]


class AuditLogSerializer(serializers.ModelSerializer):
    action_label = serializers.CharField(read_only=True)
    user = AuditUserSummarySerializer(read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "action",
            "action_label",
            "app_label",
            "model_name",
            "object_id",
            "object_repr",
            "user",
            "description",
            "before",
            "after",
            "metadata",
            "ip_address",
            "user_agent",
            "created_at",
        ]
        read_only_fields = fields
