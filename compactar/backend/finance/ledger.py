from decimal import Decimal

from django.utils import timezone

from .models import FinancialLedgerEntry


def record_ledger_entry(*, entry_type, origin, origin_instance=None, description, amount, occurred_at=None, competence_date=None, payment_method="", reference="", notes="", actor=None):
    amount = Decimal(str(amount))
    if amount <= Decimal("0.00"):
        return None
    origin_model = ""
    origin_id = ""
    if origin_instance is not None:
        origin_model = origin_instance._meta.label_lower
        origin_id = str(origin_instance.pk or "")
    return FinancialLedgerEntry.objects.create(
        entry_type=entry_type,
        origin=origin,
        origin_model=origin_model,
        origin_id=origin_id,
        description=description[:255],
        amount=amount,
        competence_date=competence_date or timezone.localdate(),
        occurred_at=occurred_at or timezone.now(),
        payment_method=payment_method or "",
        reference=reference or "",
        notes=notes or "",
        created_by=actor if getattr(actor, "is_authenticated", False) else None,
    )
