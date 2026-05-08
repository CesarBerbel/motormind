from decimal import Decimal

from django.db import migrations
from django.utils import timezone

ZERO = Decimal("0.00")


def next_number(AccountReceivable, sequence):
    year = timezone.localdate().year
    return f"CR-{year}-{sequence:05d}"


def backfill_delivered_receivables(apps, schema_editor):
    WorkOrder = apps.get_model("workshop", "WorkOrder")
    AccountReceivable = apps.get_model("finance", "AccountReceivable")
    year = timezone.localdate().year
    prefix = f"CR-{year}-"
    existing_numbers = list(AccountReceivable.objects.filter(number__startswith=prefix).values_list("number", flat=True))
    sequence = 1
    if existing_numbers:
        parsed = []
        for number in existing_numbers:
            try:
                parsed.append(int(number.replace(prefix, "")))
            except ValueError:
                pass
        sequence = (max(parsed) + 1) if parsed else (len(existing_numbers) + 1)
    delivered_orders = WorkOrder.objects.filter(status="delivered", account_receivable__isnull=True).select_related("customer")
    today = timezone.localdate()
    for work_order in delivered_orders:
        amount = work_order.grand_total or ZERO
        paid = work_order.paid_total or ZERO
        balance = amount - paid
        if balance < ZERO:
            balance = ZERO
        if balance <= ZERO:
            status = "paid"
        elif paid > ZERO:
            status = "partial"
        else:
            status = "open"
        due_date = today
        if work_order.delivered_at:
            due_date = work_order.delivered_at.date()
        elif work_order.promised_at:
            due_date = work_order.promised_at.date()
        AccountReceivable.objects.create(
            number=next_number(AccountReceivable, sequence),
            origin="work_order",
            work_order=work_order,
            customer=work_order.customer,
            description=f"Conta a receber da {work_order.number}",
            issue_date=today,
            due_date=due_date,
            amount=amount,
            discount_amount=work_order.discount_total or ZERO,
            paid_amount=paid,
            balance_amount=balance,
            status=status,
        )
        sequence += 1


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("finance", "0001_initial"),
        ("workshop", "0005_category_dropdowns_for_parts_and_services"),
    ]

    operations = [
        migrations.RunPython(backfill_delivered_receivables, noop_reverse),
    ]
