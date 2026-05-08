from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers

from messaging.models import Contact
from messaging.serializers import ContactSerializer
from workshop.models import Part, Vehicle, WorkshopService
from workshop.serializers import PartSerializer, VehicleSerializer, WorkOrderDetailSerializer

from .models import CounterSale, CounterSaleItem, CounterSalePayment, Estimate, EstimatePartItem, EstimateServiceItem
from .services import cancel_counter_sale, change_estimate_status, convert_estimate_to_work_order, finalize_counter_sale, register_counter_sale_payment

User = get_user_model()


class CounterSaleItemSerializer(serializers.ModelSerializer):
    part_id = serializers.PrimaryKeyRelatedField(source="part", queryset=Part.objects.filter(is_active=True), required=False, allow_null=True, write_only=True)
    part_name = serializers.CharField(source="part.name", read_only=True)
    part_sku = serializers.CharField(source="part.sku", read_only=True)
    stock_available = serializers.DecimalField(source="part.stock_quantity", max_digits=12, decimal_places=2, read_only=True)
    subtotal_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = CounterSaleItem
        fields = [
            "id",
            "counter_sale",
            "part",
            "part_id",
            "part_name",
            "part_sku",
            "stock_available",
            "description",
            "quantity",
            "unit_price",
            "cost_price",
            "discount_amount",
            "stock_movement",
            "notes",
            "subtotal_amount",
            "total_amount",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "part", "part_name", "part_sku", "stock_available", "stock_movement", "subtotal_amount", "total_amount", "created_at", "updated_at"]

    def validate(self, attrs):
        part = attrs.get("part")
        if part:
            attrs.setdefault("description", part.name)
            attrs.setdefault("unit_price", part.sale_price)
            attrs.setdefault("cost_price", part.cost_price)
        if not attrs.get("description") and not getattr(self.instance, "description", ""):
            raise serializers.ValidationError({"description": "Informe a descrição da peça vendida."})
        quantity = attrs.get("quantity", getattr(self.instance, "quantity", Decimal("1.00")))
        if quantity <= Decimal("0.00"):
            raise serializers.ValidationError({"quantity": "Quantidade precisa ser maior que zero."})
        return attrs


class CounterSalePaymentSerializer(serializers.ModelSerializer):
    method_label = serializers.CharField(read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CounterSalePayment
        fields = ["id", "counter_sale", "method", "method_label", "amount", "paid_at", "reference", "notes", "created_by_name", "created_at", "updated_at"]
        read_only_fields = ["id", "counter_sale", "method_label", "created_by_name", "created_at", "updated_at"]

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username if obj.created_by else ""


class CounterSaleSerializer(serializers.ModelSerializer):
    customer_id = serializers.PrimaryKeyRelatedField(source="customer", queryset=Contact.objects.filter(is_active=True), required=False, allow_null=True, write_only=True)
    customer = ContactSerializer(read_only=True)
    customer_display_name = serializers.CharField(source="effective_customer_name", read_only=True)
    status_label = serializers.CharField(read_only=True)
    items = CounterSaleItemSerializer(many=True, required=False)
    payments = CounterSalePaymentSerializer(many=True, read_only=True)
    account_receivable_summary = serializers.SerializerMethodField()

    class Meta:
        model = CounterSale
        fields = [
            "id",
            "number",
            "customer",
            "customer_id",
            "customer_name",
            "customer_display_name",
            "status",
            "status_label",
            "sold_at",
            "due_date",
            "subtotal_amount",
            "discount_amount",
            "total_amount",
            "paid_amount",
            "balance_amount",
            "notes",
            "items",
            "payments",
            "account_receivable_summary",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "number", "customer", "customer_display_name", "status", "status_label", "sold_at", "subtotal_amount", "total_amount", "paid_amount", "balance_amount", "payments", "account_receivable_summary", "created_at", "updated_at"]

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

    def validate(self, attrs):
        customer = attrs.get("customer", getattr(self.instance, "customer", None))
        customer_name = attrs.get("customer_name", getattr(self.instance, "customer_name", ""))
        if not customer and not (customer_name or "").strip():
            attrs["customer_name"] = "Cliente balcão"
        if self.instance and self.instance.status != CounterSale.Status.DRAFT:
            blocked = set(attrs.keys()) - {"notes"}
            if blocked:
                raise serializers.ValidationError("Venda finalizada ou cancelada não pode ser editada, exceto observações.")
        return attrs

    def _sync_items(self, sale, items_data):
        sale.items.all().delete()
        for item in items_data:
            CounterSaleItem.objects.create(counter_sale=sale, **item)
        sale.recalculate_totals(save=True)

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        actor = self.context.get("actor")
        sale = CounterSale.objects.create(created_by=actor if getattr(actor, "is_authenticated", False) else None, updated_by=actor if getattr(actor, "is_authenticated", False) else None, **validated_data)
        self._sync_items(sale, items_data)
        return sale

    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        actor = self.context.get("actor")
        if getattr(actor, "is_authenticated", False):
            instance.updated_by = actor
        instance.save()
        if items_data is not None:
            self._sync_items(instance, items_data)
        else:
            instance.recalculate_totals(save=True)
        return instance


class FinalizeCounterSaleSerializer(serializers.Serializer):
    payment_amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.00"), required=False, default=Decimal("0.00"))
    payment_method = serializers.ChoiceField(choices=CounterSalePayment.Method.choices, required=False, default=CounterSalePayment.Method.CASH)
    payment_reference = serializers.CharField(required=False, allow_blank=True, max_length=120)
    payment_notes = serializers.CharField(required=False, allow_blank=True)

    def save(self, **kwargs):
        try:
            return finalize_counter_sale(self.context["counter_sale"], actor=self.context.get("actor"), **self.validated_data)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages if hasattr(exc, "messages") else str(exc))


class RegisterCounterSalePaymentSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=CounterSalePayment.Method.choices, default=CounterSalePayment.Method.CASH)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    paid_at = serializers.DateTimeField(required=False, default=timezone.now)
    reference = serializers.CharField(required=False, allow_blank=True, max_length=120)
    notes = serializers.CharField(required=False, allow_blank=True)

    def save(self, **kwargs):
        try:
            return register_counter_sale_payment(self.context["counter_sale"], actor=self.context.get("actor"), **self.validated_data)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages if hasattr(exc, "messages") else str(exc))


class CancelCounterSaleSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)

    def save(self, **kwargs):
        try:
            return cancel_counter_sale(self.context["counter_sale"], actor=self.context.get("actor"), reason=self.validated_data.get("reason", ""))
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages if hasattr(exc, "messages") else str(exc))


class EstimateServiceItemSerializer(serializers.ModelSerializer):
    service_id = serializers.PrimaryKeyRelatedField(source="service", queryset=WorkshopService.objects.filter(is_active=True), required=False, allow_null=True, write_only=True)
    service_name = serializers.CharField(source="service.name", read_only=True)
    subtotal_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = EstimateServiceItem
        fields = ["id", "estimate", "service", "service_id", "service_name", "description", "quantity", "unit_price", "discount_amount", "notes", "subtotal_amount", "total_amount", "created_at", "updated_at"]
        read_only_fields = ["id", "service", "service_name", "subtotal_amount", "total_amount", "created_at", "updated_at"]

    def validate(self, attrs):
        service = attrs.get("service")
        if service:
            attrs.setdefault("description", service.name)
            attrs.setdefault("unit_price", service.default_unit_price)
        if not attrs.get("description") and not getattr(self.instance, "description", ""):
            raise serializers.ValidationError({"description": "Informe a descrição do serviço do orçamento."})
        return attrs


class EstimatePartItemSerializer(serializers.ModelSerializer):
    part_id = serializers.PrimaryKeyRelatedField(source="part", queryset=Part.objects.filter(is_active=True), required=False, allow_null=True, write_only=True)
    part_name = serializers.CharField(source="part.name", read_only=True)
    part_sku = serializers.CharField(source="part.sku", read_only=True)
    stock_available = serializers.DecimalField(source="part.stock_quantity", max_digits=12, decimal_places=2, read_only=True)
    subtotal_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = EstimatePartItem
        fields = ["id", "estimate", "part", "part_id", "part_name", "part_sku", "stock_available", "description", "quantity", "unit_price", "cost_price", "discount_amount", "notes", "subtotal_amount", "total_amount", "created_at", "updated_at"]
        read_only_fields = ["id", "part", "part_name", "part_sku", "stock_available", "subtotal_amount", "total_amount", "created_at", "updated_at"]

    def validate(self, attrs):
        part = attrs.get("part")
        if part:
            attrs.setdefault("description", part.name)
            attrs.setdefault("unit_price", part.sale_price)
            attrs.setdefault("cost_price", part.cost_price)
        if not attrs.get("description") and not getattr(self.instance, "description", ""):
            raise serializers.ValidationError({"description": "Informe a descrição da peça do orçamento."})
        return attrs


