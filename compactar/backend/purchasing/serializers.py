from decimal import Decimal
import re

from rest_framework import serializers

from workshop.models import Part, WorkOrder, WorkOrderPart

from .models import PurchaseOrder, PurchaseOrderItem, Supplier
from .services import receive_purchase_order_items


E164_RE = re.compile(r"^\+[1-9]\d{7,14}$")
UF_RE = re.compile(r"^[A-Z]{2}$")


def only_digits(value):
    return re.sub(r"\D", "", value or "")


def format_cpf_cnpj(digits):
    if len(digits) == 11:
        return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"
    if len(digits) == 14:
        return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"
    return digits


def format_cep(digits):
    if len(digits) == 8:
        return f"{digits[:5]}-{digits[5:]}"
    return digits


def normalize_br_phone_e164(value):
    raw = (value or "").strip()
    if not raw:
        return ""
    compact = re.sub(r"\s+", "", raw)
    if compact.startswith("+") and not compact.startswith("+55"):
        if E164_RE.match(compact):
            return compact
        raise serializers.ValidationError("Use telefone válido. Exemplo Brasil: (11) 99999-9999 ou +5511999999999.")
    digits = only_digits(compact)
    if digits.startswith("55") and len(digits) >= 12:
        digits = digits[2:]
    if len(digits) not in (10, 11):
        raise serializers.ValidationError("Informe telefone brasileiro com DDD. Exemplo: (11) 99999-9999.")
    return f"+55{digits}"

class SupplierSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    address_display = serializers.CharField(read_only=True)
    person_type_label = serializers.CharField(source="get_person_type_display", read_only=True)

    class Meta:
        model = Supplier
        fields = [
            "id", "person_type", "person_type_label", "name", "last_name", "trade_name", "full_name", "display_name",
            "document", "state_registration", "municipal_registration", "birth_date", "email", "phone", "secondary_phone",
            "contact_person", "zip_code", "address_line", "address_number", "address_complement", "district", "city", "state",
            "country", "address", "address_display", "notes", "custom_data", "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "full_name", "display_name", "address_display", "person_type_label", "created_at", "updated_at"]

    def validate_phone(self, value):
        return self._validate_phone(value)

    def validate_secondary_phone(self, value):
        return self._validate_phone(value)

    def _validate_phone(self, value):
        try:
            return normalize_br_phone_e164(value)
        except serializers.ValidationError as exc:
            raise serializers.ValidationError("Use telefone brasileiro com DDD. Exemplo: (11) 99999-9999 ou +5511999999999") from exc

    def validate_email(self, value):
        return (value or "").strip().lower()

    def validate_document(self, value):
        digits = only_digits(value)
        if not digits:
            return ""
        if len(digits) not in (11, 14):
            raise serializers.ValidationError("Informe CPF com 11 dígitos ou CNPJ com 14 dígitos.")
        qs = Supplier.objects.filter(document__in=[digits, format_cpf_cnpj(digits)])
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Já existe fornecedor cadastrado com este CPF/CNPJ.")
        return format_cpf_cnpj(digits)

    def validate_zip_code(self, value):
        digits = only_digits(value)
        if not digits:
            return ""
        if len(digits) != 8:
            raise serializers.ValidationError("Informe o CEP com 8 dígitos.")
        return format_cep(digits)

    def validate_state(self, value):
        value = (value or "").strip().upper()
        if value and not UF_RE.match(value):
            raise serializers.ValidationError("Informe a UF com 2 letras. Exemplo: SP.")
        return value

    def validate(self, attrs):
        person_type = attrs.get("person_type", getattr(self.instance, "person_type", Supplier.PersonType.COMPANY))
        name = (attrs.get("name", getattr(self.instance, "name", "")) or "").strip()
        last_name = (attrs.get("last_name", getattr(self.instance, "last_name", "")) or "").strip()
        document = attrs.get("document", getattr(self.instance, "document", "")) or ""
        digits = only_digits(document)
        if person_type == Supplier.PersonType.COMPANY:
            if not name:
                raise serializers.ValidationError({"name": "Informe a razão social."})
            if digits and len(digits) != 14:
                raise serializers.ValidationError({"document": "Pessoa jurídica deve usar CNPJ com 14 dígitos."})
            attrs["last_name"] = ""
        else:
            if not name:
                raise serializers.ValidationError({"name": "Informe o nome."})
            if digits and len(digits) != 11:
                raise serializers.ValidationError({"document": "Pessoa física deve usar CPF com 11 dígitos."})
            attrs["last_name"] = last_name
        attrs["name"] = name
        return attrs


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    part_id = serializers.PrimaryKeyRelatedField(source="part", queryset=Part.objects.all(), required=False, allow_null=True, write_only=True)
    part_name = serializers.CharField(source="part.name", read_only=True)
    part_sku = serializers.CharField(source="part.sku", read_only=True)
    work_order_id = serializers.PrimaryKeyRelatedField(source="work_order", queryset=WorkOrder.objects.all(), required=False, allow_null=True, write_only=True)
    work_order_number = serializers.CharField(source="work_order.number", read_only=True)
    work_order_part_id = serializers.PrimaryKeyRelatedField(source="work_order_part", queryset=WorkOrderPart.objects.all(), required=False, allow_null=True, write_only=True)
    subtotal_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    pending_quantity = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseOrderItem
        fields = [
            "id", "purchase_order", "part", "part_id", "part_name", "part_sku", "work_order", "work_order_id",
            "work_order_number", "work_order_part", "work_order_part_id", "description", "quantity", "unit_cost",
            "received_quantity", "pending_quantity", "is_auto_generated", "notes", "subtotal_amount", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "purchase_order", "part", "part_name", "part_sku", "work_order", "work_order_number", "work_order_part",
            "received_quantity", "pending_quantity", "is_auto_generated", "subtotal_amount", "created_at", "updated_at",
        ]

    def validate(self, attrs):
        part = attrs.get("part")
        if part:
            attrs.setdefault("description", part.name)
            attrs.setdefault("unit_cost", part.cost_price)
        if not attrs.get("description") and not getattr(self.instance, "description", ""):
            raise serializers.ValidationError({"description": "Informe a descrição do item de compra."})
        return attrs


class PurchaseOrderSerializer(serializers.ModelSerializer):
    supplier_id = serializers.PrimaryKeyRelatedField(source="supplier", queryset=Supplier.objects.filter(is_active=True), required=False, allow_null=True, write_only=True)
    supplier_name = serializers.CharField(source="supplier.display_name", read_only=True)
    work_order_id = serializers.PrimaryKeyRelatedField(source="work_order", queryset=WorkOrder.objects.all(), required=False, allow_null=True, write_only=True)
    work_order_number = serializers.CharField(source="work_order.number", read_only=True)
    status_label = serializers.CharField(read_only=True)
    origin_label = serializers.CharField(read_only=True)
    account_payable_id = serializers.IntegerField(source="account_payable.id", read_only=True)
    account_payable_number = serializers.CharField(source="account_payable.number", read_only=True)
    account_payable_status = serializers.CharField(source="account_payable.status", read_only=True)
    account_payable_status_label = serializers.CharField(source="account_payable.status_label", read_only=True)
    items = PurchaseOrderItemSerializer(many=True, required=False)

    class Meta:
        model = PurchaseOrder
        fields = [
            "id", "number", "supplier", "supplier_id", "supplier_name", "status", "status_label", "origin", "origin_label",
            "work_order", "work_order_id", "work_order_number", "requested_at", "approved_at", "ordered_at", "expected_at",
            "received_at", "subtotal_amount", "discount_amount", "total_amount", "notes", "account_payable_id",
            "account_payable_number", "account_payable_status", "account_payable_status_label", "items", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "number", "supplier", "supplier_name", "work_order", "work_order_number", "status_label", "origin_label",
            "requested_at", "approved_at", "ordered_at", "received_at", "subtotal_amount", "total_amount",
            "account_payable_id", "account_payable_number", "account_payable_status", "account_payable_status_label", "created_at", "updated_at",
        ]

    def _sync_items(self, purchase_order, items_data):
        purchase_order.items.filter(is_auto_generated=False, received_quantity=0).delete()
        for item_data in items_data:
            PurchaseOrderItem.objects.create(purchase_order=purchase_order, **item_data)
        purchase_order.recalculate_totals()

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        user = self.context.get("request").user if self.context.get("request") else None
        purchase_order = PurchaseOrder.objects.create(
            created_by=user if getattr(user, "is_authenticated", False) else None,
            updated_by=user if getattr(user, "is_authenticated", False) else None,
            **validated_data,
        )
        if items_data:
            self._sync_items(purchase_order, items_data)
        return purchase_order

    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)
        user = self.context.get("request").user if self.context.get("request") else None
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.updated_by = user if getattr(user, "is_authenticated", False) else instance.updated_by
        instance.save()
        if items_data is not None:
            self._sync_items(instance, items_data)
        instance.recalculate_totals()
        return instance


class PurchaseOrderStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=PurchaseOrder.Status.choices)
    notes = serializers.CharField(required=False, allow_blank=True)


class ReceivePurchaseOrderItemSerializer(serializers.Serializer):
    item_id = serializers.IntegerField()
    quantity = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.00"), required=False, allow_null=True)


class ReceivePurchaseOrderSerializer(serializers.Serializer):
    items = ReceivePurchaseOrderItemSerializer(many=True)

    def save(self, **kwargs):
        purchase_order = self.context["purchase_order"]
        actor = self.context.get("actor")
        return receive_purchase_order_items(purchase_order, self.validated_data["items"], actor=actor)
