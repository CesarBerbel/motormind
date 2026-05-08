# Generated manually for audit trail foundation.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("accounts", "0003_userprofile_photo_3x4"),
    ]

    operations = [
        migrations.CreateModel(
            name="AuditLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("action", models.CharField(choices=[("create", "Criação"), ("update", "Alteração"), ("delete", "Exclusão"), ("status_change", "Alteração de status"), ("login", "Login"), ("logout", "Logout"), ("permission", "Permissão"), ("system", "Sistema")], db_index=True, max_length=30)),
                ("app_label", models.CharField(blank=True, db_index=True, max_length=80)),
                ("model_name", models.CharField(blank=True, db_index=True, max_length=80)),
                ("object_id", models.CharField(blank=True, db_index=True, max_length=80)),
                ("object_repr", models.CharField(blank=True, max_length=255)),
                ("description", models.CharField(blank=True, max_length=255)),
                ("before", models.JSONField(blank=True, default=dict)),
                ("after", models.JSONField(blank=True, default=dict)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="audit_logs", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "verbose_name": "registro de auditoria",
                "verbose_name_plural": "registros de auditoria",
                "ordering": ["-created_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="auditlog",
            index=models.Index(fields=["app_label", "model_name", "object_id"], name="audit_object_idx"),
        ),
        migrations.AddIndex(
            model_name="auditlog",
            index=models.Index(fields=["action", "created_at"], name="audit_action_created_idx"),
        ),
    ]
