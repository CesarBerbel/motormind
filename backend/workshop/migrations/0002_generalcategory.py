# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workshop", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="GeneralCategory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("type", models.CharField(choices=[("general", "Geral"), ("service", "Serviço"), ("part", "Peça / estoque"), ("vehicle", "Veículo"), ("work_order", "Ordem de serviço")], db_index=True, default="general", max_length=40)),
                ("name", models.CharField(max_length=120)),
                ("code", models.CharField(blank=True, max_length=40)),
                ("description", models.TextField(blank=True)),
                ("is_active", models.BooleanField(default=True)),
            ],
            options={
                "ordering": ["type", "name"],
            },
        ),
        migrations.AddConstraint(
            model_name="generalcategory",
            constraint=models.UniqueConstraint(fields=("type", "name"), name="general_category_type_name_uniq"),
        ),
        migrations.AddConstraint(
            model_name="generalcategory",
            constraint=models.UniqueConstraint(condition=~models.Q(code=""), fields=("type", "code"), name="general_category_type_code_uniq"),
        ),
    ]
