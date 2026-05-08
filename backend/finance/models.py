from decimal import Decimal
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from messaging.models import Contact, TimeStampedModel
from purchasing.models import PurchaseOrder, Supplier
from workshop.models import WorkOrder

ZERO = Decimal("0.00")


class AccountReceivable(TimeStampedModel):
    class Origin(models.TextChoices):
        WORK_ORDER = "work_order", "Ordem de serviço"
        COUNTER_SALE = "counter_sale", "Venda avulsa"
        MANUAL = "manual", "Manual"

    class Status(models.TextChoices):
        OPEN = "open", "Aberta"
        PARTIAL = "partial", "Parcial"
        PAID = "paid", "Paga"
        OVERDUE = "overdue", "Vencida"
        CANCELLED = "cancelled", "Cancelada"

    number = models.CharField(max_length=30, unique=True, blank=True)
    origin = models.CharField(max_length=30, choices=Origin.choices, default=Origin.WORK_ORDER, db_index=True)
    work_order = models.OneToOneField(WorkOrder, null=True, blank=True, on_delete=models.PROTECT, related_name="account_receivable")
    counter_sale = models.OneToOneField("attendance.CounterSale", null=True, blank=True, on_delete=models.PROTECT, related_name="account_receivable")
    customer = models.ForeignKey(Contact, null=True, blank=True, on_delete=models.PROTECT, related_name="accounts_receivable")
    description = models.CharField(max_length=220)
    issue_date = models.DateField(default=timezone.localdate, db_index=True)
    due_date = models.DateField(default=timezone.localdate, db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    balance_amount = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN, db_index=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_accounts_receivable")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="updated_accounts_receivable")

    class Meta:
        ordering = ["-issue_date", "-id"]
        indexes = [
            models.Index(fields=["status", "due_date"], name="ar_status_due_idx"),
            models.Index(fields=["number"], name="finance_ar_number_idx"),
        ]

    @property
    def status_label(self):
        return self.get_status_display()

    @property
    def origin_label(self):
        return self.get_origin_display()

    @classmethod
    def generate_number(cls):
        year = timezone.localdate().year
        prefix = f"CR-{year}-"
        last = cls.objects.filter(number__startswith=prefix).order_by("number").last()
        if not last:
            return f"{prefix}00001"
        try:
            sequence = int(last.number.replace(prefix, "")) + 1
        except ValueError:
            sequence = cls.objects.filter(number__startswith=prefix).count() + 1
        return f"{prefix}{sequence:05d}"

    def save(self, *args, **kwargs):
        if not self.number:
            self.number = self.generate_number()
        super().save(*args, **kwargs)

    def recalculate(self, save=True):
        if self.work_order_id:
            self.work_order.recalculate_totals(save=True)
            self.amount = self.work_order.grand_total or ZERO
            self.paid_amount = self.work_order.paid_total or ZERO
            self.discount_amount = self.work_order.discount_total or ZERO
        elif self.counter_sale_id:
            self.counter_sale.recalculate_totals(save=True)
            self.amount = self.counter_sale.total_amount or ZERO
            self.paid_amount = self.counter_sale.paid_amount or ZERO
            self.discount_amount = self.counter_sale.discount_amount or ZERO
        elif self.pk:
            self.paid_amount = self.manual_payments.aggregate(total=models.Sum("amount"))["total"] or ZERO
        balance = (self.amount or ZERO) - (self.paid_amount or ZERO)
        self.balance_amount = balance if balance > ZERO else ZERO
        if self.status != self.Status.CANCELLED:
            today = timezone.localdate()
            if self.balance_amount <= ZERO:
                self.status = self.Status.PAID
            elif self.paid_amount > ZERO:
                self.status = self.Status.PARTIAL
            elif self.due_date and self.due_date < today:
                self.status = self.Status.OVERDUE
            else:
                self.status = self.Status.OPEN
        if save:
            self.save(update_fields=["amount", "discount_amount", "paid_amount", "balance_amount", "status", "updated_at"])
        return self

    def __str__(self):
        return f"{self.number} - {self.description}"


class AccountReceivablePayment(TimeStampedModel):
    class Method(models.TextChoices):
        CASH = "cash", "Dinheiro"
        CARD = "card", "Cartão"
        BANK_TRANSFER = "bank_transfer", "Transferência"
        MBWAY = "mbway", "MB Way"
        PIX = "pix", "Pix"
        OTHER = "other", "Outro"

    account_receivable = models.ForeignKey(AccountReceivable, on_delete=models.CASCADE, related_name="manual_payments")
    method = models.CharField(max_length=30, choices=Method.choices, default=Method.CASH)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    paid_at = models.DateTimeField(default=timezone.now, db_index=True)
    reference = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_accounts_receivable_payments")

    class Meta:
        ordering = ["-paid_at", "-id"]
        indexes = [models.Index(fields=["paid_at"], name="ar_payment_paid_idx")]

    @property
    def method_label(self):
        return self.get_method_display()

    def save(self, *args, **kwargs):
        if self.account_receivable_id and self.account_receivable.origin != AccountReceivable.Origin.MANUAL:
            raise ValidationError("Use o recebimento do documento de origem para OS ou venda avulsa.")
        super().save(*args, **kwargs)
        self.account_receivable.recalculate(save=True)

    def delete(self, *args, **kwargs):
        account = self.account_receivable
        result = super().delete(*args, **kwargs)
        account.recalculate(save=True)
        return result

    def __str__(self):
        return f"{self.account_receivable.number} - {self.amount}"


class AccountPayable(TimeStampedModel):
    class Origin(models.TextChoices):
        PURCHASE_ORDER = "purchase_order", "Pedido de compra"
        MANUAL = "manual", "Manual"

    class RecurrenceType(models.TextChoices):
        CASH = "cash", "À vista"
        INSTALLMENT = "installment", "Parcelada"
        FIXED_MONTHLY = "fixed_monthly", "Fixa mensal"

    class Status(models.TextChoices):
        OPEN = "open", "Aberta"
        PARTIAL = "partial", "Parcial"
        PAID = "paid", "Paga"
        OVERDUE = "overdue", "Vencida"
        CANCELLED = "cancelled", "Cancelada"

    number = models.CharField(max_length=30, unique=True, blank=True)
    origin = models.CharField(max_length=30, choices=Origin.choices, default=Origin.MANUAL, db_index=True)
    recurrence_type = models.CharField(max_length=30, choices=RecurrenceType.choices, default=RecurrenceType.CASH, db_index=True)
    purchase_order = models.OneToOneField(PurchaseOrder, null=True, blank=True, on_delete=models.PROTECT, related_name="account_payable")
    supplier = models.ForeignKey(Supplier, null=True, blank=True, on_delete=models.PROTECT, related_name="accounts_payable")
    category = models.CharField(max_length=80, blank=True, help_text="Ex.: aluguel, energia, folha, imposto, fornecedor, manutenção.")
    description = models.CharField(max_length=220)
    issue_date = models.DateField(default=timezone.localdate, db_index=True)
    due_date = models.DateField(default=timezone.localdate, db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    balance_amount = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN, db_index=True)
    installment_number = models.PositiveIntegerField(default=1)
    installment_total = models.PositiveIntegerField(default=1)
    recurrence_group = models.UUIDField(default=uuid.uuid4, editable=False, db_index=True)
    next_generation_date = models.DateField(null=True, blank=True, help_text="Usado em contas fixas mensais para gerar a próxima competência.")
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_accounts_payable")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="updated_accounts_payable")

    class Meta:
        ordering = ["due_date", "id"]
        indexes = [
            models.Index(fields=["status", "due_date"], name="ap_status_due_idx"),
            models.Index(fields=["origin", "recurrence_type"], name="ap_origin_recur_idx"),
            models.Index(fields=["number"], name="finance_ap_number_idx"),
            models.Index(fields=["recurrence_group"], name="ap_recur_group_idx"),
        ]

    @property
    def status_label(self):
        return self.get_status_display()

    @property
    def origin_label(self):
        return self.get_origin_display()

    @property
    def recurrence_type_label(self):
        return self.get_recurrence_type_display()

    @property
    def supplier_name(self):
        return self.supplier.display_name if self.supplier_id else ""

    @classmethod
    def generate_number(cls):
        year = timezone.localdate().year
        prefix = f"CP-{year}-"
        last = cls.objects.filter(number__startswith=prefix).order_by("number").last()
        if not last:
            return f"{prefix}00001"
        try:
            sequence = int(last.number.replace(prefix, "")) + 1
        except ValueError:
            sequence = cls.objects.filter(number__startswith=prefix).count() + 1
        return f"{prefix}{sequence:05d}"

    def save(self, *args, **kwargs):
        if not self.number:
            self.number = self.generate_number()
        super().save(*args, **kwargs)

    def recalculate(self, save=True):
        if self.pk:
            self.paid_amount = self.payments.aggregate(total=models.Sum("amount"))["total"] or ZERO
        else:
            self.paid_amount = self.paid_amount or ZERO
        balance = (self.amount or ZERO) - (self.paid_amount or ZERO)
        self.balance_amount = balance if balance > ZERO else ZERO
        if self.status != self.Status.CANCELLED:
            today = timezone.localdate()
            if self.balance_amount <= ZERO:
                self.status = self.Status.PAID
            elif self.paid_amount > ZERO:
                self.status = self.Status.PARTIAL
            elif self.due_date and self.due_date < today:
                self.status = self.Status.OVERDUE
            else:
                self.status = self.Status.OPEN
        if save:
            self.save(update_fields=["paid_amount", "balance_amount", "status", "updated_at"])
        return self

    def __str__(self):
        return f"{self.number} - {self.description}"


class AccountPayablePayment(TimeStampedModel):
    class Method(models.TextChoices):
        CASH = "cash", "Dinheiro"
        PIX = "pix", "PIX"
        BANK_TRANSFER = "bank_transfer", "Transferência bancária"
        DEBIT_CARD = "debit_card", "Cartão de débito"
        CREDIT_CARD = "credit_card", "Cartão de crédito"
        BOLETO = "boleto", "Boleto"
        OTHER = "other", "Outro"

    account_payable = models.ForeignKey(AccountPayable, on_delete=models.CASCADE, related_name="payments")
    method = models.CharField(max_length=30, choices=Method.choices, default=Method.PIX)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    paid_at = models.DateTimeField(default=timezone.now, db_index=True)
    reference = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_payable_payments")

    class Meta:
        ordering = ["-paid_at", "-id"]
        indexes = [models.Index(fields=["paid_at"], name="ap_payment_paid_at_idx")]

    @property
    def method_label(self):
        return self.get_method_display()

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.account_payable.recalculate(save=True)

    def delete(self, *args, **kwargs):
        account = self.account_payable
        result = super().delete(*args, **kwargs)
        account.recalculate(save=True)
        return result

    def __str__(self):
        return f"{self.account_payable.number} - {self.amount}"


class FinancialLedgerEntry(TimeStampedModel):
    class EntryType(models.TextChoices):
        CREDIT = "credit", "Entrada"
        DEBIT = "debit", "Saída"
        REVERSAL = "reversal", "Estorno"

    class Origin(models.TextChoices):
        WORK_ORDER = "work_order", "Ordem de serviço"
        COUNTER_SALE = "counter_sale", "Venda balcão"
        PURCHASE_ORDER = "purchase_order", "Pedido de compra"
        RECEIVABLE = "receivable", "Conta a receber"
        PAYABLE = "payable", "Conta a pagar"
        MANUAL = "manual", "Manual"
        SYSTEM = "system", "Sistema"

    entry_type = models.CharField(max_length=20, choices=EntryType.choices, db_index=True)
    origin = models.CharField(max_length=30, choices=Origin.choices, default=Origin.MANUAL, db_index=True)
    origin_model = models.CharField(max_length=80, blank=True, db_index=True)
    origin_id = models.CharField(max_length=80, blank=True, db_index=True)
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    competence_date = models.DateField(default=timezone.localdate, db_index=True)
    occurred_at = models.DateTimeField(default=timezone.now, db_index=True)
    payment_method = models.CharField(max_length=40, blank=True)
    reference = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)
    reversal_of = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="reversals")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_ledger_entries")

    class Meta:
        ordering = ["-occurred_at", "-id"]
        indexes = [
            models.Index(fields=["entry_type", "occurred_at"], name="ledger_type_occurred_idx"),
            models.Index(fields=["origin", "origin_id"], name="ledger_origin_idx"),
            models.Index(fields=["competence_date"], name="ledger_competence_idx"),
        ]
        verbose_name = "lançamento financeiro"
        verbose_name_plural = "lançamentos financeiros"

    @property
    def entry_type_label(self):
        return self.get_entry_type_display()

    @property
    def origin_label(self):
        return self.get_origin_display()

    def __str__(self):
        return f"{self.get_entry_type_display()} - {self.amount} - {self.description}"
