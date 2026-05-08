# Generated manually for the technical workshop execution workflow.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("workshop", "0005_category_dropdowns_for_parts_and_services"),
    ]

    operations = [
        migrations.AddField(
            model_name="workorderservice",
            name="technical_diagnosis",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="workorderservice",
            name="execution_notes",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="workorderservice",
            name="checklist",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="workorderservice",
            name="started_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="workorderservice",
            name="finished_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="workorderservice",
            name="expected_minutes",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="workorderservice",
            name="actual_minutes",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="workorderservice",
            name="needs_quality_check",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="workorderservice",
            name="quality_checked_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="workorderservice",
            name="quality_check_notes",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="workorderservice",
            name="quality_checked_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="quality_checked_service_lines", to=settings.AUTH_USER_MODEL),
        ),
    ]
