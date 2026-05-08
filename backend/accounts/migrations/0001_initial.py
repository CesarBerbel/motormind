# Generated manually for user role/group profiles.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="UserProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("role", models.CharField(choices=[("owner", "Dono"), ("administrative", "Administrativo"), ("attendant", "Atendente"), ("stock", "Estoque"), ("technician", "Técnico"), ("finance", "Financeiro")], db_index=True, default="attendant", max_length=30)),
                ("technician_specialty", models.CharField(blank=True, choices=[("mechanic", "Mecânico"), ("bodywork", "Funileiro"), ("electrician", "Eletricista")], max_length=30)),
                ("notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="profile", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "verbose_name": "Perfil de usuário",
                "verbose_name_plural": "Perfis de usuários",
                "ordering": ["user__username"],
            },
        ),
    ]
