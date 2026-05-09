from calendar import monthrange
from decimal import Decimal
import uuid

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from purchasing.models import PurchaseOrder
from workshop.models import WorkOrder, WorkOrderEvent, WorkOrderPayment
from workshop.services import record_event

from .models import AccountPayable, AccountPayablePayment, AccountReceivable, AccountReceivablePayment, FinancialLedgerEntry
from .ledger import record_ledger_entry

ZERO = Decimal("0.00")


def default_due_date_for_work_order(work_order):
    if work_order.delivered_at:
        return timezone.localtime(work_order.delivered_at).date()
    if work_order.promised_at:
        return timezone.localtime(work_order.promised_at).date()
    return timezone.localdate()


def add_months(value, months=1):
    month = value.month - 1 + months
    year = value.year + month // 12
    month = month % 12 + 1
    day = min(value.day, monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


@transaction.atomic
def ensure_receivable_for_work_order(work_order, actor=None):
    locked_order = WorkOrder.objects.select_for_update().select_related("customer", "vehicle").get(pk=work_order.pk)
    locked_order.recalculate_totals(save=True)
    receivable, created = AccountReceivable.objects.select_for_update().get_or_create(
        work_order=locked_order,
        defaults={
            "origin": AccountReceivable.Origin.WORK_ORDER,
            "customer": locked_order.customer,
            "description": f"Conta a receber da {locked_order.number}",
            "issue_date": timezone.localdate(),
            "due_date": default_due_date_for_work_order(locked_order),
            "amount": locked_order.grand_total or ZERO,
            "discount_amount": locked_order.discount_total or ZERO,
            "paid_amount": locked_order.paid_total or ZERO,
            "created_by": actor if getattr(actor, "is_authenticated", False) else None,
            "updated_by": actor if getattr(actor, "is_authenticated", False) else None,
        },
    )
    receivable.customer = locked_order.customer
    receivable.description = f"Conta a receber da {locked_order.number}"
    receivable.due_date = default_due_date_for_work_order(locked_order)
    receivable.updated_by = actor if getattr(actor, "is_authenticated", False) else receivable.updated_by
    receivable.recalculate(save=True)
    record_event(
        locked_order,
        WorkOrderEvent.EventType.PAYMENT_ADDED,
        actor=actor,
        description=("Conta a receber gerada." if created else "Conta a receber atualizada."),
        data={"account_receivable_id": receivable.id, "account_receivable_number": receivable.number, "amount": str(receivable.amount)},
    )
    return receivable


def refresh_receivable_for_work_order(work_order):
    receivable = getattr(work_order, "account_receivable", None)
    if receivable:
        receivable.recalculate(save=True)
    return receivable


@transaction.atomic
def create_manual_receivable(*, customer=None, description, issue_date=None, due_date, amount, discount_amount=ZERO, notes="", actor=None):
    amount = Decimal(str(amount))
    discount_amount = Decimal(str(discount_amount or ZERO))
    if amount <= ZERO:
        raise ValidationError("O valor da conta a receber precisa ser maior que zero.")
    if discount_amount < ZERO:
        raise ValidationError("O desconto não pode ser negativo.")
    receivable = AccountReceivable.objects.create(
        origin=AccountReceivable.Origin.MANUAL,
        customer=customer,
        description=description,
        issue_date=issue_date or timezone.localdate(),
        due_date=due_date,
        amount=amount,
        discount_amount=discount_amount,
        notes=notes,
        created_by=actor if getattr(actor, "is_authenticated", False) else None,
        updated_by=actor if getattr(actor, "is_authenticated", False) else None,
    )
    receivable.recalculate(save=True)
    return receivable


@transaction.atomic
def register_receivable_payment(receivable, amount, method, paid_at=None, reference="", notes="", actor=None):
    if receivable.work_order_id:
        payment = WorkOrderPayment.objects.create(
            work_order=receivable.work_order,
            method=method,
            amount=amount,
            paid_at=paid_at or timezone.now(),
            reference=reference,
            notes=notes,
            created_by=actor if getattr(actor, "is_authenticated", False) else None,
        )
        receivable.refresh_from_db()
        receivable.recalculate(save=True)
        record_ledger_entry(
            entry_type=FinancialLedgerEntry.EntryType.CREDIT,
            origin=FinancialLedgerEntry.Origin.WORK_ORDER,
            origin_instance=payment,
            description=f"Recebimento da {receivable.work_order.number}",
            amount=payment.amount,
            occurred_at=payment.paid_at,
            competence_date=payment.paid_at.date(),
            payment_method=payment.method,
            reference=payment.reference,
            notes=payment.notes,
            actor=actor,
        )
        record_event(
            receivable.work_order,
            WorkOrderEvent.EventType.PAYMENT_ADDED,
            actor=actor,
            description=f"Recebimento financeiro registrado: {payment.amount}.",
            data={"payment_id": payment.id, "account_receivable_id": receivable.id, "method": payment.method, "amount": str(payment.amount)},
        )
        return payment, receivable
    if receivable.counter_sale_id:
        from attendance.services import register_counter_sale_payment

        payment, _sale = register_counter_sale_payment(
            receivable.counter_sale,
            amount=amount,
            method=method,
            paid_at=paid_at or timezone.now(),
            reference=reference,
            notes=notes,
            actor=actor,
        )
        receivable.refresh_from_db()
        receivable.recalculate(save=True)
        record_ledger_entry(
            entry_type=FinancialLedgerEntry.EntryType.CREDIT,
            origin=FinancialLedgerEntry.Origin.COUNTER_SALE,
            origin_instance=payment,
            description=f"Recebimento da venda balcão {receivable.counter_sale.number}",
            amount=payment.amount,
            occurred_at=payment.paid_at,
            competence_date=payment.paid_at.date(),
            payment_method=payment.method,
            reference=payment.reference,
            notes=payment.notes,
            actor=actor,
        )
        return payment, receivable
    locked_receivable = AccountReceivable.objects.select_for_update().get(pk=receivable.pk)
    if locked_receivable.status == AccountReceivable.Status.CANCELLED:
        raise ValidationError("Conta a receber cancelada não pode receber pagamento.")
    if locked_receivable.origin != AccountReceivable.Origin.MANUAL:
        raise ValidationError("Esta conta a receber não aceita recebimento manual direto.")
    amount = Decimal(str(amount))
    locked_receivable.recalculate(save=True)
    if amount <= ZERO:
        raise ValidationError("O valor recebido precisa ser maior que zero.")
    if amount > locked_receivable.balance_amount:
        raise ValidationError("O valor recebido não pode ser maior que o saldo da conta.")
    payment = AccountReceivablePayment.objects.create(
        account_receivable=locked_receivable,
        method=method,
        amount=amount,
        paid_at=paid_at or timezone.now(),
        reference=reference,
        notes=notes,
        created_by=actor if getattr(actor, "is_authenticated", False) else None,
    )
    locked_receivable.refresh_from_db()
    locked_receivable.recalculate(save=True)
    record_ledger_entry(
        entry_type=FinancialLedgerEntry.EntryType.CREDIT,
        origin=FinancialLedgerEntry.Origin.RECEIVABLE,
        origin_instance=payment,
        description=f"Recebimento da conta {locked_receivable.number}",
        amount=payment.amount,
        occurred_at=payment.paid_at,
        competence_date=payment.paid_at.date(),
        payment_method=payment.method,
        reference=payment.reference,
        notes=payment.notes,
        actor=actor,
    )
    return payment, locked_receivable


@transaction.atomic
def ensure_payable_for_purchase_order(purchase_order, actor=None):
    locked_order = PurchaseOrder.objects.select_for_update().select_related("supplier").prefetch_related("items").get(pk=purchase_order.pk)
    if locked_order.status not in {
        PurchaseOrder.Status.APPROVED,
        PurchaseOrder.Status.ORDERED,
        PurchaseOrder.Status.PARTIALLY_RECEIVED,
        PurchaseOrder.Status.RECEIVED,
    }:
        raise ValidationError("A conta a pagar só pode ser gerada para pedido aprovado ou posterior.")
    if not locked_order.supplier_id:
        raise ValidationError("Informe o fornecedor antes de aprovar o pedido de compra.")
    locked_order.recalculate_totals()
    if locked_order.total_amount <= ZERO:
        raise ValidationError("Pedido de compra aprovado precisa ter valor maior que zero.")
    due_date = locked_order.expected_at or timezone.localdate()
    payable, created = AccountPayable.objects.select_for_update().get_or_create(
        purchase_order=locked_order,
        defaults={
            "origin": AccountPayable.Origin.PURCHASE_ORDER,
            "recurrence_type": AccountPayable.RecurrenceType.CASH,
            "supplier": locked_order.supplier,
            "category": "fornecedor",
            "description": f"Conta a pagar do pedido {locked_order.number}",
            "issue_date": timezone.localdate(),
            "due_date": due_date,
            "amount": locked_order.total_amount or ZERO,
            "created_by": actor if getattr(actor, "is_authenticated", False) else None,
            "updated_by": actor if getattr(actor, "is_authenticated", False) else None,
        },
    )
    payable.origin = AccountPayable.Origin.PURCHASE_ORDER
    payable.recurrence_type = AccountPayable.RecurrenceType.CASH
    payable.supplier = locked_order.supplier
    payable.category = payable.category or "fornecedor"
    payable.description = f"Conta a pagar do pedido {locked_order.number}"
    payable.due_date = due_date
    payable.amount = locked_order.total_amount or ZERO
    payable.updated_by = actor if getattr(actor, "is_authenticated", False) else payable.updated_by
    payable.recalculate(save=True)
    return payable, created


@transaction.atomic
def register_payable_payment(payable, amount, method, paid_at=None, reference="", notes="", actor=None):
    locked_payable = AccountPayable.objects.select_for_update().get(pk=payable.pk)
    if locked_payable.status == AccountPayable.Status.CANCELLED:
        raise ValidationError("Conta a pagar cancelada não pode receber pagamento.")
    amount = Decimal(str(amount))
    locked_payable.recalculate(save=True)
    if amount <= ZERO:
        raise ValidationError("O valor pago precisa ser maior que zero.")
    if amount > locked_payable.balance_amount:
        raise ValidationError("O valor pago não pode ser maior que o saldo da conta.")
    payment = AccountPayablePayment.objects.create(
        account_payable=locked_payable,
        method=method,
        amount=amount,
        paid_at=paid_at or timezone.now(),
        reference=reference,
        notes=notes,
        created_by=actor if getattr(actor, "is_authenticated", False) else None,
    )
    locked_payable.refresh_from_db()
    locked_payable.recalculate(save=True)
    record_ledger_entry(
        entry_type=FinancialLedgerEntry.EntryType.DEBIT,
        origin=FinancialLedgerEntry.Origin.PAYABLE,
        origin_instance=payment,
        description=f"Pagamento da conta {locked_payable.number}",
        amount=payment.amount,
        occurred_at=payment.paid_at,
        competence_date=payment.paid_at.date(),
        payment_method=payment.method,
        reference=payment.reference,
        notes=payment.notes,
        actor=actor,
    )
    return payment, locked_payable


@transaction.atomic
def create_manual_payables(*, supplier=None, category="", description, issue_date=None, first_due_date, amount, recurrence_type, installment_total=1, notes="", actor=None):
    amount = Decimal(str(amount))
    installment_total = int(installment_total or 1)
    if amount <= ZERO:
        raise ValidationError("O valor da conta a pagar precisa ser maior que zero.")
    if installment_total < 1:
        raise ValidationError("A quantidade de parcelas precisa ser maior ou igual a 1.")
    if recurrence_type == AccountPayable.RecurrenceType.INSTALLMENT and installment_total < 2:
        raise ValidationError("Conta parcelada precisa ter pelo menos 2 parcelas.")
    if recurrence_type != AccountPayable.RecurrenceType.INSTALLMENT:
        installment_total = 1
    group_id = uuid.uuid4()
    created = []
    for index in range(installment_total):
        due_date = add_months(first_due_date, index) if recurrence_type == AccountPayable.RecurrenceType.INSTALLMENT else first_due_date
        if recurrence_type == AccountPayable.RecurrenceType.INSTALLMENT:
            line_description = f"{description} - parcela {index + 1}/{installment_total}"
            line_amount = (amount / Decimal(installment_total)).quantize(Decimal("0.01"))
            if index == installment_total - 1:
                line_amount = amount - sum(item.amount for item in created)
        else:
            line_description = description
            line_amount = amount
        next_generation_date = add_months(first_due_date, 1) if recurrence_type == AccountPayable.RecurrenceType.FIXED_MONTHLY else None
        account = AccountPayable.objects.create(
            origin=AccountPayable.Origin.MANUAL,
            recurrence_type=recurrence_type,
            supplier=supplier,
            category=category or "",
            description=line_description,
            issue_date=issue_date or timezone.localdate(),
            due_date=due_date,
            amount=line_amount,
            installment_number=index + 1,
            installment_total=installment_total,
            recurrence_group=group_id,
            next_generation_date=next_generation_date,
            notes=notes,
            created_by=actor if getattr(actor, "is_authenticated", False) else None,
            updated_by=actor if getattr(actor, "is_authenticated", False) else None,
        )
        account.recalculate(save=True)
        created.append(account)
    return created


@transaction.atomic
def generate_next_fixed_payable(template_account, actor=None):
    locked_account = AccountPayable.objects.select_for_update().get(pk=template_account.pk)
    if locked_account.recurrence_type != AccountPayable.RecurrenceType.FIXED_MONTHLY:
        raise ValidationError("Somente contas fixas mensais podem gerar próxima competência.")
    next_due_date = locked_account.next_generation_date or add_months(locked_account.due_date, 1)
    exists = AccountPayable.objects.filter(
        recurrence_group=locked_account.recurrence_group,
        due_date=next_due_date,
        recurrence_type=AccountPayable.RecurrenceType.FIXED_MONTHLY,
    ).exists()
    if exists:
        raise ValidationError("A próxima competência desta conta fixa já foi gerada.")
    account = AccountPayable.objects.create(
        origin=AccountPayable.Origin.MANUAL,
        recurrence_type=AccountPayable.RecurrenceType.FIXED_MONTHLY,
        supplier=locked_account.supplier,
        category=locked_account.category,
        description=locked_account.description,
        issue_date=timezone.localdate(),
        due_date=next_due_date,
        amount=locked_account.amount,
        installment_number=1,
        installment_total=1,
        recurrence_group=locked_account.recurrence_group,
        next_generation_date=add_months(next_due_date, 1),
        notes=locked_account.notes,
        created_by=actor if getattr(actor, "is_authenticated", False) else None,
        updated_by=actor if getattr(actor, "is_authenticated", False) else None,
    )
    locked_account.next_generation_date = add_months(next_due_date, 1)
    locked_account.updated_by = actor if getattr(actor, "is_authenticated", False) else locked_account.updated_by
    locked_account.save(update_fields=["next_generation_date", "updated_by", "updated_at"])
    account.recalculate(save=True)
    return account
