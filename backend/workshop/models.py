from decimal import Decimal
import hashlib
import os
import re
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from messaging.models import Contact, MessageLog, MessageTemplate, TimeStampedModel

User = get_user_model()
ZERO = Decimal("0.00")


def normalize_lookup_name(value):
    """Normaliza nomes usados em cadastros auxiliares: sem espaços e em minúsculo."""
    return re.sub(r"\s+", "", (value or "").strip()).lower()


IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"]
IMAGE_EXTENSIONS_WITH_SVG = IMAGE_EXTENSIONS + ["svg"]
MAX_IMAGE_SIZE = 8 * 1024 * 1024
MAX_LOGO_SIZE = 3 * 1024 * 1024

PART_UNIT_CHOICES = [
    ("un", "Unidade"),
    ("pc", "Peça"),
    ("kit", "Kit"),
    ("par", "Par"),
    ("jogo", "Jogo"),
    ("cx", "Caixa"),
    ("pct", "Pacote"),
    ("m", "Metro"),
    ("cm", "Centímetro"),
    ("l", "Litro"),
    ("ml", "Mililitro"),
    ("kg", "Quilograma"),
    ("g", "Grama"),
]

UNIT_NORMALIZATION_ALIASES = {
    "": "un",
    "und": "un",
    "unid": "un",
    "unidade": "un",
    "unidades": "un",
    "unit": "un",
    "units": "un",
    "peca": "pc",
    "pecas": "pc",
    "peça": "pc",
    "peças": "pc",
    "pcs": "pc",
    "pç": "pc",
    "pçs": "pc",
    "caixa": "cx",
    "caixas": "cx",
    "pacote": "pct",
    "pacotes": "pct",
    "quilo": "kg",
    "quilograma": "kg",
    "quilogramas": "kg",
    "metro": "m",
    "metros": "m",
    "centimetro": "cm",
    "centímetros": "cm",
    "centimetros": "cm",
    "litro": "l",
    "litros": "l",
}


def normalize_part_unit(value):
    raw = (value or "").strip().lower()
    compact = re.sub(r"\s+", "", raw)
    return UNIT_NORMALIZATION_ALIASES.get(compact, compact or "un")


def safe_upload_path(prefix, instance, filename):
    ext = os.path.splitext(filename or "arquivo")[1].lower() or ".jpg"
    return f"{prefix}/{timezone.localdate():%Y/%m}/{uuid4().hex}{ext}"


def workshop_logo_upload_path(instance, filename):
    return safe_upload_path("workshop/logos", instance, filename)


def service_photo_upload_path(instance, filename):
    return safe_upload_path("workshop/services", instance, filename)


def part_photo_upload_path(instance, filename):
    return safe_upload_path("workshop/parts", instance, filename)


def work_order_photo_upload_path(instance, filename):
    work_order_id = getattr(instance, "work_order_id", None) or "sem-os"
    return safe_upload_path(f"workshop/work-orders/{work_order_id}/photos", instance, filename)


def work_order_checklist_photo_upload_path(instance, filename):
    work_order_id = getattr(instance, "work_order_id", None) or "sem-os"
    return safe_upload_path(f"workshop/work-orders/{work_order_id}/checklist", instance, filename)


def work_order_signature_upload_path(instance, filename):
    work_order_id = getattr(instance, "work_order_id", None) or "sem-os"
    return safe_upload_path(f"workshop/work-orders/{work_order_id}/signatures", instance, filename)


def validate_file_size(value, max_size=MAX_IMAGE_SIZE, label="imagem"):
    if value and getattr(value, "size", 0) > max_size:
        raise ValidationError({"image": f"A {label} deve ter no máximo {max_size // (1024 * 1024)} MB."})


