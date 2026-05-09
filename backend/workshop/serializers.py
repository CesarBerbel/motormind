from .state_machine import available_status_transitions
from decimal import Decimal
import base64
import binascii
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from rest_framework import serializers

from messaging.models import Contact, MessageTemplate
from messaging.serializers import ContactSerializer, MessageLogSerializer, format_cep, format_cpf_cnpj, normalize_br_phone_e164, only_digits

from .models import (
    GeneralCategory,
    WorkshopProfile,
    PartBrand,
    PART_UNIT_CHOICES,
    normalize_lookup_name,
    normalize_part_unit,
    Part,
    PartStockMovement,
    ServicePackage,
    ServicePackageItem,
    Vehicle,
    WorkOrder,
    WorkOrderPhoto,
    WorkOrderEvent,
    WorkOrderCustomerApproval,
    WorkOrderDeliverySignature,
    WorkOrderMessage,
    WorkOrderNotificationRule,
    WorkOrderPart,
    WorkOrderPayment,
    WorkOrderService,
    WorkOrderServiceChecklistItem,
    WorkshopService,
    WorkshopServiceChecklistTemplate,
)

User = get_user_model()


class WorkshopProfileSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)
    address_display = serializers.CharField(read_only=True)
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = WorkshopProfile
        fields = [
            "id",
            "legal_name",
            "trade_name",
            "display_name",
            "document_number",
            "state_registration",
            "municipal_registration",
            "logo",
            "logo_url",
            "email",
            "phone_e164",
            "secondary_phone_e164",
            "website",
            "zip_code",
            "address_line",
            "address_number",
            "address_complement",
            "district",
            "city",
            "state",
            "country",
            "address_display",
            "responsible_name",
            "print_header_text",
            "print_footer_text",
            "estimate_terms",
            "work_order_terms",
            "purchase_order_terms",
            "bank_info",
            "pix_key",
            "technical_checklist_enabled",
            "delivery_signature_enabled",
            "landing_enabled",
            "landing_headline",
            "landing_subheadline",
            "landing_cta_label",
            "landing_highlight_text",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "display_name", "address_display", "logo_url", "created_at", "updated_at"]

    def get_logo_url(self, obj):
        if not obj.logo:
            return ""
        request = self.context.get("request")
        url = obj.logo.url
        return request.build_absolute_uri(url) if request else url

    def validate_legal_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Informe a razão social ou nome principal da oficina.")
        return value

    def validate_document_number(self, value):
        digits = "".join(ch for ch in (value or "") if ch.isdigit())
        if digits and len(digits) not in (11, 14):
            raise serializers.ValidationError("Informe CPF com 11 dígitos ou CNPJ com 14 dígitos.")
        return format_cpf_cnpj(digits) if digits else ""

    def validate_zip_code(self, value):
        digits = "".join(ch for ch in (value or "") if ch.isdigit())
        if digits and len(digits) != 8:
            raise serializers.ValidationError("Informe CEP com 8 dígitos.")
        return format_cep(digits) if digits else ""

    def validate_phone_e164(self, value):
        return normalize_br_phone_e164(value) if value else ""

    def validate_secondary_phone_e164(self, value):
        return normalize_br_phone_e164(value) if value else ""

    def validate_state(self, value):
        return (value or "").strip().upper()[:2]

    def validate_logo(self, value):
        if value and value.size > 3 * 1024 * 1024:
            raise serializers.ValidationError("A logomarca deve ter no máximo 3 MB.")
        return value


class PublicLandingSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)
    address_display = serializers.CharField(read_only=True)
    logo_url = serializers.SerializerMethodField()
    featured_services = serializers.SerializerMethodField()

    class Meta:
        model = WorkshopProfile
        fields = [
            "display_name",
            "legal_name",
            "trade_name",
            "logo_url",
            "email",
            "phone_e164",
            "secondary_phone_e164",
            "website",
            "address_display",
            "landing_enabled",
            "landing_headline",
            "landing_subheadline",
            "landing_cta_label",
            "landing_highlight_text",
            "featured_services",
        ]

    def get_logo_url(self, obj):
        if not obj.logo:
            return ""
        request = self.context.get("request")
        url = obj.logo.url
        return request.build_absolute_uri(url) if request else url

    def get_featured_services(self, obj):
        request = self.context.get("request")
        services = WorkshopService.objects.filter(is_active=True, is_featured=True).order_by("name")[:6]
        return WorkshopServiceSerializer(services, many=True, context={"request": request}).data


class WorkshopServiceChecklistTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkshopServiceChecklistTemplate
        fields = ["id", "service", "description", "is_required", "requires_photo", "requires_note", "sort_order", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_description(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Informe a descrição do item do checklist.")
        return value


class GeneralCategorySerializer(serializers.ModelSerializer):
    type_label = serializers.CharField(read_only=True)

    class Meta:
        model = GeneralCategory
        fields = ["id", "type", "type_label", "code", "name", "description", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "type_label", "created_at", "updated_at"]

    def validate_code(self, value):
        return (value or "").strip().upper()

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Informe o nome da categoria.")
        return value


class PartBrandSerializer(serializers.ModelSerializer):
    source_label = serializers.CharField(source="get_source_display", read_only=True)

    class Meta:
        model = PartBrand
        fields = ["id", "name", "normalized_name", "source", "source_label", "is_active", "notes", "created_at", "updated_at"]
        read_only_fields = ["id", "normalized_name", "source_label", "created_at", "updated_at"]

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Informe o nome da marca.")
        normalized = normalize_lookup_name(value)
        queryset = PartBrand.objects.filter(normalized_name=normalized)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("Já existe uma marca com este nome normalizado.")
        return value


class VehicleSerializer(serializers.ModelSerializer):
    customer_id = serializers.PrimaryKeyRelatedField(source="customer", queryset=Contact.objects.all(), write_only=True)
    customer = ContactSerializer(read_only=True)
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    display_name = serializers.CharField(read_only=True)
    has_fipe_link = serializers.BooleanField(read_only=True)

    class Meta:
        model = Vehicle
        fields = [
            "id",
            "customer",
            "customer_id",
            "customer_name",
            "plate",
            "make",
            "model",
            "version",
            "year",
            "color",
            "vin",
            "odometer_km",
            "fipe_brand_code",
            "fipe_model_code",
            "fipe_year_code",
            "has_fipe_link",
            "notes",
            "is_active",
            "display_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "customer", "customer_name", "has_fipe_link", "display_name", "created_at", "updated_at"]

    def validate_plate(self, value):
        return (value or "").strip().upper().replace("-", "").replace(" ", "")

    def validate_make(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Informe a marca do veículo.")
        return value

    def validate_model(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Informe o modelo do veículo.")
        return value

    def validate_vin(self, value):
        return (value or "").strip().upper()

    def validate_fipe_brand_code(self, value):
        return (value or "").strip()

    def validate_fipe_model_code(self, value):
        return (value or "").strip()

    def validate_fipe_year_code(self, value):
        return (value or "").strip()

    def validate(self, attrs):
        fipe_brand_code = attrs.get("fipe_brand_code", getattr(self.instance, "fipe_brand_code", ""))
        fipe_model_code = attrs.get("fipe_model_code", getattr(self.instance, "fipe_model_code", ""))
        fipe_year_code = attrs.get("fipe_year_code", getattr(self.instance, "fipe_year_code", ""))

        if fipe_model_code and not fipe_brand_code:
            raise serializers.ValidationError({"fipe_model_code": "Para salvar modelo FIPE, informe também a marca FIPE."})
        if fipe_year_code and not fipe_model_code:
            raise serializers.ValidationError({"fipe_year_code": "Para salvar ano/versão FIPE, informe também o modelo FIPE."})
        return attrs


class WorkshopServiceSerializer(serializers.ModelSerializer):
    checklist_templates = WorkshopServiceChecklistTemplateSerializer(many=True, read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(source="category", queryset=GeneralCategory.objects.filter(type=GeneralCategory.CategoryType.SERVICE, is_active=True), required=False, allow_null=True, write_only=True)
    category_name = serializers.CharField(read_only=True)
    photo_url = serializers.SerializerMethodField()
    remove_photo = serializers.BooleanField(write_only=True, required=False, default=False)
    usage_count = serializers.SerializerMethodField()

    def get_photo_url(self, obj):
        if not obj.photo:
            return ""
        request = self.context.get("request")
        url = obj.photo.url
        return request.build_absolute_uri(url) if request else url

    def get_usage_count(self, obj):
        return int(getattr(obj, "usage_count", 0) or 0)

    def validate_code(self, value):
        value = (value or "").strip().upper()
        return value or None

    def validate_photo(self, value):
        if value and value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("A foto do serviço deve ter no máximo 5 MB.")
        return value

    def validate_is_featured(self, value):
        return bool(value)

    def create(self, validated_data):
        validated_data.pop("remove_photo", None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        remove_photo = validated_data.pop("remove_photo", False)
        if remove_photo and instance.photo:
            instance.photo.delete(save=False)
            validated_data["photo"] = ""
        return super().update(instance, validated_data)

    class Meta:
        model = WorkshopService
        fields = ["id", "code", "name", "category", "category_id", "category_name", "legacy_category_name", "photo", "photo_url", "remove_photo", "description", "default_unit_price", "estimated_hours", "is_featured", "usage_count", "checklist_templates", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "category", "category_name", "photo_url", "usage_count", "checklist_templates", "created_at", "updated_at"]




class ServicePackageItemSerializer(serializers.ModelSerializer):
    service_id = serializers.PrimaryKeyRelatedField(source="service", queryset=WorkshopService.objects.all(), required=False, allow_null=True, write_only=True)
    service_code = serializers.CharField(source="service.code", read_only=True)
    service_name = serializers.CharField(source="service.name", read_only=True)
    service_category_name = serializers.CharField(source="service.category_name", read_only=True)
    subtotal_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = ServicePackageItem
        fields = ["id", "service", "service_id", "service_code", "service_name", "service_category_name", "description", "quantity", "unit_price", "position", "subtotal_amount", "total_amount", "created_at", "updated_at"]
        read_only_fields = ["id", "service", "service_code", "service_name", "service_category_name", "subtotal_amount", "total_amount", "created_at", "updated_at"]

    def validate(self, attrs):
        service = attrs.get("service")
        if service:
            attrs.setdefault("description", service.name)
            attrs.setdefault("unit_price", service.default_unit_price)
        if not attrs.get("description") and not getattr(self.instance, "description", ""):
            raise serializers.ValidationError({"description": "Informe a descricao do item do pacote."})
        return attrs


class ServicePackageSerializer(serializers.ModelSerializer):
    items = ServicePackageItemSerializer(many=True, required=False)
    subtotal_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    discount_amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.00"), default=Decimal("0.00"))
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = ServicePackage
        fields = ["id", "code", "name", "description", "is_active", "items", "subtotal_amount", "discount_amount", "total_amount", "created_at", "updated_at"]
        read_only_fields = ["id", "subtotal_amount", "total_amount", "created_at", "updated_at"]

    def validate_code(self, value):
        value = (value or "").strip().upper()
        return value or None

    def _sync_items(self, package, items_data):
        package.items.all().delete()
        for index, item_data in enumerate(items_data, start=1):
            position = item_data.pop("position", None) or index
            ServicePackageItem.objects.create(service_package=package, position=position, **item_data)

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        package = ServicePackage.objects.create(**validated_data)
        self._sync_items(package, items_data)
        return package

    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if items_data is not None:
            self._sync_items(instance, items_data)
        return instance


class PartSerializer(serializers.ModelSerializer):
    category_id = serializers.PrimaryKeyRelatedField(source="category", queryset=GeneralCategory.objects.filter(type=GeneralCategory.CategoryType.PART, is_active=True), required=False, allow_null=True, write_only=True)
    category_name = serializers.CharField(read_only=True)
    brand_normalized_name = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()
    remove_photo = serializers.BooleanField(write_only=True, required=False, default=False)
    is_low_stock = serializers.BooleanField(read_only=True)
    stock_value = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    usage_count = serializers.SerializerMethodField()
    unit_label = serializers.SerializerMethodField()

    def get_usage_count(self, obj):
        return int(getattr(obj, "usage_count", 0) or 0)

    def get_unit_label(self, obj):
        unit = normalize_part_unit(obj.unit)
        labels = dict(PART_UNIT_CHOICES)
        return labels.get(unit, unit)

    class Meta:
        model = Part
        fields = ["id", "sku", "name", "category", "category_id", "category_name", "brand", "brand_normalized_name", "photo", "photo_url", "remove_photo", "location", "unit", "unit_label", "cost_price", "sale_price", "stock_quantity", "minimum_stock", "is_low_stock", "stock_value", "is_featured", "usage_count", "is_active", "notes", "created_at", "updated_at"]
        read_only_fields = ["id", "category", "category_name", "brand_normalized_name", "photo_url", "unit_label", "is_low_stock", "stock_value", "usage_count", "created_at", "updated_at"]

    def get_brand_normalized_name(self, obj):
        return normalize_lookup_name(obj.brand) if obj.brand else ""

    def get_photo_url(self, obj):
        if not obj.photo:
            return ""
        request = self.context.get("request")
        url = obj.photo.url
        return request.build_absolute_uri(url) if request else url

    def validate_photo(self, value):
        if value and value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("A foto da peça deve ter no máximo 5 MB.")
        return value

    def validate_sku(self, value):
        return (value or "").strip().upper()

    def validate_unit(self, value):
        normalized = normalize_part_unit(value)
        allowed_units = {unit_value for unit_value, _label in PART_UNIT_CHOICES}
        if normalized not in allowed_units:
            raise serializers.ValidationError("Selecione uma unidade cadastrada na lista controlada.")
        return normalized

    def validate_is_featured(self, value):
        return bool(value)

    def validate_brand(self, value):
        return (value or "").strip()

    def _sync_brand(self, validated_data):
        if "brand" not in validated_data:
            return
        brand_name = (validated_data.get("brand") or "").strip()
        if not brand_name:
            validated_data["brand"] = ""
            return
        brand, _ = PartBrand.get_or_create_from_name(brand_name)
        validated_data["brand"] = brand.name

    def create(self, validated_data):
        validated_data.pop("remove_photo", None)
        self._sync_brand(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        remove_photo = validated_data.pop("remove_photo", False)
        if remove_photo and instance.photo:
            instance.photo.delete(save=False)
            validated_data["photo"] = ""
        self._sync_brand(validated_data)
        return super().update(instance, validated_data)


class PartStockMovementSerializer(serializers.ModelSerializer):
    part_name = serializers.CharField(source="part.name", read_only=True)
    work_order_number = serializers.CharField(source="work_order.number", read_only=True)
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = PartStockMovement
        fields = ["id", "part", "part_name", "movement_type", "quantity", "unit_cost", "work_order", "work_order_number", "notes", "actor_name", "created_at"]
        read_only_fields = fields

    def get_actor_name(self, obj):
        return obj.actor.get_full_name() or obj.actor.username if obj.actor else ""


class StockAdjustmentSerializer(serializers.Serializer):
    movement_type = serializers.ChoiceField(choices=[(PartStockMovement.MovementType.PURCHASE, "Entrada/compra"), (PartStockMovement.MovementType.ADJUSTMENT, "Ajuste"), (PartStockMovement.MovementType.REVERSAL, "Estorno")], default=PartStockMovement.MovementType.ADJUSTMENT)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=2)
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_quantity(self, value):
        if value == Decimal("0.00"):
            raise serializers.ValidationError("Quantidade nao pode ser zero.")
        return value


class WorkOrderServiceChecklistItemSerializer(serializers.ModelSerializer):
    photo_url = serializers.SerializerMethodField()
    completed_by_name = serializers.CharField(read_only=True)
    work_order_service_description = serializers.CharField(source="work_order_service.description", read_only=True)

    class Meta:
        model = WorkOrderServiceChecklistItem
        fields = [
            "id",
            "work_order",
            "work_order_service",
            "work_order_service_description",
            "source_template",
            "description",
            "is_required",
            "requires_photo",
            "requires_note",
            "sort_order",
            "is_completed",
            "completed_at",
            "completed_by",
            "completed_by_name",
            "note",
            "photo",
            "photo_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "work_order",
            "source_template",
            "completed_at",
            "completed_by",
            "completed_by_name",
            "photo_url",
            "created_at",
            "updated_at",
        ]

    def get_photo_url(self, obj):
        if not obj.photo:
            return ""
        request = self.context.get("request")
        url = obj.photo.url
        return request.build_absolute_uri(url) if request else url

    def validate(self, attrs):
        is_completed = attrs.get("is_completed", getattr(self.instance, "is_completed", False))
        requires_note = attrs.get("requires_note", getattr(self.instance, "requires_note", False))
        requires_photo = attrs.get("requires_photo", getattr(self.instance, "requires_photo", False))
        note = attrs.get("note", getattr(self.instance, "note", ""))
        photo = attrs.get("photo", getattr(self.instance, "photo", None))
        if is_completed and requires_note and not (note or "").strip():
            raise serializers.ValidationError({"note": "Este item exige observação antes de ser concluído."})
        if is_completed and requires_photo and not photo:
            raise serializers.ValidationError({"photo": "Este item exige foto antes de ser concluído."})
        return attrs


class WorkOrderServiceSerializer(serializers.ModelSerializer):
    checklist_items = WorkOrderServiceChecklistItemSerializer(many=True, read_only=True)
    work_order_number = serializers.CharField(source="work_order.number", read_only=True)
    work_order_title = serializers.CharField(source="work_order.title", read_only=True)
    work_order_status = serializers.CharField(source="work_order.status", read_only=True)
    work_order_status_label = serializers.CharField(source="work_order.status_label", read_only=True)
    customer_name = serializers.CharField(source="work_order.customer.full_name", read_only=True)
    vehicle_display = serializers.CharField(source="work_order.vehicle.display_name", read_only=True)
    service_id = serializers.PrimaryKeyRelatedField(source="service", queryset=WorkshopService.objects.all(), required=False, allow_null=True, write_only=True)
    service_name = serializers.CharField(source="service.name", read_only=True)
    source_package_id = serializers.PrimaryKeyRelatedField(source="source_package", queryset=ServicePackage.objects.all(), required=False, allow_null=True, write_only=True)
    source_package_name = serializers.CharField(source="source_package.name", read_only=True)
    technician_id = serializers.PrimaryKeyRelatedField(source="technician", queryset=User.objects.all(), required=False, allow_null=True, write_only=True)
    technician_name = serializers.SerializerMethodField()
    subtotal_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    duration_label = serializers.SerializerMethodField()

    class Meta:
        model = WorkOrderService
        fields = [
            "id",
            "work_order",
            "work_order_number",
            "work_order_title",
            "work_order_status",
            "work_order_status_label",
            "customer_name",
            "vehicle_display",
            "service",
            "service_id",
            "service_name",
            "source_package",
            "source_package_id",
            "source_package_name",
            "description",
            "quantity",
            "unit_price",
            "discount_amount",
            "technician",
            "technician_id",
            "technician_name",
            "status",
            "notes",
            "technical_diagnosis",
            "execution_notes",
            "checklist",
            "checklist_items",
            "started_at",
            "finished_at",
            "expected_minutes",
            "actual_minutes",
            "duration_label",
            "needs_quality_check",
            "quality_checked_at",
            "quality_check_notes",
            "quality_checked_by",
            "subtotal_amount",
            "total_amount",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "service",
            "source_package",
            "technician",
            "work_order_number",
            "work_order_title",
            "work_order_status",
            "work_order_status_label",
            "customer_name",
            "vehicle_display",
            "service_name",
            "source_package_name",
            "technician_name",
            "started_at",
            "finished_at",
            "actual_minutes",
            "duration_label",
            "checklist_items",
            "quality_checked_at",
            "quality_checked_by",
            "subtotal_amount",
            "total_amount",
            "created_at",
            "updated_at",
        ]

    def get_technician_name(self, obj):
        return obj.technician.get_full_name() or obj.technician.username if obj.technician else ""

    def get_duration_label(self, obj):
        minutes = obj.actual_minutes or 0
        if not minutes and obj.started_at and not obj.finished_at:
            from django.utils import timezone

            minutes = max(int((timezone.now() - obj.started_at).total_seconds() // 60), 0)
        if not minutes:
            return ""
        hours, remaining = divmod(minutes, 60)
        return f"{hours}h {remaining:02d}min" if hours else f"{remaining}min"

    def validate(self, attrs):
        service = attrs.get("service")
        if service:
            attrs.setdefault("description", service.name)
            attrs.setdefault("unit_price", service.default_unit_price)
        if not attrs.get("description") and not getattr(self.instance, "description", ""):
            raise serializers.ValidationError({"description": "Informe a descricao do servico."})
        checklist = attrs.get("checklist")
        if checklist is not None and not isinstance(checklist, dict):
            raise serializers.ValidationError({"checklist": "O checklist tecnico deve ser um objeto JSON."})
        return attrs


class StartWorkOrderServiceSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True)


class CompleteWorkOrderServiceSerializer(serializers.Serializer):
    technical_diagnosis = serializers.CharField(required=False, allow_blank=True)
    execution_notes = serializers.CharField(required=True, allow_blank=False)
    checklist = serializers.JSONField(required=False)
    mark_order_quality_check = serializers.BooleanField(default=True)

    def validate_checklist(self, value):
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("Informe o checklist como objeto JSON.")
        return value


class QualityCheckWorkOrderServiceSerializer(serializers.Serializer):
    approved = serializers.BooleanField(default=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class WorkOrderPartSerializer(serializers.ModelSerializer):
    work_order_number = serializers.CharField(source="work_order.number", read_only=True)
    part_id = serializers.PrimaryKeyRelatedField(source="part", queryset=Part.objects.all(), required=False, allow_null=True, write_only=True)
    part_name = serializers.CharField(source="part.name", read_only=True)
    part_sku = serializers.CharField(source="part.sku", read_only=True)
    subtotal_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    stock_consumed = serializers.SerializerMethodField()

    class Meta:
        model = WorkOrderPart
        fields = ["id", "work_order", "work_order_number", "part", "part_id", "part_name", "part_sku", "description", "quantity", "unit_price", "cost_price", "discount_amount", "consume_inventory", "stock_consumed_at", "stock_consumed", "stock_movement", "notes", "subtotal_amount", "total_amount", "created_at", "updated_at"]
        read_only_fields = ["id", "part", "work_order_number", "part_name", "part_sku", "stock_consumed_at", "stock_consumed", "stock_movement", "subtotal_amount", "total_amount", "created_at", "updated_at"]

    def get_stock_consumed(self, obj):
        return bool(obj.stock_consumed_at)

    def validate(self, attrs):
        part = attrs.get("part")
        if part:
            attrs.setdefault("description", part.name)
            attrs.setdefault("unit_price", part.sale_price)
            attrs.setdefault("cost_price", part.cost_price)
        if not attrs.get("description") and not getattr(self.instance, "description", ""):
            raise serializers.ValidationError({"description": "Informe a descricao da peca."})
        return attrs


class WorkOrderPaymentSerializer(serializers.ModelSerializer):
    work_order_number = serializers.CharField(source="work_order.number", read_only=True)
    method_label = serializers.CharField(source="get_method_display", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = WorkOrderPayment
        fields = ["id", "work_order", "work_order_number", "method", "method_label", "amount", "paid_at", "reference", "notes", "created_by_name", "created_at", "updated_at"]
        read_only_fields = ["id", "work_order_number", "method_label", "created_by_name", "created_at", "updated_at"]

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username if obj.created_by else ""


class WorkOrderPhotoSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    photo_type_label = serializers.CharField(source="get_photo_type_display", read_only=True)
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = WorkOrderPhoto
        fields = [
            "id",
            "work_order",
            "image",
            "image_url",
            "photo_type",
            "photo_type_label",
            "caption",
            "taken_at",
            "uploaded_by_name",
            "original_filename",
            "content_type",
            "file_size",
            "sha256",
            "is_customer_visible",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "image_url", "photo_type_label", "uploaded_by_name", "original_filename", "content_type", "file_size", "sha256", "created_at", "updated_at"]

    def get_image_url(self, obj):
        if not obj.image:
            return ""
        request = self.context.get("request")
        url = obj.image.url
        return request.build_absolute_uri(url) if request else url

    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.get_full_name() or obj.uploaded_by.username if obj.uploaded_by else ""

    def validate_image(self, value):
        if value and value.size > 8 * 1024 * 1024:
            raise serializers.ValidationError("A foto da OS deve ter no máximo 8 MB.")
        return value

    def validate_caption(self, value):
        return (value or "").strip()


class WorkOrderEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = WorkOrderEvent
        fields = ["id", "work_order", "event_type", "old_status", "new_status", "description", "data", "actor_name", "created_at"]
        read_only_fields = fields

    def get_actor_name(self, obj):
        return obj.actor.get_full_name() or obj.actor.username if obj.actor else ""


class WorkOrderMessageSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source="template.name", read_only=True)
    message_log_status = serializers.CharField(source="message_log.status", read_only=True)
    message_log_detail = MessageLogSerializer(source="message_log", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = WorkOrderMessage
        fields = ["id", "work_order", "trigger_type", "trigger_status", "channel", "recipient_target", "template", "template_name", "notification_rule", "message_log", "message_log_status", "message_log_detail", "status", "error_message", "created_by_name", "created_at"]
        read_only_fields = fields

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username if obj.created_by else ""


class WorkOrderNotificationRuleSerializer(serializers.ModelSerializer):
    template_id = serializers.PrimaryKeyRelatedField(source="template", queryset=MessageTemplate.objects.all(), write_only=True)
    template_name = serializers.CharField(source="template.name", read_only=True)

    class Meta:
        model = WorkOrderNotificationRule
        fields = ["id", "name", "trigger_status", "channel", "template", "template_id", "template_name", "recipient_target", "is_active", "send_once_per_status", "created_at", "updated_at"]
        read_only_fields = ["id", "template", "template_name", "created_at", "updated_at"]

    def validate(self, attrs):
        template = attrs.get("template", getattr(self.instance, "template", None))
        channel = attrs.get("channel", getattr(self.instance, "channel", None))
        if template and channel and template.channel != channel:
            raise serializers.ValidationError({"channel": "O canal da regra precisa ser igual ao canal do template."})
        return attrs




class InitialWorkOrderServiceItemSerializer(serializers.Serializer):
    service_id = serializers.PrimaryKeyRelatedField(source="service", queryset=WorkshopService.objects.filter(is_active=True), required=False, allow_null=True)
    source_package_id = serializers.PrimaryKeyRelatedField(source="source_package", queryset=ServicePackage.objects.filter(is_active=True), required=False, allow_null=True)
    description = serializers.CharField(required=False, allow_blank=True, max_length=220)
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"), default=Decimal("1.00"))
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.00"), default=Decimal("0.00"))
    discount_amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.00"), default=Decimal("0.00"))
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        service = attrs.get("service")
        if service:
            attrs.setdefault("description", service.name)
            attrs.setdefault("unit_price", service.default_unit_price)
        if not attrs.get("description"):
            raise serializers.ValidationError({"description": "Informe a descricao do servico inicial."})
        return attrs


class WorkOrderSerializer(serializers.ModelSerializer):
    customer_id = serializers.PrimaryKeyRelatedField(source="customer", queryset=Contact.objects.all(), write_only=True)
    vehicle_id = serializers.PrimaryKeyRelatedField(source="vehicle", queryset=Vehicle.objects.all(), required=False, allow_null=True, write_only=True)
    assigned_to_id = serializers.PrimaryKeyRelatedField(source="assigned_to", queryset=User.objects.all(), required=False, allow_null=True, write_only=True)
    reference_work_order_id = serializers.PrimaryKeyRelatedField(source="reference_work_order", queryset=WorkOrder.objects.all(), required=False, allow_null=True, write_only=True)
    customer = ContactSerializer(read_only=True)
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    vehicle = VehicleSerializer(read_only=True)
    vehicle_display = serializers.CharField(source="vehicle.display_name", read_only=True)
    assigned_to_name = serializers.SerializerMethodField()
    reference_work_order = serializers.PrimaryKeyRelatedField(read_only=True)
    reference_work_order_number = serializers.CharField(source="reference_work_order.number", read_only=True)
    status_label = serializers.CharField(read_only=True)
    priority_label = serializers.CharField(read_only=True)
    order_type_label = serializers.CharField(read_only=True)
    initial_service_items = InitialWorkOrderServiceItemSerializer(many=True, write_only=True, required=False)
    account_receivable_summary = serializers.SerializerMethodField()
    available_status_transitions = serializers.SerializerMethodField()

    class Meta:
        model = WorkOrder
        fields = ["id", "number", "customer", "customer_id", "customer_name", "vehicle", "vehicle_id", "vehicle_display", "title", "complaint", "diagnosis", "solution", "internal_notes", "customer_notes", "status", "status_label", "priority", "priority_label", "order_type", "order_type_label", "reference_work_order", "reference_work_order_id", "reference_work_order_number", "mileage_in", "mileage_out", "promised_at", "opened_at", "approved_at", "started_at", "completed_at", "delivered_at", "cancelled_at", "assigned_to", "assigned_to_id", "assigned_to_name", "subtotal_services", "subtotal_parts", "manual_discount_amount", "discount_total", "grand_total", "paid_total", "balance_due", "inventory_consumed_at", "account_receivable_summary", "available_status_transitions", "created_at", "updated_at", "initial_service_items"]
        read_only_fields = ["id", "number", "customer", "customer_name", "vehicle", "vehicle_display", "assigned_to", "assigned_to_name", "reference_work_order", "reference_work_order_number", "status", "status_label", "priority_label", "order_type_label", "opened_at", "approved_at", "started_at", "completed_at", "delivered_at", "cancelled_at", "subtotal_services", "subtotal_parts", "discount_total", "grand_total", "paid_total", "balance_due", "inventory_consumed_at", "account_receivable_summary", "available_status_transitions", "created_at", "updated_at"]

    def get_assigned_to_name(self, obj):
        return obj.assigned_to.get_full_name() or obj.assigned_to.username if obj.assigned_to else ""

    def get_account_receivable_summary(self, obj):
        receivable = getattr(obj, "account_receivable", None)
        if not receivable:
            return None
        return {
            "id": receivable.id,
            "number": receivable.number,
            "status": receivable.status,
            "status_label": receivable.status_label,
            "amount": receivable.amount,
            "paid_amount": receivable.paid_amount,
            "balance_amount": receivable.balance_amount,
            "due_date": receivable.due_date,
        }

    def get_available_status_transitions(self, obj):
        request = self.context.get("request")
        actor = getattr(request, "user", None) if request else None
        return available_status_transitions(obj, actor=actor)

    def _create_initial_service_items(self, work_order, items):
        for item in items:
            WorkOrderService.objects.create(work_order=work_order, status=WorkOrderService.Status.PENDING, **item)
        work_order.recalculate_totals()

    def create(self, validated_data):
        initial_service_items = validated_data.pop("initial_service_items", [])
        work_order = WorkOrder.objects.create(**validated_data)
        if initial_service_items:
            self._create_initial_service_items(work_order, initial_service_items)
        else:
            work_order.recalculate_totals()
        return work_order

    def update(self, instance, validated_data):
        validated_data.pop("initial_service_items", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        instance.recalculate_totals()
        return instance

    def validate(self, attrs):
        customer = attrs.get("customer", getattr(self.instance, "customer", None))
        vehicle = attrs.get("vehicle", getattr(self.instance, "vehicle", None))
        order_type = attrs.get("order_type", getattr(self.instance, "order_type", WorkOrder.OrderType.STANDARD))
        reference_work_order = attrs.get("reference_work_order", getattr(self.instance, "reference_work_order", None))
        if vehicle and customer and vehicle.customer_id != customer.id:
            raise serializers.ValidationError({"vehicle_id": "O veiculo informado pertence a outro cliente."})
        if order_type == WorkOrder.OrderType.WARRANTY and not reference_work_order:
            raise serializers.ValidationError({"reference_work_order_id": "Informe a OS de referencia quando o tipo for garantia."})
        if reference_work_order:
            if self.instance and reference_work_order.id == self.instance.id:
                raise serializers.ValidationError({"reference_work_order_id": "A OS de referencia nao pode ser a propria OS."})
            if customer and reference_work_order.customer_id != customer.id:
                raise serializers.ValidationError({"reference_work_order_id": "A OS de referencia precisa pertencer ao mesmo cliente."})
            if vehicle and reference_work_order.vehicle_id and reference_work_order.vehicle_id != vehicle.id:
                raise serializers.ValidationError({"reference_work_order_id": "A OS de referencia precisa pertencer ao mesmo veiculo."})
        return attrs


class WorkOrderListSerializer(WorkOrderSerializer):
    class Meta(WorkOrderSerializer.Meta):
        fields = ["id", "number", "customer_name", "vehicle_display", "title", "status", "status_label", "priority", "priority_label", "promised_at", "assigned_to_name", "grand_total", "paid_total", "balance_due", "available_status_transitions", "created_at", "updated_at"]
        read_only_fields = fields


class WorkOrderDetailSerializer(WorkOrderSerializer):
    services = WorkOrderServiceSerializer(many=True, read_only=True)
    parts = WorkOrderPartSerializer(many=True, read_only=True)
    payments = WorkOrderPaymentSerializer(many=True, read_only=True)
    photos = WorkOrderPhotoSerializer(many=True, read_only=True)
    events = WorkOrderEventSerializer(many=True, read_only=True)
    messages = WorkOrderMessageSerializer(many=True, read_only=True)

    class Meta(WorkOrderSerializer.Meta):
        fields = WorkOrderSerializer.Meta.fields + ["services", "parts", "payments", "photos", "events", "messages"]
        read_only_fields = WorkOrderSerializer.Meta.read_only_fields + ["services", "parts", "payments", "photos", "events", "messages"]


class WorkOrderDeliverySignatureSerializer(serializers.ModelSerializer):
    signature_url = serializers.SerializerMethodField()
    signed_by_name = serializers.CharField(read_only=True)

    class Meta:
        model = WorkOrderDeliverySignature
        fields = [
            "id",
            "work_order",
            "recipient_name",
            "recipient_document",
            "notes",
            "signature_image",
            "signature_url",
            "signed_at",
            "signed_ip",
            "signed_user_agent",
            "signed_by_user",
            "signed_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "work_order", "signature_url", "signed_at", "signed_ip", "signed_user_agent", "signed_by_user", "signed_by_name", "created_at", "updated_at"]

    def get_signature_url(self, obj):
        if not obj.signature_image:
            return ""
        request = self.context.get("request")
        url = obj.signature_image.url
        return request.build_absolute_uri(url) if request else url


class WorkOrderDeliverySignatureCreateSerializer(serializers.Serializer):
    recipient_name = serializers.CharField(max_length=180)
    recipient_document = serializers.CharField(max_length=30, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    signature_data_url = serializers.CharField(write_only=True)

    def validate_recipient_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Informe o nome de quem recebeu.")
        return value

    def validate_signature_data_url(self, value):
        if not value or "," not in value:
            raise serializers.ValidationError("Informe a assinatura digital desenhada na tela.")
        header, data = value.split(",", 1)
        if "image/png" not in header and "image/jpeg" not in header and "image/webp" not in header:
            raise serializers.ValidationError("A assinatura precisa ser uma imagem PNG, JPEG ou WEBP.")
        try:
            decoded = base64.b64decode(data)
        except (binascii.Error, ValueError) as exc:
            raise serializers.ValidationError("Assinatura digital inválida.") from exc
        if len(decoded) > 2 * 1024 * 1024:
            raise serializers.ValidationError("A assinatura deve ter no máximo 2 MB.")
        extension = "jpg" if "image/jpeg" in header else "webp" if "image/webp" in header else "png"
        return ContentFile(decoded, name=f"assinatura-{uuid4().hex}.{extension}")


class WorkOrderCustomerApprovalSerializer(serializers.ModelSerializer):
    work_order_number = serializers.CharField(source="work_order.number", read_only=True)
    document_type_label = serializers.CharField(read_only=True)
    status_label = serializers.CharField(read_only=True)
    effective_status = serializers.CharField(read_only=True)
    can_decide = serializers.BooleanField(read_only=True)
    public_url_path = serializers.CharField(read_only=True)
    requested_by_name = serializers.SerializerMethodField()

    class Meta:
        model = WorkOrderCustomerApproval
        fields = [
            "id",
            "work_order",
            "work_order_number",
            "document_type",
            "document_type_label",
            "token",
            "status",
            "status_label",
            "effective_status",
            "can_decide",
            "public_url_path",
            "requested_by_name",
            "requested_at",
            "expires_at",
            "customer_name_snapshot",
            "customer_email_snapshot",
            "customer_phone_snapshot",
            "decision_name",
            "decision_document",
            "decision_notes",
            "decided_at",
            "decision_ip",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_requested_by_name(self, obj):
        return obj.requested_by.get_full_name() or obj.requested_by.username if obj.requested_by else ""


class WorkOrderCustomerApprovalCreateSerializer(serializers.Serializer):
    document_type = serializers.ChoiceField(choices=WorkOrderCustomerApproval.DocumentType.choices, default=WorkOrderCustomerApproval.DocumentType.ESTIMATE)
    expires_days = serializers.IntegerField(required=False, min_value=1, max_value=90, default=7)


class WorkOrderCustomerApprovalDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=[("approved", "Aprovar"), ("rejected", "Recusar")])
    name = serializers.CharField(required=False, allow_blank=True, max_length=180)
    document = serializers.CharField(required=True, allow_blank=False, max_length=30)
    notes = serializers.CharField(required=True, allow_blank=False)

    def validate_document(self, value):
        digits = only_digits(value)
        if len(digits) not in (11, 14):
            raise serializers.ValidationError("Informe um CPF com 11 dígitos ou CNPJ com 14 dígitos.")
        return format_cpf_cnpj(digits)

    def validate_notes(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Informe uma observação para registrar a decisão.")
        return value

    def validate_name(self, value):
        return (value or "").strip()


class WorkOrderCustomerApprovalPublicSerializer(serializers.ModelSerializer):
    document_type_label = serializers.CharField(read_only=True)
    status_label = serializers.CharField(read_only=True)
    effective_status = serializers.CharField(read_only=True)
    can_decide = serializers.BooleanField(read_only=True)
    work_order = serializers.SerializerMethodField()
    services = serializers.SerializerMethodField()
    parts = serializers.SerializerMethodField()
    totals = serializers.SerializerMethodField()
    workshop = serializers.SerializerMethodField()

    class Meta:
        model = WorkOrderCustomerApproval
        fields = [
            "token",
            "document_type",
            "document_type_label",
            "status",
            "status_label",
            "effective_status",
            "can_decide",
            "requested_at",
            "expires_at",
            "customer_name_snapshot",
            "decision_name",
            "decision_document",
            "decision_notes",
            "decided_at",
            "workshop",
            "work_order",
            "services",
            "parts",
            "totals",
        ]
        read_only_fields = fields

    def get_workshop(self, obj):
        profile = WorkshopProfile.get_solo()
        return {
            "display_name": profile.display_name,
            "legal_name": profile.legal_name,
            "document_number": profile.document_number,
            "phone": profile.phone_e164,
            "email": profile.email,
            "address": profile.address_display,
        }

    def get_work_order(self, obj):
        order = obj.work_order
        return {
            "id": order.id,
            "number": order.number,
            "title": order.title,
            "status": order.status,
            "status_label": order.status_label,
            "priority_label": order.priority_label,
            "customer_name": order.customer.full_name,
            "vehicle_display": order.vehicle.display_name if order.vehicle else "",
            "mileage_in": order.mileage_in,
            "complaint": order.complaint,
            "diagnosis": order.diagnosis,
            "solution": order.solution,
            "customer_notes": order.customer_notes,
            "opened_at": order.opened_at,
            "promised_at": order.promised_at,
        }

    def get_services(self, obj):
        return [
            {
                "description": line.description,
                "quantity": line.quantity,
                "unit_price": line.unit_price,
                "discount_amount": line.discount_amount,
                "total_amount": line.total_amount,
            }
            for line in obj.work_order.services.all()
        ]

    def get_parts(self, obj):
        return [
            {
                "sku": line.part.sku if line.part else "",
                "description": line.description,
                "quantity": line.quantity,
                "unit_price": line.unit_price,
                "discount_amount": line.discount_amount,
                "total_amount": line.total_amount,
            }
            for line in obj.work_order.parts.all()
        ]

    def get_totals(self, obj):
        order = obj.work_order
        return {
            "subtotal_services": order.subtotal_services,
            "subtotal_parts": order.subtotal_parts,
            "discount_total": order.discount_total,
            "grand_total": order.grand_total,
            "paid_total": order.paid_total,
            "balance_due": order.balance_due,
        }


class ChangeWorkOrderStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=WorkOrder.Status.choices)
    note = serializers.CharField(required=False, allow_blank=True)
    send_notifications = serializers.BooleanField(default=True)


class SendWorkOrderMessageSerializer(serializers.Serializer):
    template_id = serializers.PrimaryKeyRelatedField(source="template", queryset=MessageTemplate.objects.filter(is_active=True))
