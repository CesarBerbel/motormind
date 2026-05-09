from django.db import migrations, models


def migrate_dummy_to_meta(apps, schema_editor):
    ChannelConfiguration = apps.get_model("messaging", "ChannelConfiguration")
    ChannelConfiguration.objects.filter(whatsapp_provider="dummy").update(whatsapp_provider="meta", whatsapp_enabled=False)


class Migration(migrations.Migration):
    dependencies = [("messaging", "0002_cliente_completo_ptbr")]

    operations = [
        migrations.RunPython(migrate_dummy_to_meta, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="channelconfiguration",
            name="whatsapp_provider",
            field=models.CharField(choices=[("meta", "Meta Cloud API")], default="meta", max_length=30),
        ),
    ]
