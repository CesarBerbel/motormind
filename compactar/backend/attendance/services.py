from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from finance.models import AccountReceivable
from workshop.models import PartStockMovement, WorkOrder, WorkOrderPart, WorkOrderService
from workshop.services import record_event
from workshop.models import WorkOrderEvent

from .models import CounterSale, CounterSalePayment, Estimate

ZERO = Decimal("0.00")


def _actor_or_none(actor):
    return actor if getattr(actor, "is_authenticated", False) else None


@transaction.atomic
def ensure_receivable_for_counter_sale(counter_sale, actor=None):
    sale = CounterSale.objects.select_for_update().select_related("customer").prefetch_related("payments", "items").get(pk=counter_sale.pk)
    if sale.status != CounterSale.Status.FINALIZED:
        raise ValidationError("A conta a receber só pode ser gerada para venda avulsa finalizada.")
    sale.recalculate_totals(save=True)
    receivable, created = AccountReceivable.objects.select_for_update().get_or_create(
        counter_sale=sale,
        defaults={
            "origin": AccountReceivable.Origin.COUNTER_SALE,
            "customer": sale.customer,
            "description": f"Conta a receber da venda avulsa {sale.number}",
            "issue_date": timezone.localdate(),
            "due_date": sale.due_date or timezone.localdate(),
            "amount": sale.total_amount or ZERO,
            "discount_amount": sale.discount_amount or ZERO,
            "paid_amount": sale.paid_amount or ZERO,
            "created_by": _actor_or_none(actor),
            "updated_by": _actor_or_none(actor),
        },
    )
    receivable.origin = AccountReceivable.Origin.COUNTER_SALE
    receivable.customer = sale.customer
    receivable.description = f"Conta a receber da venda avulsa {sale.number}"
    receivable.due_date = sale.due_date or timezone.localdate()
    receivable.updated_by = _actor_or_none(actor) or receivable.updated_by
    receivable.recalculate(save=True)
    return receivable, created


@transaction.atomic
def register_counter_sale_payment(counter_sale, amount, method, paid_at=None, reference="", notes="", actor=None):
    sale = CounterSale.objects.select_for_update().get(pk=counter_sale.pk)
    if sale.status == CounterSale.Status.CANCELLED:
        raise ValidationError("Venda cancelada não pode receber pagamento.")
    sale.recalculate_totals(save=True)
    amount = Decimal(str(amount))
    if amount <= ZERO:
        raise ValidationError("O valor recebido precisa ser maior que zero.")
    if amount > sale.balance_amount:
        raise ValidationError("O valor recebido não pode ser maior que o saldo da venda.")
    payment = CounterSalePayment.objects.create(
        counter_sale=sale,
        method=method,
        amount=amount,
        paid_at=paid_at or timezone.now(),
        reference=reference,
        notes=notes,
        created_by=_actor_or_none(actor),
    )
    sale.refresh_from_db()
    sale.recalculate_totals(save=True)
    if sale.status == CounterSale.Status.FINALIZED:
        ensure_receivable_for_counter_sale(sale, actor=actor)
    return payment, sale


@transaction.atomic
def finalize_counter_sale(counter_sale, actor=None, payment_amount=None, payment_method=None, payment_reference="", payment_notes=""):
    sale = CounterSale.objects.select_for_update().prefetch_related("items__part").get(pk=counter_sale.pk)
    if sale.status != CounterSale.Status.DRAFT:
        raise ValidationError("Somente venda em rascunho pode ser finalizada.")
    items = list(sale.items.select_related("part"))
    if not items:
        raise ValidationError("Inclua pelo menos uma peça na venda avulsa.")
    sale.recalculate_totals(save=True)
    if sale.total_amount <= ZERO:
        raise ValidationError("Venda avulsa precisa ter valor final maior que zero.")

    for item in items:
        if not item.part_id:
            continue
        part = item.part
        if part.stock_quantity < item.quantity:
            raise ValidationError(f"Estoque insuficiente para {part.name}. Disponível: {part.stock_quantity}; solicitado: {item.quantity}.")
        part.stock_quantity = (part.stock_quantity or ZERO) - (item.quantity or ZERO)
        part.save(update_fields=["stock_quantity", "updated_at"])
        movement = PartStockMovement.objects.create(
            part=part,
            movement_type=PartStockMovement.MovementType.CONSUMPTION,
            quantity=-(item.quantity or ZERO),
            unit_cost=item.cost_price or part.cost_price or ZERO,
            notes=f"Baixa por venda avulsa {sale.number}",
            actor=_actor_or_none(actor),
        )
        item.stock_movement = movement
        item.save(update_fields=["stock_movement", "updated_at"])

    sale.status = CounterSale.Status.FINALIZED
    sale.sold_at = timezone.now()
    sale.updated_by = _actor_or_none(actor) or sale.updated_by
    sale.save(update_fields=["status", "sold_at", "updated_by", "updated_at"])

    if payment_amount and Decimal(str(payment_amount)) > ZERO:
        register_counter_sale_payment(
            sale,
            amount=payment_amount,
            method=payment_method or CounterSalePayment.Method.CASH,
            reference=payment_reference,
            notes=payment_notes,
            actor=actor,
        )
    sale.refresh_from_db()
    sale.recalculate_totals(save=True)
    ensure_receivable_for_counter_sale(sale, actor=actor)
    return sale


