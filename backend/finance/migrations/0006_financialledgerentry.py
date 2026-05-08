# Generated manually for immutable financial ledger foundation.

import django.core.validators
import django.db.models.deletion
import django.utils.timezone
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("finance", "0005_accountreceivablepayment"),
    ]

    operations = [
        migrations.CreateModel(
            name="FinancialLedgerEntry",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("entry_type", models.CharField(choices=[("credit", "Entrada"), ("debit", "Saída"), ("reversal", "Estorno")], db_index=True, max_length=20)),
                ("origin", models.CharField(choices=[("work_order", "Ordem de serviço"), ("counter_sale", "Venda balcão"), ("purchase_order", "Pedido de compra"), ("receivable", "Conta a receber"), ("payable", "Conta a pagar"), ("manual", "Manual"), ("system", "Sistema")], db_index=True, default="manual", max_length=30)),
                ("origin_model", models.CharField(blank=True, db_index=True, max_length=80)),
                ("origin_id", models.CharField(blank=True, db_index=True, max_length=80)),
                ("description", models.CharField(max_length=255)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal("0.01"))])),
                ("competence_date", models.DateField(db_index=True, default=django.utils.timezone.localdate)),
                ("occurred_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("payment_method", models.CharField(blank=True, max_length=40)),
                ("reference", models.CharField(blank=True, max_length=120)),
                ("notes", models.TextField(blank=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_ledger_entries", to=settings.AUTH_USER_MODEL)),
                ("reversal_of", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="reversals", to="finance.financialledgerentry")),
            ],
            options={
                "verbose_name": "lançamento financeiro",
                "verbose_name_plural": "lançamentos financeiros",
                "ordering": ["-occurred_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="financialledgerentry",
            index=models.Index(fields=["entry_type", "occurred_at"], name="ledger_type_occurred_idx"),
        ),
        migrations.AddIndex(
            model_name="financialledgerentry",
            index=models.Index(fields=["origin", "origin_id"], name="ledger_origin_idx"),
        ),
        migrations.AddIndex(
            model_name="financialledgerentry",
            index=models.Index(fields=["competence_date"], name="ledger_competence_idx"),
        ),
    ]
