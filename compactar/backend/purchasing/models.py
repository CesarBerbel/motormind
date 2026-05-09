from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from messaging.models import TimeStampedModel
from workshop.models import Part, WorkOrder, WorkOrderPart

ZERO = Decimal("0.00")


class Supplier(TimeStampedModel):
    class PersonType(models.TextChoices):
        INDIVIDUAL = "individual", "Pessoa física"
        COMPANY = "company", "Pessoa jurídica"

    person_type = models.CharField(max_length=20, choices=PersonType.choices, default=PersonType.COMPANY, db_index=True)
    name = models.CharField(max_length=160, verbose_name="Nome / Razão social")
    last_name = models.CharField(max_length=120, blank=True, verbose_name="Sobrenome")
    trade_name = models.CharField(max_length=160, blank=True, verbose_name="Nome fantasia")
    document = models.CharField(max_length=18, blank=True, db_index=True, verbose_name="CPF/CNPJ")
    state_registration = models.CharField(max_length=40, blank=True, verbose_name="Inscrição estadual")
    municipal_registration = models.CharField(max_length=40, blank=True, verbose_name="Inscrição municipal")
    birth_date = models.DateField(null=True, blank=True, verbose_name="Data de nascimento/fundação")
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True, verbose_name="WhatsApp / telefone principal")
    secondary_phone = models.CharField(max_length=40, blank=True, verbose_name="Telefone secundário")
    contact_person = models.CharField(max_length=120, blank=True, verbose_name="Pessoa de contato")
    zip_code = models.CharField(max_length=9, blank=True, verbose_name="CEP")
    address_line = models.CharField(max_length=180, blank=True, verbose_name="Endereço")
    address_number = models.CharField(max_length=20, blank=True, verbose_name="Número")
    address_complement = models.CharField(max_length=120, blank=True, verbose_name="Complemento")
    district = models.CharField(max_length=120, blank=True, verbose_name="Bairro")
    city = models.CharField(max_length=120, blank=True, verbose_name="Cidade")
    state = models.CharField(max_length=2, blank=True, verbose_name="UF")
    country = models.CharField(max_length=80, default="Brasil", blank=True, verbose_name="País")
    address = models.TextField(blank=True, verbose_name="Endereço legado")
    notes = models.TextField(blank=True, verbose_name="Observações")
    custom_data = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name", "last_name"]
        constraints = [models.UniqueConstraint(fields=["name"], name="supplier_name_uniq")]

    @property
    def full_name(self):
        if self.person_type == self.PersonType.COMPANY:
            return self.name.strip()
        return f"{self.name} {self.last_name}".strip()

    @property
    def display_name(self):
        if self.person_type == self.PersonType.COMPANY and self.trade_name:
            return f"{self.name} ({self.trade_name})"
        return self.full_name

    @property
    def document_digits(self):
        return "".join(ch for ch in (self.document or "") if ch.isdigit())

    @property
    def address_display(self):
        parts = []
        if self.address_line:
            line = self.address_line
            if self.address_number:
                line = f"{line}, {self.address_number}"
            if self.address_complement:
                line = f"{line} - {self.address_complement}"
            parts.append(line)
        if self.district:
            parts.append(self.district)
        city_state = " / ".join([p for p in [self.city, self.state] if p])
        if city_state:
            parts.append(city_state)
        if self.zip_code:
            parts.append(f"CEP {self.zip_code}")
        if not parts and self.address:
            parts.append(self.address)
        return " - ".join(parts)

    def __str__(self):
        return self.display_name or self.email or self.phone


class PurchaseOrder(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Rascunho"
        REQUESTED = "requested", "Solicitado"
        APPROVED = "approved", "Aprovado"
        ORDERED = "ordered", "Pedido enviado"
        PARTIALLY_RECEIVED = "partially_received", "Recebido parcial"
        RECEIVED = "received", "Recebido"
        CANCELLED = "cancelled", "Cancelado"

    class Origin(models.TextChoices):
        MANUAL = "manual", "Manual"
        AUTOMATIC = "automatic", "Automático por OS"

    number = models.CharField(max_length=30, unique=True, blank=True)
    supplier = models.ForeignKey(Supplier, null=True, blank=True, on_delete=models.SET_NULL, related_name="purchase_orders")
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.DRAFT, db_index=True)
    origin = models.CharField(max_length=30, choices=Origin.choices, default=Origin.MANUAL, db_index=True)
    work_order = models.ForeignKey(WorkOrder, null=True, blank=True, on_delete=models.SET_NULL, related_name="purchase_orders")
    requested_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    ordered_at = models.DateTimeField(null=True, blank=True)
    expected_at = models.DateField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    subtotal_amount = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_purchase_orders")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="updated_purchase_orders")

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "origin"], name="po_status_origin_idx"),
            models.Index(fields=["number"], name="purch_po_number_idx"),
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
        prefix = f"PC-{year}-"
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

    def recalculate_totals(self, save=True):
        subtotal = sum((item.subtotal_amount for item in self.items.all()), ZERO)
        total = subtotal - (self.discount_amount or ZERO)
        self.subtotal_amount = subtotal
        self.total_amount = total if total > ZERO else ZERO
        if save:
            self.save(update_fields=["subtotal_amount", "total_amount", "discount_amount", "updated_at"])
        return self

    def refresh_status_from_receipts(self, save=True):
        items = list(self.items.all())
        if self.status == self.Status.CANCELLED:
            return self
        if not items:
            self.status = self.Status.DRAFT
        elif all((item.received_quantity or ZERO) >= (item.quantity or ZERO) for item in items):
            self.status = self.Status.RECEIVED
            if not self.received_at:
                self.received_at = timezone.now()
        elif any((item.received_quantity or ZERO) > ZERO for item in items):
            self.status = self.Status.PARTIALLY_RECEIVED
        if save:
            self.save(update_fields=["status", "received_at", "updated_at"])
        return self

    def __str__(self):
        return self.number or f"Pedido #{self.pk}"


class PurchaseOrderItem(TimeStampedModel):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="items")
    part = models.ForeignKey(Part, null=True, blank=True, on_delete=models.SET_NULL, related_name="purchase_order_items")
    work_order = models.ForeignKey(WorkOrder, null=True, blank=True, on_delete=models.SET_NULL, related_name="purchase_order_items")
    work_order_part = models.ForeignKey(WorkOrderPart, null=True, blank=True, on_delete=models.SET_NULL, related_name="purchase_order_items")
    description = models.CharField(max_length=220)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("1.00"), validators=[MinValueValidator(Decimal("0.01"))])
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    received_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    is_auto_generated = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["id"]

    @property
    def subtotal_amount(self):
        return (self.quantity or ZERO) * (self.unit_cost or ZERO)

    @property
    def pending_quantity(self):
        pending = (self.quantity or ZERO) - (self.received_quantity or ZERO)
        return pending if pending > ZERO else ZERO

    def save(self, *args, **kwargs):
        if self.part:
            if not self.description:
                self.description = self.part.name
            if not self.unit_cost:
                self.unit_cost = self.part.cost_price
        super().save(*args, **kwargs)
        self.purchase_order.recalculate_totals()

    def delete(self, *args, **kwargs):
        order = self.purchase_order
        result = super().delete(*args, **kwargs)
        order.recalculate_totals()
        order.refresh_status_from_receipts()
        return result

    def __str__(self):
        return f"{self.purchase_order} - {self.description}"