class WorkshopProfile(TimeStampedModel):
    """Cadastro singleton da oficina usado no layout e em documentos imprimíveis."""

    legal_name = models.CharField(max_length=180, verbose_name="Razão social")
    trade_name = models.CharField(max_length=180, blank=True, verbose_name="Nome fantasia")
    document_number = models.CharField(max_length=18, blank=True, db_index=True, verbose_name="CNPJ/CPF")
    state_registration = models.CharField(max_length=40, blank=True, verbose_name="Inscrição estadual")
    municipal_registration = models.CharField(max_length=40, blank=True, verbose_name="Inscrição municipal")
    logo = models.FileField(
        upload_to=workshop_logo_upload_path,
        blank=True,
        validators=[FileExtensionValidator(allowed_extensions=IMAGE_EXTENSIONS_WITH_SVG)],
        verbose_name="Logomarca",
    )
    email = models.EmailField(blank=True)
    phone_e164 = models.CharField(max_length=20, blank=True, verbose_name="Telefone principal / WhatsApp")
    secondary_phone_e164 = models.CharField(max_length=20, blank=True, verbose_name="Telefone secundário")
    website = models.URLField(blank=True)
    zip_code = models.CharField(max_length=9, blank=True, verbose_name="CEP")
    address_line = models.CharField(max_length=180, blank=True, verbose_name="Endereço")
    address_number = models.CharField(max_length=20, blank=True, verbose_name="Número")
    address_complement = models.CharField(max_length=120, blank=True, verbose_name="Complemento")
    district = models.CharField(max_length=120, blank=True, verbose_name="Bairro")
    city = models.CharField(max_length=120, blank=True, verbose_name="Cidade")
    state = models.CharField(max_length=2, blank=True, verbose_name="UF")
    country = models.CharField(max_length=80, default="Brasil", blank=True, verbose_name="País")
    responsible_name = models.CharField(max_length=120, blank=True, verbose_name="Responsável técnico/administrativo")
    print_header_text = models.CharField(max_length=220, blank=True, verbose_name="Texto do cabeçalho de impressão")
    print_footer_text = models.TextField(blank=True, verbose_name="Rodapé padrão de impressão")
    estimate_terms = models.TextField(blank=True, verbose_name="Condições padrão para orçamentos")
    work_order_terms = models.TextField(blank=True, verbose_name="Condições padrão para ordens de serviço")
    purchase_order_terms = models.TextField(blank=True, verbose_name="Condições padrão para pedidos de compra")
    bank_info = models.TextField(blank=True, verbose_name="Dados bancários para impressão")
    pix_key = models.CharField(max_length=120, blank=True, verbose_name="Chave Pix")
    technical_checklist_enabled = models.BooleanField(default=False, verbose_name="Usar checklist técnico nas OS")
    delivery_signature_enabled = models.BooleanField(default=True, verbose_name="Usar assinatura digital na entrega")
    landing_enabled = models.BooleanField(default=True, verbose_name="Landing page pública habilitada")
    landing_headline = models.CharField(max_length=180, blank=True, verbose_name="Título da landing page")
    landing_subheadline = models.TextField(blank=True, verbose_name="Subtítulo da landing page")
    landing_cta_label = models.CharField(max_length=80, default="Solicitar atendimento", blank=True, verbose_name="Texto do botão principal")
    landing_highlight_text = models.CharField(max_length=180, blank=True, verbose_name="Destaque curto da landing page")
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "cadastro da oficina"
        verbose_name_plural = "cadastro da oficina"

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1, defaults={"legal_name": "Minha Oficina", "trade_name": "Oficina Admin"})
        return obj

    @property
    def display_name(self):
        return self.trade_name or self.legal_name or "Oficina Admin"

    @property
    def document_digits(self):
        return "".join(ch for ch in (self.document_number or "") if ch.isdigit())

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
        return " - ".join(parts)

    def clean(self):
        super().clean()
        self.legal_name = (self.legal_name or "").strip() or "Minha Oficina"
        self.trade_name = (self.trade_name or "").strip()
        self.state = (self.state or "").strip().upper()[:2]

    def save(self, *args, **kwargs):
        self.pk = 1
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        self.is_active = False
        self.save(update_fields=["is_active", "updated_at"])

    def __str__(self):
        return self.display_name


class GeneralCategory(TimeStampedModel):
    class CategoryType(models.TextChoices):
        GENERAL = "general", "Geral"
        SERVICE = "service", "Serviço"
        PART = "part", "Peça / estoque"
        VEHICLE = "vehicle", "Veículo"
        WORK_ORDER = "work_order", "Ordem de serviço"

    type = models.CharField(max_length=40, choices=CategoryType.choices, default=CategoryType.GENERAL, db_index=True)
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=40, blank=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["type", "name"]
        constraints = [
            models.UniqueConstraint(fields=["type", "name"], name="general_category_type_name_uniq"),
            models.UniqueConstraint(fields=["type", "code"], condition=~models.Q(code=""), name="general_category_type_code_uniq"),
        ]

    @property
    def type_label(self):
        return self.get_type_display()

    def __str__(self):
        return f"{self.get_type_display()} - {self.name}"


