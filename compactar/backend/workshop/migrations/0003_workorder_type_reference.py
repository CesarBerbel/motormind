import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("workshop", "0002_generalcategory"),
    ]

    operations = [
        migrations.AddField(
            model_name="workorder",
            name="order_type",
            field=models.CharField(choices=[("standard", "Normal"), ("return", "Retorno"), ("warranty", "Garantia")], db_index=True, default="standard", max_length=20),
        ),
        migrations.AddField(
            model_name="workorder",
            name="reference_work_order",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="referenced_by_work_orders", to="workshop.workorder"),
        ),
    ]