@transaction.atomic
def cancel_counter_sale(counter_sale, actor=None, reason=""):
    sale = CounterSale.objects.select_for_update().prefetch_related("items__part", "items__stock_movement").get(pk=counter_sale.pk)
    if sale.status == CounterSale.Status.CANCELLED:
        return sale
    if sale.payments.exists():
        raise ValidationError("Venda com pagamento registrado não pode ser cancelada por segurança. Estorne o recebimento antes.")
    if sale.status == CounterSale.Status.FINALIZED:
        for item in sale.items.select_related("part", "stock_movement"):
            if item.part_id and item.stock_movement_id:
                part = item.part
                part.stock_quantity = (part.stock_quantity or ZERO) + (item.quantity or ZERO)
                part.save(update_fields=["stock_quantity", "updated_at"])
                PartStockMovement.objects.create(
                    part=part,
                    movement_type=PartStockMovement.MovementType.REVERSAL,
                    quantity=item.quantity or ZERO,
                    unit_cost=item.cost_price or part.cost_price or ZERO,
                    notes=f"Estorno da venda avulsa {sale.number}. {reason}".strip(),
                    actor=_actor_or_none(actor),
                )
    sale.status = CounterSale.Status.CANCELLED
    sale.notes = (sale.notes + "\n" if sale.notes else "") + (reason or "Venda avulsa cancelada.")
    sale.updated_by = _actor_or_none(actor) or sale.updated_by
    sale.save(update_fields=["status", "notes", "updated_by", "updated_at"])
    receivable = getattr(sale, "account_receivable", None)
    if receivable:
        receivable.status = AccountReceivable.Status.CANCELLED
        receivable.updated_by = _actor_or_none(actor) or receivable.updated_by
        receivable.save(update_fields=["status", "updated_by", "updated_at"])
    return sale


@transaction.atomic
def change_estimate_status(estimate, status, actor=None, note=""):
    obj = Estimate.objects.select_for_update().get(pk=estimate.pk)
    if obj.status == Estimate.Status.CONVERTED:
        raise ValidationError("Orçamento convertido em OS não pode trocar status.")
    now = timezone.now()
    obj.status = status
    if status == Estimate.Status.SENT and not obj.sent_at:
        obj.sent_at = now
    if status == Estimate.Status.APPROVED and not obj.approved_at:
        obj.approved_at = now
    if status == Estimate.Status.REJECTED and not obj.rejected_at:
        obj.rejected_at = now
    if note:
        obj.internal_notes = (obj.internal_notes + "\n" if obj.internal_notes else "") + note
    obj.updated_by = _actor_or_none(actor) or obj.updated_by
    obj.save(update_fields=["status", "sent_at", "approved_at", "rejected_at", "internal_notes", "updated_by", "updated_at"])
    return obj


@transaction.atomic
def convert_estimate_to_work_order(estimate, actor=None):
    obj = Estimate.objects.select_for_update().select_related("customer", "vehicle").prefetch_related("services", "parts").get(pk=estimate.pk)
    if obj.status not in {Estimate.Status.APPROVED, Estimate.Status.SENT}:
        raise ValidationError("Somente orçamento enviado ou aprovado pode ser convertido em OS.")
    if obj.converted_work_order_id:
        return obj.converted_work_order
    obj.recalculate_totals(save=True)
    work_order = WorkOrder.objects.create(
        customer=obj.customer,
        vehicle=obj.vehicle,
        title=obj.title,
        complaint=obj.complaint,
        diagnosis=obj.diagnosis,
        customer_notes=obj.customer_notes,
        internal_notes=f"OS gerada a partir do orçamento {obj.number}.\n{obj.internal_notes}".strip(),
        status=WorkOrder.Status.APPROVED,
        promised_at=None,
        manual_discount_amount=obj.discount_amount or ZERO,
        created_by=_actor_or_none(actor),
        updated_by=_actor_or_none(actor),
    )
    for item in obj.services.all():
        WorkOrderService.objects.create(
            work_order=work_order,
            service=item.service,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            discount_amount=item.discount_amount,
            notes=item.notes,
            status=WorkOrderService.Status.APPROVED,
        )
    for item in obj.parts.all():
        WorkOrderPart.objects.create(
            work_order=work_order,
            part=item.part,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            cost_price=item.cost_price,
            discount_amount=item.discount_amount,
            notes=item.notes,
        )
    work_order.recalculate_totals(save=True)
    record_event(
        work_order,
        WorkOrderEvent.EventType.CREATED,
        actor=actor,
        description=f"OS criada a partir do orçamento {obj.number}.",
        new_status=work_order.status,
        data={"estimate_id": obj.id, "estimate_number": obj.number},
    )
    obj.status = Estimate.Status.CONVERTED
    obj.converted_work_order = work_order
    obj.converted_at = timezone.now()
    obj.updated_by = _actor_or_none(actor) or obj.updated_by
    obj.save(update_fields=["status", "converted_work_order", "converted_at", "updated_by", "updated_at"])
    return work_order
