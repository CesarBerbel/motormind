# Generated manually to add the technical waiting-parts state to work orders.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workshop", "0017_servicepackage_discount_amount"),
    ]

    operations = [
        migrations.AlterField(
            model_name="workorder",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "Rascunho"),
                    ("open", "Aberta"),
                    ("diagnosis", "Diagnostico"),
                    ("awaiting_approval", "Aguardando aprovacao"),
                    ("waiting_parts", "Aguardando peca"),
                    ("approved", "Aprovada"),
                    ("in_progress", "Em execucao"),
                    ("quality_check", "Conferencia"),
                    ("ready", "Pronta para entrega"),
                    ("delivered", "Entregue"),
                    ("cancelled", "Cancelada"),
                ],
                db_index=True,
                default="open",
                max_length=30,
            ),
        ),
    ]