class PartBrand(TimeStampedModel):
    class Source(models.TextChoices):
        SEED = "seed", "Carga inicial"
        MANUAL = "manual", "Cadastro manual"

    name = models.CharField(max_length=120)
    normalized_name = models.CharField(max_length=120, unique=True, editable=False, db_index=True)
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.MANUAL)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "marca de peça"
        verbose_name_plural = "marcas de peças"

    @classmethod
    def get_or_create_from_name(cls, name, source=None):
        clean_name = (name or "").strip()
        if not clean_name:
            return None, False
        normalized = normalize_lookup_name(clean_name)
        defaults = {"name": clean_name, "source": source or cls.Source.MANUAL, "is_active": True}
        brand, created = cls.objects.get_or_create(normalized_name=normalized, defaults=defaults)
        if not brand.is_active:
            brand.is_active = True
            brand.save(update_fields=["is_active", "updated_at"])
        return brand, created

    def clean(self):
        super().clean()
        self.name = (self.name or "").strip()
        self.normalized_name = normalize_lookup_name(self.name)
        if not self.name:
            raise ValidationError({"name": "Informe o nome da marca."})
        if not self.normalized_name:
            raise ValidationError({"name": "Informe uma marca válida."})

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.normalized_name = normalize_lookup_name(self.name)
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Vehicle(TimeStampedModel):
    customer = models.ForeignKey(Contact, on_delete=models.PROTECT, related_name="vehicles")
    plate = models.CharField(max_length=20, unique=True)
    make = models.CharField(max_length=80)
    model = models.CharField(max_length=120)
    version = models.CharField(max_length=120, blank=True)
    year = models.PositiveIntegerField(null=True, blank=True)
    color = models.CharField(max_length=50, blank=True)
    vin = models.CharField(max_length=40, blank=True)
    odometer_km = models.PositiveIntegerField(default=0)
    fipe_brand_code = models.CharField(max_length=30, blank=True, db_index=True)
    fipe_model_code = models.CharField(max_length=30, blank=True, db_index=True)
    fipe_year_code = models.CharField(max_length=30, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_vehicles")

    class Meta:
        ordering = ["plate"]

    @property
    def has_fipe_link(self):
        return bool(self.fipe_brand_code and self.fipe_model_code)

    @property
    def display_name(self):
        year = f" {self.year}" if self.year else ""
        return f"{self.plate} - {self.make} {self.model}{year}".strip()

    def __str__(self):
        return self.display_name


class WorkshopService(TimeStampedModel):
    code = models.CharField(max_length=40, unique=True, blank=True, null=True)
    name = models.CharField(max_length=160)
    category = models.ForeignKey(GeneralCategory, null=True, blank=True, on_delete=models.SET_NULL, related_name="workshop_services", limit_choices_to={"type": GeneralCategory.CategoryType.SERVICE})
    legacy_category_name = models.CharField(max_length=100, blank=True)
    photo = models.FileField(
        upload_to=service_photo_upload_path,
        blank=True,
        validators=[FileExtensionValidator(allowed_extensions=IMAGE_EXTENSIONS)],
        verbose_name="Foto/thumbnail do serviço",
    )
    description = models.TextField(blank=True)
    default_unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    estimated_hours = models.DecimalField(max_digits=6, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    is_featured = models.BooleanField(default=False, db_index=True, verbose_name="Mais usado/preferido na OS")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["category__name", "name"]

    @property
    def category_name(self):
        return self.category.name if self.category else self.legacy_category_name

    @property
    def photo_url(self):
        return self.photo.url if self.photo else ""

    def __str__(self):
        return self.name




class WorkshopServiceChecklistTemplate(TimeStampedModel):
    """Checklist padrão configurado no cadastro de um serviço."""

    service = models.ForeignKey(WorkshopService, on_delete=models.CASCADE, related_name="checklist_templates")
    description = models.CharField(max_length=220)
    is_required = models.BooleanField(default=True)
    requires_photo = models.BooleanField(default=False)
    requires_note = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "id"]
        verbose_name = "item de checklist padrão"
        verbose_name_plural = "itens de checklist padrão"

    def clean(self):
        super().clean()
        self.description = (self.description or "").strip()
        if not self.description:
            raise ValidationError({"description": "Informe a descrição do item do checklist."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.service} - {self.description}"


class ServicePackage(TimeStampedModel):
    code = models.CharField(max_length=40, unique=True, blank=True, null=True)
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    @property
    def subtotal_amount(self):
        return sum((item.subtotal_amount for item in self.items.all()), ZERO)

    @property
    def discount_amount(self):
        return sum((item.discount_amount or ZERO for item in self.items.all()), ZERO)

    @property
    def total_amount(self):
        total = self.subtotal_amount - self.discount_amount
        return total if total > ZERO else ZERO

    def __str__(self):
        return self.name


class ServicePackageItem(TimeStampedModel):
    service_package = models.ForeignKey(ServicePackage, on_delete=models.CASCADE, related_name="items")
    service = models.ForeignKey(WorkshopService, null=True, blank=True, on_delete=models.SET_NULL, related_name="package_items")
    description = models.CharField(max_length=220)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("1.00"), validators=[MinValueValidator(Decimal("0.01"))])
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    @property
    def subtotal_amount(self):
        return (self.quantity or ZERO) * (self.unit_price or ZERO)

    @property
    def total_amount(self):
        total = self.subtotal_amount - (self.discount_amount or ZERO)
        return total if total > ZERO else ZERO

    def save(self, *args, **kwargs):
        if self.service:
            if not self.description:
                self.description = self.service.name
            if not self.unit_price:
                self.unit_price = self.service.default_unit_price
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.service_package} - {self.description}"


