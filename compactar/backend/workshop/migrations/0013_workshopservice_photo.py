# Generated manually for service thumbnails used by the OS selector.

import workshop.models
from django.core.validators import FileExtensionValidator
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workshop", "0012_alter_workorderevent_event_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="workshopservice",
            name="photo",
            field=models.FileField(
                blank=True,
                upload_to=workshop.models.service_photo_upload_path,
                validators=[FileExtensionValidator(allowed_extensions=["jpg", "jpeg", "png", "webp"])],
                verbose_name="Foto/thumbnail do serviço",
            ),
        ),
    ]
