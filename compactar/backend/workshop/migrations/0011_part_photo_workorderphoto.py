# Generated manually for part photos and work order evidence photos.

from django.conf import settings
from django.db import migrations, models
import django.core.validators
import django.db.models.deletion
import django.utils.timezone
import workshop.models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("workshop", "0010_workshopprofile"),
    ]

    operations = [
        migrations.AlterField(
            model_name="workshopprofile",
            name="logo",
            field=models.FileField(blank=True, upload_to=workshop.models.workshop_logo_upload_path, validators=[django.core.validators.FileExtensionValidator(allowed_extensions=["jpg", "jpeg", "png", "webp", "svg"])], verbose_name="Logomarca"),
        ),
        migrations.AddField(
            model_name="part",
            name="photo",
            field=models.FileField(blank=True, upload_to=workshop.models.part_photo_upload_path, validators=[django.core.validators.FileExtensionValidator(allowed_extensions=["jpg", "jpeg", "png", "webp"])], verbose_name="Foto da peça"),
        ),
        migrations.CreateModel(
            name="WorkOrderPhoto",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("image", models.FileField(upload_to=workshop.models.work_order_photo_upload_path, validators=[django.core.validators.FileExtensionValidator(allowed_extensions=["jpg", "jpeg", "png", "webp"])], verbose_name="Foto da OS")),
                ("photo_type", models.CharField(choices=[("opening", "Abertura / estado de entrada"), ("damage", "Avaria pré-existente"), ("odometer", "Hodômetro"), ("document", "Documento / etiqueta"), ("delivery", "Entrega"), ("other", "Outro")], db_index=True, default="opening", max_length=30)),
                ("caption", models.CharField(blank=True, max_length=220)),
                ("taken_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("original_filename", models.CharField(blank=True, max_length=180)),
                ("content_type", models.CharField(blank=True, max_length=80)),
                ("file_size", models.PositiveIntegerField(default=0)),
                ("sha256", models.CharField(blank=True, db_index=True, max_length=64)),
                ("is_customer_visible", models.BooleanField(default=True)),
                ("uploaded_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="uploaded_work_order_photos", to=settings.AUTH_USER_MODEL)),
                ("work_order", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="photos", to="workshop.workorder")),
            ],
            options={
                "verbose_name": "foto de OS",
                "verbose_name_plural": "fotos de OS",
                "ordering": ["-taken_at", "-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="workorderphoto",
            index=models.Index(fields=["work_order", "photo_type"], name="wo_photo_type_idx"),
        ),
    ]