class Part(TimeStampedModel):
    sku = models.CharField(max_length=60, unique=True)
    name = models.CharField(max_length=160)
    category = models.ForeignKey(GeneralCategory, null=True, blank=True, on_delete=models.SET_NULL, related_name="parts", limit_choices_to={"type": GeneralCategory.CategoryType.PART})
    brand = models.CharField(max_length=100, blank=True)
    photo = models.FileField(
        upload_to=part_photo_upload_path,
        blank=True,
        validators=[FileExtensionValidator(allowed_extensions=IMAGE_EXTENSIONS)],
        verbose_name="Foto da peça",
    )
    location = models.CharField(max_length=80, blank=True)
    unit = models.CharField(max_length=20, default="un", verbose_name="Unidade de medida")
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    sale_price = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    stock_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    minimum_stock = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    is_featured = models.BooleanField(default=False, db_index=True, verbose_name="Mais usada/preferida na OS")
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["category__name", "name", "sku"]

    @property
    def category_name(self):
        return self.category.name if self.category else ""

    @property
    def is_low_stock(self):
        return self.stock_quantity <= self.minimum_stock

    @property
    def stock_value(self):
        return (self.stock_quantity or ZERO) * (self.cost_price or ZERO)

    def clean(self):
        super().clean()
        self.unit = normalize_part_unit(self.unit)
        allowed_units = {value for value, _label in PART_UNIT_CHOICES}
        if self.unit not in allowed_units:
            raise ValidationError({"unit": "Selecione uma unidade cadastrada na lista controlada."})

    def save(self, *args, **kwargs):
        self.unit = normalize_part_unit(self.unit)
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.sku} - {self.name}"


class WorkOrder(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Rascunho"
        OPEN = "open", "Aberta"
        DIAGNOSIS = "diagnosis", "Diagnostico"
        AWAITING_APPROVAL = "awaiting_approval", "Aguardando aprovacao"
        APPROVED = "approved", "Aprovada"
        IN_PROGRESS = "in_progress", "Em execucao"
        QUALITY_CHECK = "quality_check", "Conferencia"
        READY = "ready", "Pronta para entrega"
        DELIVERED = "delivered", "Entregue"
        CANCELLED = "cancelled", "Cancelada"

    class Priority(models.TextChoices):
        LOW = "low", "Baixa"
        NORMAL = "normal", "Normal"
        HIGH = "high", "Alta"
        URGENT = "urgent", "Urgente"

    class OrderType(models.TextChoices):
        STANDARD = "standard", "Normal"
        RETURN = "return", "Retorno"
        WARRANTY = "warranty", "Garantia"

    number = models.CharField(max_length=30, unique=True, blank=True)
    customer = models.ForeignKey(Contact, on_delete=models.PROTECT, related_name="work_orders")
    vehicle = models.ForeignKey(Vehicle, null=True, blank=True, on_delete=models.PROTECT, related_name="work_orders")
    title = models.CharField(max_length=180, blank=True)
    complaint = models.TextField(blank=True)
    diagnosis = models.TextField(blank=True)
    solution = models.TextField(blank=True)
    internal_notes = models.TextField(blank=True)
    customer_notes = models.TextField(blank=True)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.OPEN, db_index=True)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.NORMAL)
    order_type = models.CharField(max_length=20, choices=OrderType.choices, default=OrderType.STANDARD, db_index=True)
    reference_work_order = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="referenced_by_work_orders")
    mileage_in = models.PositiveIntegerField(default=0)
    mileage_out = models.PositiveIntegerField(null=True, blank=True)
    promised_at = models.DateTimeField(null=True, blank=True)
    opened_at = models.DateTimeField(default=timezone.now)
    approved_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    assigned_to = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="assigned_work_orders")
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_work_orders")
    updated_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="updated_work_orders")
    subtotal_services = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    subtotal_parts = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    manual_discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    discount_total = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    paid_total = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    balance_due = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    inventory_consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "priority"], name="wo_status_priority_idx"),
            models.Index(fields=["number"], name="workshop_wo_number_idx"),
        ]

    @property
    def status_label(self):
        return self.get_status_display()

    @property
    def priority_label(self):
        return self.get_priority_display()

    @property
    def order_type_label(self):
        return self.get_order_type_display()

    def clean(self):
        super().clean()
        if self.order_type == self.OrderType.WARRANTY and not self.reference_work_order_id:
            raise ValidationError({"reference_work_order": "Informe a OS de referencia quando o tipo for garantia."})
        if self.pk and self.reference_work_order_id == self.pk:
            raise ValidationError({"reference_work_order": "A OS de referencia nao pode ser a propria OS."})
        if self.reference_work_order_id:
            reference = self.reference_work_order
            if self.customer_id and reference.customer_id != self.customer_id:
                raise ValidationError({"reference_work_order": "A OS de referencia precisa pertencer ao mesmo cliente."})
            if self.vehicle_id and reference.vehicle_id and reference.vehicle_id != self.vehicle_id:
                raise ValidationError({"reference_work_order": "A OS de referencia precisa pertencer ao mesmo veiculo."})

    def save(self, *args, **kwargs):
        if not self.number:
            self.number = self.generate_number()
        super().save(*args, **kwargs)

    @classmethod
    def generate_number(cls):
        year = timezone.localdate().year
        prefix = f"OS-{year}-"
        last = cls.objects.filter(number__startswith=prefix).order_by("number").last()
        if not last:
            return f"{prefix}00001"
        try:
            sequence = int(last.number.replace(prefix, "")) + 1
        except ValueError:
            sequence = cls.objects.filter(number__startswith=prefix).count() + 1
        return f"{prefix}{sequence:05d}"

    def recalculate_totals(self, save=True):
        services_subtotal = sum((line.subtotal_amount for line in self.services.all()), ZERO)
        parts_subtotal = sum((line.subtotal_amount for line in self.parts.all()), ZERO)
        service_discounts = sum((line.discount_amount or ZERO for line in self.services.all()), ZERO)
        part_discounts = sum((line.discount_amount or ZERO for line in self.parts.all()), ZERO)
        paid_total = sum((payment.amount or ZERO for payment in self.payments.all()), ZERO)
        total_discount = service_discounts + part_discounts + (self.manual_discount_amount or ZERO)
        grand_total = services_subtotal + parts_subtotal - total_discount
        self.subtotal_services = services_subtotal
        self.subtotal_parts = parts_subtotal
        self.discount_total = total_discount
        self.grand_total = grand_total if grand_total > ZERO else ZERO
        self.paid_total = paid_total
        self.balance_due = self.grand_total - paid_total
        if save:
            self.save(update_fields=["subtotal_services", "subtotal_parts", "manual_discount_amount", "discount_total", "grand_total", "paid_total", "balance_due", "updated_at"])
        return self

    def __str__(self):
        return self.number or f"OS #{self.pk}"


