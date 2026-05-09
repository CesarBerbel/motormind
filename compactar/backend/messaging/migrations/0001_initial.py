# Generated scaffold migration.
from django.conf import settings
from django.db import migrations, models
import django.core.validators
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ChannelConfiguration",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("email_enabled", models.BooleanField(default=True)),
                ("default_from_email", models.EmailField(blank=True, max_length=254)),
                ("whatsapp_enabled", models.BooleanField(default=False)),
                ("whatsapp_provider", models.CharField(choices=[("meta", "Meta Cloud API"), ("dummy", "Dummy / development")], default="meta", max_length=30)),
                ("whatsapp_access_token", models.TextField(blank=True)),
                ("whatsapp_phone_number_id", models.CharField(blank=True, max_length=100)),
                ("whatsapp_api_version", models.CharField(default="v24.0", max_length=20)),
                ("whatsapp_preview_url", models.BooleanField(default=False)),
            ],
            options={"verbose_name": "Channel configuration", "verbose_name_plural": "Channel configurations"},
        ),
        migrations.CreateModel(
            name="ContactGroup",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=120, unique=True)),
                ("description", models.TextField(blank=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="contact_groups", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="MessageTemplate",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=150)),
                ("slug", models.SlugField(blank=True, max_length=180, unique=True)),
                ("channel", models.CharField(choices=[("email", "Email"), ("whatsapp", "WhatsApp")], max_length=20)),
                ("description", models.TextField(blank=True)),
                ("email_subject", models.CharField(blank=True, max_length=255)),
                ("email_html_body", models.TextField(blank=True)),
                ("email_text_body", models.TextField(blank=True, help_text="Opcional. Se vazio, sera gerado a partir do HTML renderizado.")),
                ("whatsapp_body", models.TextField(blank=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="message_templates", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["channel", "name"]},
        ),
        migrations.CreateModel(
            name="Contact",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("first_name", models.CharField(max_length=120)),
                ("last_name", models.CharField(blank=True, max_length=120)),
                ("email", models.EmailField(blank=True, max_length=254)),
                ("phone_e164", models.CharField(blank=True, max_length=20, validators=[django.core.validators.RegexValidator(message="Use formato E.164. Exemplo: +351912345678", regex="^\\+[1-9]\\d{7,14}$")])),
                ("custom_data", models.JSONField(blank=True, default=dict)),
                ("is_active", models.BooleanField(default=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="contacts", to=settings.AUTH_USER_MODEL)),
                ("groups", models.ManyToManyField(blank=True, related_name="contacts", to="messaging.contactgroup")),
            ],
            options={"ordering": ["first_name", "last_name", "email"]},
        ),
        migrations.CreateModel(
            name="Automation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=150)),
                ("channel", models.CharField(choices=[("email", "Email"), ("whatsapp", "WhatsApp")], max_length=20)),
                ("target_type", models.CharField(choices=[("contact", "Contato especifico"), ("group", "Grupo de contatos"), ("all_contacts", "Todos os contatos ativos"), ("user", "Usuario especifico"), ("all_users", "Todos os usuarios ativos")], max_length=30)),
                ("schedule_type", models.CharField(choices=[("once", "Uma vez"), ("interval", "Intervalo em minutos"), ("daily", "Diariamente"), ("weekly", "Semanalmente"), ("monthly", "Mensalmente")], default="once", max_length=20)),
                ("run_at", models.DateTimeField(help_text="Data/hora inicial ou unica da automacao.")),
                ("interval_minutes", models.PositiveIntegerField(blank=True, null=True)),
                ("next_run_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("last_run_at", models.DateTimeField(blank=True, null=True)),
                ("last_error", models.TextField(blank=True)),
                ("is_active", models.BooleanField(default=True)),
                ("contact", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="automations", to="messaging.contact")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="automations", to=settings.AUTH_USER_MODEL)),
                ("group", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="automations", to="messaging.contactgroup")),
                ("recipient_user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="recipient_automations", to=settings.AUTH_USER_MODEL)),
                ("template", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="automations", to="messaging.messagetemplate")),
            ],
            options={"ordering": ["-is_active", "next_run_at", "name"]},
        ),
        migrations.CreateModel(
            name="MessageLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("channel", models.CharField(choices=[("email", "Email"), ("whatsapp", "WhatsApp")], max_length=20)),
                ("recipient_name", models.CharField(blank=True, max_length=180)),
                ("to_email", models.EmailField(blank=True, max_length=254)),
                ("to_phone", models.CharField(blank=True, max_length=20)),
                ("rendered_subject", models.CharField(blank=True, max_length=255)),
                ("rendered_html", models.TextField(blank=True)),
                ("rendered_text", models.TextField(blank=True)),
                ("status", models.CharField(choices=[("pending", "Pendente"), ("sending", "Enviando"), ("sent", "Enviado"), ("failed", "Falhou"), ("skipped", "Ignorado")], db_index=True, default="pending", max_length=20)),
                ("provider_message_id", models.CharField(blank=True, max_length=255)),
                ("provider_response", models.JSONField(blank=True, default=dict)),
                ("error_message", models.TextField(blank=True)),
                ("sent_at", models.DateTimeField(blank=True, null=True)),
                ("actor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="sent_message_logs", to=settings.AUTH_USER_MODEL)),
                ("automation", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="logs", to="messaging.automation")),
                ("contact", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="message_logs", to="messaging.contact")),
                ("recipient_user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="message_logs", to=settings.AUTH_USER_MODEL)),
                ("template", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="logs", to="messaging.messagetemplate")),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
