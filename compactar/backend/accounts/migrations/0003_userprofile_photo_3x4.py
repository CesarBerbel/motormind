# Generated manually for employee 3x4 photos.

from django.db import migrations, models
import django.core.validators
import accounts.models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_employee_profile_complete_br"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="photo_3x4",
            field=models.FileField(blank=True, upload_to=accounts.models.employee_photo_upload_path, validators=[django.core.validators.FileExtensionValidator(allowed_extensions=["jpg", "jpeg", "png", "webp"])], verbose_name="Foto 3x4"),
        ),
    ]