class WorkOrderPhoto(TimeStampedModel):
    """Fotos de evidência vinculadas à OS, principalmente na abertura do veículo."""

    class PhotoType(models.TextChoices):
        OPENING = "opening", "Abertura / estado de entrada"
        DAMAGE = "damage", "Avaria pré-existente"
        ODOMETER = "odometer", "Hodômetro"
        DOCUMENT = "document", "Documento / etiqueta"
        DELIVERY = "delivery", "Entrega"
        OTHER = "other", "Outro"

    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name="photos")
    image = models.FileField(
        upload_to=work_order_photo_upload_path,
        validators=[FileExtensionValidator(allowed_extensions=IMAGE_EXTENSIONS)],
        verbose_name="Foto da OS",
    )
    photo_type = models.CharField(max_length=30, choices=PhotoType.choices, default=PhotoType.OPENING, db_index=True)
    caption = models.CharField(max_length=220, blank=True)
    taken_at = models.DateTimeField(default=timezone.now)
    uploaded_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="uploaded_work_order_photos")
    original_filename = models.CharField(max_length=180, blank=True)
    content_type = models.CharField(max_length=80, blank=True)
    file_size = models.PositiveIntegerField(default=0)
    sha256 = models.CharField(max_length=64, blank=True, db_index=True)
    is_customer_visible = models.BooleanField(default=True)

    class Meta:
        ordering = ["-taken_at", "-created_at"]
        indexes = [models.Index(fields=["work_order", "photo_type"], name="wo_photo_type_idx")]
        verbose_name = "foto de OS"
        verbose_name_plural = "fotos de OS"

    @property
    def image_url(self):
        return self.image.url if self.image else ""

    @property
    def uploaded_by_name(self):
        return self.uploaded_by.get_full_name() or self.uploaded_by.username if self.uploaded_by else ""

    def clean(self):
        super().clean()
        validate_file_size(self.image, MAX_IMAGE_SIZE, "foto da OS")

    def save(self, *args, **kwargs):
        if self.image:
            self.original_filename = self.original_filename or os.path.basename(getattr(self.image, "name", ""))[:180]
            self.file_size = getattr(self.image, "size", self.file_size or 0) or 0
            self.content_type = getattr(self.image, "content_type", self.content_type or "") or ""
            if not self.sha256 and hasattr(self.image, "chunks"):
                digest = hashlib.sha256()
                for chunk in self.image.chunks():
                    digest.update(chunk)
                self.sha256 = digest.hexdigest()
                try:
                    self.image.seek(0)
                except Exception:
                    pass
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.work_order} - {self.get_photo_type_display()}"


class WorkOrderService(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pendente"
        APPROVED = "approved", "Aprovado"
        IN_PROGRESS = "in_progress", "Em execucao"
        DONE = "done", "Concluido"
        CANCELLED = "cancelled", "Cancelado"

    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name="services")
    service = models.ForeignKey(WorkshopService, null=True, blank=True, on_delete=models.SET_NULL, related_name="work_order_lines")
    source_package = models.ForeignKey(ServicePackage, null=True, blank=True, on_delete=models.SET_NULL, related_name="work_order_service_lines")
    description = models.CharField(max_length=220)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("1.00"), validators=[MinValueValidator(Decimal("0.01"))])
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    technician = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="work_order_service_lines")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    notes = models.TextField(blank=True)
    technical_diagnosis = models.TextField(blank=True)
    execution_notes = models.TextField(blank=True)
    checklist = models.JSONField(default=dict, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    expected_minutes = models.PositiveIntegerField(default=0)
    actual_minutes = models.PositiveIntegerField(default=0)
    needs_quality_check = models.BooleanField(default=True)
    quality_checked_at = models.DateTimeField(null=True, blank=True)
    quality_check_notes = models.TextField(blank=True)
    quality_checked_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="quality_checked_service_lines")

    class Meta:
        ordering = ["id"]

    @property
    def subtotal_amount(self):
        return (self.quantity or ZERO) * (self.unit_price or ZERO)

    @property
    def total_amount(self):
        total = self.subtotal_amount - (self.discount_amount or ZERO)
        return total if total > ZERO else ZERO

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        if self.service:
            if not self.description:
                self.description = self.service.name
            if not self.unit_price:
                self.unit_price = self.service.default_unit_price
        super().save(*args, **kwargs)
        if is_new:
            self.create_checklist_from_template()
        self.work_order.recalculate_totals()

    def create_checklist_from_template(self):
        if not self.service_id:
            return 0
        profile = WorkshopProfile.get_solo()
        if not profile.technical_checklist_enabled:
            return 0
        if self.checklist_items.exists():
            return 0
        templates = self.service.checklist_templates.filter(is_active=True).order_by("sort_order", "id")
        items = [
            WorkOrderServiceChecklistItem(
                work_order=self.work_order,
                work_order_service=self,
                source_template=template,
                description=template.description,
                is_required=template.is_required,
                requires_photo=template.requires_photo,
                requires_note=template.requires_note,
                sort_order=template.sort_order,
            )
            for template in templates
        ]
        if items:
            WorkOrderServiceChecklistItem.objects.bulk_create(items)
        return len(items)

    def delete(self, *args, **kwargs):
        work_order = self.work_order
        result = super().delete(*args, **kwargs)
        work_order.recalculate_totals()
        return result

    def __str__(self):
        return self.description