class EstimateSerializer(serializers.ModelSerializer):
    customer_id = serializers.PrimaryKeyRelatedField(source="customer", queryset=Contact.objects.filter(is_active=True), write_only=True)
    vehicle_id = serializers.PrimaryKeyRelatedField(source="vehicle", queryset=Vehicle.objects.filter(is_active=True), required=False, allow_null=True, write_only=True)
    customer = ContactSerializer(read_only=True)
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    vehicle = VehicleSerializer(read_only=True)
    vehicle_display = serializers.CharField(source="vehicle.display_name", read_only=True)
    status_label = serializers.CharField(read_only=True)
    services = EstimateServiceItemSerializer(many=True, required=False)
    parts = EstimatePartItemSerializer(many=True, required=False)
    converted_work_order_detail = WorkOrderDetailSerializer(source="converted_work_order", read_only=True)

    class Meta:
        model = Estimate
        fields = [
            "id",
            "number",
            "customer",
            "customer_id",
            "customer_name",
            "vehicle",
            "vehicle_id",
            "vehicle_display",
            "title",
            "complaint",
            "diagnosis",
            "internal_notes",
            "customer_notes",
            "status",
            "status_label",
            "valid_until",
            "sent_at",
            "approved_at",
            "rejected_at",
            "converted_at",
            "converted_work_order",
            "converted_work_order_detail",
            "subtotal_services",
            "subtotal_parts",
            "discount_amount",
            "total_amount",
            "services",
            "parts",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "number", "customer", "customer_name", "vehicle", "vehicle_display", "status", "status_label", "sent_at", "approved_at", "rejected_at", "converted_at", "converted_work_order", "converted_work_order_detail", "subtotal_services", "subtotal_parts", "total_amount", "created_at", "updated_at"]

    def validate(self, attrs):
        customer = attrs.get("customer", getattr(self.instance, "customer", None))
        vehicle = attrs.get("vehicle", getattr(self.instance, "vehicle", None))
        if vehicle and customer and vehicle.customer_id != customer.id:
            raise serializers.ValidationError({"vehicle_id": "O veículo informado pertence a outro cliente."})
        if self.instance and self.instance.status not in {Estimate.Status.DRAFT, Estimate.Status.SENT}:
            blocked = set(attrs.keys()) - {"internal_notes", "customer_notes"}
            if blocked:
                raise serializers.ValidationError("Orçamento aprovado, rejeitado, convertido ou cancelado não pode ser editado, exceto observações.")
        return attrs

    def _sync_services(self, estimate, services_data):
        estimate.services.all().delete()
        for item in services_data:
            EstimateServiceItem.objects.create(estimate=estimate, **item)

    def _sync_parts(self, estimate, parts_data):
        estimate.parts.all().delete()
        for item in parts_data:
            EstimatePartItem.objects.create(estimate=estimate, **item)

    def create(self, validated_data):
        services_data = validated_data.pop("services", [])
        parts_data = validated_data.pop("parts", [])
        actor = self.context.get("actor")
        estimate = Estimate.objects.create(created_by=actor if getattr(actor, "is_authenticated", False) else None, updated_by=actor if getattr(actor, "is_authenticated", False) else None, **validated_data)
        self._sync_services(estimate, services_data)
        self._sync_parts(estimate, parts_data)
        estimate.recalculate_totals(save=True)
        return estimate

    def update(self, instance, validated_data):
        services_data = validated_data.pop("services", None)
        parts_data = validated_data.pop("parts", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        actor = self.context.get("actor")
        if getattr(actor, "is_authenticated", False):
            instance.updated_by = actor
        instance.save()
        if services_data is not None:
            self._sync_services(instance, services_data)
        if parts_data is not None:
            self._sync_parts(instance, parts_data)
        instance.recalculate_totals(save=True)
        return instance


class ChangeEstimateStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Estimate.Status.choices)
    note = serializers.CharField(required=False, allow_blank=True)

    def save(self, **kwargs):
        try:
            return change_estimate_status(self.context["estimate"], self.validated_data["status"], actor=self.context.get("actor"), note=self.validated_data.get("note", ""))
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages if hasattr(exc, "messages") else str(exc))


class ConvertEstimateSerializer(serializers.Serializer):
    def save(self, **kwargs):
        try:
            return convert_estimate_to_work_order(self.context["estimate"], actor=self.context.get("actor"))
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