class WorkOrderServiceChecklistItem(TimeStampedModel):
    """Snapshot do checklist técnico copiado para uma OS específica."""

    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name="technical_checklist_items")
    work_order_service = models.ForeignKey(WorkOrderService, on_delete=models.CASCADE, related_name="checklist_items")
    source_template = models.ForeignKey(WorkshopServiceChecklistTemplate, null=True, blank=True, on_delete=models.SET_NULL, related_name="work_order_items")
    description = models.CharField(max_length=220)
    is_required = models.BooleanField(default=True)
    requires_photo = models.BooleanField(default=False)
    requires_note = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)
    is_completed = models.BooleanField(default=False, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="completed_work_order_checklist_items")
    note = models.TextField(blank=True)
    photo = models.FileField(
        upload_to=work_order_checklist_photo_upload_path,
        blank=True,
        validators=[FileExtensionValidator(allowed_extensions=IMAGE_EXTENSIONS)],
        verbose_name="Foto do checklist",
    )

    class Meta:
        ordering = ["work_order_service_id", "sort_order", "id"]
        indexes = [
            models.Index(fields=["work_order", "is_completed"], name="wo_chk_completed_idx"),
            models.Index(fields=["work_order_service", "sort_order"], name="wo_chk_service_order_idx"),
        ]
        verbose_name = "item de checklist da OS"
        verbose_name_plural = "itens de checklist da OS"

    @property
    def photo_url(self):
        return self.photo.url if self.photo else ""

    @property
    def completed_by_name(self):
        return self.completed_by.get_full_name() or self.completed_by.username if self.completed_by else ""

    @property
    def is_blocking_pending(self):
        if not self.is_required:
            return False
        if not self.is_completed:
            return True
        if self.requires_note and not (self.note or "").strip():
            return True
        if self.requires_photo and not self.photo:
            return True
        return False

    def clean(self):
        super().clean()
        self.description = (self.description or "").strip()
        if not self.description:
            raise ValidationError({"description": "Informe a descrição do item."})
        if self.is_completed and self.requires_note and not (self.note or "").strip():
            raise ValidationError({"note": "Este item exige observação antes de ser concluído."})
        if self.is_completed and self.requires_photo and not self.photo:
            raise ValidationError({"photo": "Este item exige foto antes de ser concluído."})

    def save(self, *args, **kwargs):
        if self.is_completed and not self.completed_at:
            self.completed_at = timezone.now()
        if not self.is_completed:
            self.completed_at = None
            self.completed_by = None
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.work_order} - {self.description}"


class WorkOrderPart(TimeStampedModel):
    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name="parts")
    part = models.ForeignKey(Part, null=True, blank=True, on_delete=models.SET_NULL, related_name="work_order_lines")
    description = models.CharField(max_length=220)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("1.00"), validators=[MinValueValidator(Decimal("0.01"))])
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)])
    consume_inventory = models.BooleanField(default=True)
    stock_consumed_at = models.DateTimeField(null=True, blank=True)
    stock_movement = models.ForeignKey("PartStockMovement", null=True, blank=True, on_delete=models.SET_NULL, related_name="work_order_part_lines")
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["id"]

    @property
    def subtotal_amount(self):
        return (self.quantity or ZERO) * (self.unit_price or ZERO)

    @property
    def total_amount(self):
        total = self.subtotal_amount - (self.discount_amount or ZERO)
        return total if total > ZERO else ZERO

    def save(self, *args, **kwargs):
        if self.part:
            if not self.description:
                self.description = self.part.name
            if not self.unit_price:
                self.unit_price = self.part.sale_price
            if not self.cost_price:
                self.cost_price = self.part.cost_price
        super().save(*args, **kwargs)
        self.work_order.recalculate_totals()

    def delete(self, *args, **kwargs):
        work_order = self.work_order
        result = super().delete(*args, **kwargs)
        work_order.recalculate_totals()
        return result

    def __str__(self):
        return self.description


class WorkOrderPayment(TimeStampedModel):
    class Method(models.TextChoices):
        CASH = "cash", "Dinheiro"
        CARD = "card", "Cartao"
        BANK_TRANSFER = "bank_transfer", "Transferencia"
        MBWAY = "mbway", "MB Way"
        PIX = "pix", "Pix"
        OTHER = "other", "Outro"

    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name="payments")
    method = models.CharField(max_length=30, choices=Method.choices, default=Method.CASH)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    paid_at = models.DateTimeField(default=timezone.now)
    reference = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_work_order_payments")

    class Meta:
        ordering = ["-paid_at"]

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.work_order.recalculate_totals()

    def delete(self, *args, **kwargs):
        work_order = self.work_order
        result = super().delete(*args, **kwargs)
        work_order.recalculate_totals()
        return result

    def __str__(self):
        return f"{self.work_order} - {self.amount}"


class PartStockMovement(TimeStampedModel):
    class MovementType(models.TextChoices):
        PURCHASE = "purchase", "Entrada/compra"
        ADJUSTMENT = "adjustment", "Ajuste"
        CONSUMPTION = "consumption", "Consumo em OS"
        REVERSAL = "reversal", "Estorno"

    part = models.ForeignKey(Part, on_delete=models.CASCADE, related_name="stock_movements")
    movement_type = models.CharField(max_length=30, choices=MovementType.choices)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, help_text="Use positivo para entrada e negativo para saida.")
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    work_order = models.ForeignKey(WorkOrder, null=True, blank=True, on_delete=models.SET_NULL, related_name="stock_movements")
    notes = models.TextField(blank=True)
    actor = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="stock_movements")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.part} {self.quantity}"


class WorkOrderEvent(TimeStampedModel):
    class EventType(models.TextChoices):
        CREATED = "created", "Criada"
        UPDATED = "updated", "Atualizada"
        STATUS_CHANGED = "status_changed", "Status alterado"
        MESSAGE_SENT = "message_sent", "Mensagem enviada"
        PAYMENT_ADDED = "payment_added", "Pagamento registrado"
        INVENTORY_CONSUMED = "inventory_consumed", "Estoque consumido"
        PHOTO_ADDED = "photo_added", "Foto adicionada"
        SERVICE_STARTED = "service_started", "Servico iniciado"
        SERVICE_FINISHED = "service_finished", "Servico concluido"
        SERVICE_QUALITY_CHECKED = "service_quality_checked", "Servico conferido"
        CHECKLIST_UPDATED = "checklist_updated", "Checklist atualizado"
        DELIVERY_SIGNED = "delivery_signed", "Entrega assinada"
        NOTE = "note", "Nota"
        ERROR = "error", "Erro"

    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=40, choices=EventType.choices)
    old_status = models.CharField(max_length=30, blank=True)
    new_status = models.CharField(max_length=30, blank=True)
    description = models.TextField(blank=True)
    data = models.JSONField(default=dict, blank=True)
    actor = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="work_order_events")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.work_order} - {self.event_type}"


class WorkOrderCustomerApproval(TimeStampedModel):
    """Link público e auditável para aprovação digital de OS/orçamento pelo cliente."""

    class DocumentType(models.TextChoices):
        ESTIMATE = "estimate", "Orçamento"
        WORK_ORDER = "work_order", "Ordem de serviço"
        RECEIPT = "receipt", "Recibo"

    class Status(models.TextChoices):
        PENDING = "pending", "Pendente"
        APPROVED = "approved", "Aprovado"
        REJECTED = "rejected", "Recusado"
        EXPIRED = "expired", "Expirado"

    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name="customer_approvals")
    document_type = models.CharField(max_length=20, choices=DocumentType.choices, default=DocumentType.ESTIMATE, db_index=True)
    token = models.UUIDField(default=uuid4, unique=True, editable=False, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    requested_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="requested_work_order_approvals")
    requested_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(null=True, blank=True)
    customer_name_snapshot = models.CharField(max_length=180, blank=True)
    customer_email_snapshot = models.EmailField(blank=True)
    customer_phone_snapshot = models.CharField(max_length=30, blank=True)
    decision_name = models.CharField(max_length=180, blank=True)
    decision_document = models.CharField(max_length=30, blank=True)
    decision_notes = models.TextField(blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_ip = models.GenericIPAddressField(null=True, blank=True)
    decision_user_agent = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-requested_at", "-id"]
        indexes = [
            models.Index(fields=["work_order", "status"], name="wo_approval_status_idx"),
            models.Index(fields=["token", "status"], name="wo_approval_token_idx"),
        ]
        verbose_name = "aprovação digital de OS"
        verbose_name_plural = "aprovações digitais de OS"

    @property
    def document_type_label(self):
        return self.get_document_type_display()

    @property
    def status_label(self):
        current_status = self.effective_status
        return dict(self.Status.choices).get(current_status, current_status)

    @property
    def public_url_path(self):
        return f"/aprovar-os/{self.token}"

    @property
    def is_expired(self):
        return bool(self.expires_at and timezone.now() > self.expires_at and self.status == self.Status.PENDING)

    @property
    def effective_status(self):
        if self.is_expired:
            return self.Status.EXPIRED
        return self.status

    @property
    def can_decide(self):
        return self.is_active and self.effective_status == self.Status.PENDING

    def mark_decision(self, status, name="", document="", notes="", ip_address=None, user_agent=""):
        if status not in {self.Status.APPROVED, self.Status.REJECTED}:
            raise ValidationError({"status": "Decisão inválida para aprovação digital."})
        if not self.can_decide:
            raise ValidationError({"status": "Este link não está mais disponível para decisão."})
        self.status = status
        self.decision_name = (name or "").strip()[:180]
        self.decision_document = (document or "").strip()[:30]
        self.decision_notes = (notes or "").strip()
        self.decision_ip = ip_address
        self.decision_user_agent = (user_agent or "")[:2000]
        self.decided_at = timezone.now()
        self.save(update_fields=["status", "decision_name", "decision_document", "decision_notes", "decision_ip", "decision_user_agent", "decided_at", "updated_at"])
        return self

    def save(self, *args, **kwargs):
        if self.work_order_id and not self.customer_name_snapshot:
            self.customer_name_snapshot = self.work_order.customer.full_name
        if self.work_order_id and not self.customer_email_snapshot:
            self.customer_email_snapshot = self.work_order.customer.email or ""
        if self.work_order_id and not self.customer_phone_snapshot:
            self.customer_phone_snapshot = self.work_order.customer.phone_e164 or self.work_order.customer.secondary_phone_e164 or ""
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.get_document_type_display()} {self.work_order.number} - {self.status_label}"


class WorkOrderDeliverySignature(TimeStampedModel):
    """Assinatura digital de entrega da OS."""

    work_order = models.OneToOneField(WorkOrder, on_delete=models.CASCADE, related_name="delivery_signature")
    recipient_name = models.CharField(max_length=180)
    recipient_document = models.CharField(max_length=30, blank=True)
    notes = models.TextField(blank=True)
    signature_image = models.FileField(
        upload_to=work_order_signature_upload_path,
        validators=[FileExtensionValidator(allowed_extensions=IMAGE_EXTENSIONS)],
        verbose_name="Imagem da assinatura",
    )
    signed_at = models.DateTimeField(default=timezone.now)
    signed_ip = models.GenericIPAddressField(null=True, blank=True)
    signed_user_agent = models.TextField(blank=True)
    signed_by_user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="signed_work_order_deliveries")

    class Meta:
        ordering = ["-signed_at"]
        verbose_name = "assinatura de entrega da OS"
        verbose_name_plural = "assinaturas de entrega da OS"

    @property
    def signature_url(self):
        return self.signature_image.url if self.signature_image else ""

    @property
    def signed_by_name(self):
        return self.signed_by_user.get_full_name() or self.signed_by_user.username if self.signed_by_user else ""

    def clean(self):
        super().clean()
        self.recipient_name = (self.recipient_name or "").strip()
        if not self.recipient_name:
            raise ValidationError({"recipient_name": "Informe o nome de quem recebeu o veículo/serviço."})
        if not self.signature_image:
            raise ValidationError({"signature_image": "A assinatura digital é obrigatória."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Entrega {self.work_order.number} - {self.recipient_name}"


class WorkOrderNotificationRule(TimeStampedModel):
    name = models.CharField(max_length=160)
    trigger_status = models.CharField(max_length=30, choices=WorkOrder.Status.choices)
    channel = models.CharField(max_length=20, choices=MessageTemplate.Channel.choices)
    template = models.ForeignKey(MessageTemplate, on_delete=models.PROTECT, related_name="work_order_notification_rules")
    is_active = models.BooleanField(default=True)
    send_once_per_status = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_work_order_notification_rules")

    class Meta:
        ordering = ["trigger_status", "channel", "name"]

    def __str__(self):
        return self.name


class WorkOrderMessage(TimeStampedModel):
    class TriggerType(models.TextChoices):
        MANUAL = "manual", "Manual"
        STATUS_AUTO = "status_auto", "Automatico por status"

    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name="messages")
    trigger_type = models.CharField(max_length=30, choices=TriggerType.choices, default=TriggerType.MANUAL)
    trigger_status = models.CharField(max_length=30, blank=True)
    channel = models.CharField(max_length=20, choices=MessageTemplate.Channel.choices)
    template = models.ForeignKey(MessageTemplate, null=True, blank=True, on_delete=models.SET_NULL, related_name="work_order_messages")
    notification_rule = models.ForeignKey(WorkOrderNotificationRule, null=True, blank=True, on_delete=models.SET_NULL, related_name="messages")
    message_log = models.ForeignKey(MessageLog, null=True, blank=True, on_delete=models.SET_NULL, related_name="work_order_messages")
    status = models.CharField(max_length=20, blank=True)
    error_message = models.TextField(blank=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_work_order_messages")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.work_order} - {self.channel} - {self.status}"
