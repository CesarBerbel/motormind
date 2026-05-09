from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers

from messaging.models import Contact
from messaging.serializers import ContactSerializer
from purchasing.models import Supplier
from workshop.models import WorkOrderPayment
from workshop.serializers import WorkOrderPaymentSerializer

from .models import AccountPayable, AccountPayablePayment, AccountReceivable, AccountReceivablePayment
from .services import create_manual_payables, create_manual_receivable, generate_next_fixed_payable, register_payable_payment, register_receivable_payment


class AccountReceivablePaymentSerializer(serializers.ModelSerializer):
    method_label = serializers.CharField(read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AccountReceivablePayment
        fields = ["id", "account_receivable", "method", "method_label", "amount", "paid_at", "reference", "notes", "created_by_name", "created_at", "updated_at"]
        read_only_fields = ["id", "account_receivable", "method_label", "created_by_name", "created_at", "updated_at"]

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username if obj.created_by else ""


class AccountReceivableCreateSerializer(serializers.Serializer):
    customer_id = serializers.PrimaryKeyRelatedField(source="customer", queryset=Contact.objects.filter(is_active=True), required=False, allow_null=True)
    description = serializers.CharField(max_length=220)
    issue_date = serializers.DateField(required=False, default=timezone.localdate)
    due_date = serializers.DateField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    discount_amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.00"), required=False, default=Decimal("0.00"))
    notes = serializers.CharField(required=False, allow_blank=True)

    def save(self, **kwargs):
        actor = self.context.get("actor")
        try:
            return create_manual_receivable(
                customer=self.validated_data.get("customer"),
                description=self.validated_data["description"],
                issue_date=self.validated_data.get("issue_date"),
                due_date=self.validated_data["due_date"],
                amount=self.validated_data["amount"],
                discount_amount=self.validated_data.get("discount_amount", Decimal("0.00")),
                notes=self.validated_data.get("notes", ""),
                actor=actor,
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages if hasattr(exc, "messages") else str(exc))


class AccountReceivableUpdateSerializer(serializers.ModelSerializer):
    customer_id = serializers.PrimaryKeyRelatedField(source="customer", queryset=Contact.objects.filter(is_active=True), required=False, allow_null=True, write_only=True)

    class Meta:
        model = AccountReceivable
        fields = ["customer_id", "description", "issue_date", "due_date", "amount", "discount_amount", "notes"]

    def validate(self, attrs):
        instance = self.instance
        if instance and instance.origin != AccountReceivable.Origin.MANUAL:
            blocked = set(attrs.keys()) - {"due_date", "notes"}
            if blocked:
                raise serializers.ValidationError("Conta a receber originada de OS ou venda avulsa só permite alterar vencimento e observações. Altere valores no documento de origem.")
        if attrs.get("amount") is not None and attrs["amount"] <= Decimal("0.00"):
            raise serializers.ValidationError({"amount": "Valor precisa ser maior que zero."})
        return attrs

    def save(self, **kwargs):
        account = super().save(**kwargs)
        account.recalculate(save=True)
        return account


class AccountReceivableSerializer(serializers.ModelSerializer):
    customer = ContactSerializer(read_only=True)
    customer_name = serializers.SerializerMethodField()
    work_order_number = serializers.CharField(source="work_order.number", read_only=True)
    counter_sale_number = serializers.CharField(source="counter_sale.number", read_only=True)
    status_label = serializers.CharField(read_only=True)
    origin_label = serializers.CharField(read_only=True)

    def get_customer_name(self, obj):
        if obj.customer_id:
            return obj.customer.full_name
        if obj.counter_sale_id:
            return obj.counter_sale.effective_customer_name
        return ""

    class Meta:
        model = AccountReceivable
        fields = [
            "id", "number", "origin", "origin_label", "work_order", "work_order_number", "counter_sale", "counter_sale_number", "customer", "customer_name",
            "description", "issue_date", "due_date", "amount", "discount_amount", "paid_amount", "balance_amount",
            "status", "status_label", "notes", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "number", "origin", "origin_label", "work_order", "work_order_number", "counter_sale", "counter_sale_number", "customer", "customer_name",
            "amount", "discount_amount", "paid_amount", "balance_amount", "status", "status_label", "created_at", "updated_at",
        ]


class AccountReceivableDetailSerializer(AccountReceivableSerializer):
    payments = serializers.SerializerMethodField()

    class Meta(AccountReceivableSerializer.Meta):
        fields = AccountReceivableSerializer.Meta.fields + ["payments"]
        read_only_fields = AccountReceivableSerializer.Meta.read_only_fields + ["payments"]

    def get_payments(self, obj):
        if obj.work_order_id:
            payments = WorkOrderPayment.objects.select_related("work_order", "created_by").filter(work_order=obj.work_order)
            return WorkOrderPaymentSerializer(payments, many=True).data
        if obj.counter_sale_id:
            from attendance.serializers import CounterSalePaymentSerializer
            return CounterSalePaymentSerializer(obj.counter_sale.payments.select_related("created_by"), many=True).data
        return AccountReceivablePaymentSerializer(obj.manual_payments.select_related("created_by"), many=True).data


class RegisterReceivablePaymentSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=WorkOrderPayment.Method.choices, default=WorkOrderPayment.Method.CASH)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    paid_at = serializers.DateTimeField(required=False, default=timezone.now)
    reference = serializers.CharField(required=False, allow_blank=True, max_length=120)
    notes = serializers.CharField(required=False, allow_blank=True)

    def save(self, **kwargs):
        receivable = self.context["receivable"]
        actor = self.context.get("actor")
        return register_receivable_payment(receivable, actor=actor, **self.validated_data)


class AccountPayablePaymentSerializer(serializers.ModelSerializer):
    method_label = serializers.CharField(read_only=True)
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True)

    class Meta:
        model = AccountPayablePayment
        fields = ["id", "method", "method_label", "amount", "paid_at", "reference", "notes", "created_by", "created_by_name", "created_at"]
        read_only_fields = ["id", "method_label", "created_by", "created_by_name", "created_at"]


class AccountPayableSerializer(serializers.ModelSerializer):
    supplier_id = serializers.PrimaryKeyRelatedField(source="supplier", queryset=Supplier.objects.filter(is_active=True), required=False, allow_null=True, write_only=True)
    supplier_name = serializers.CharField(read_only=True)
    purchase_order_number = serializers.CharField(source="purchase_order.number", read_only=True)
    status_label = serializers.CharField(read_only=True)
    origin_label = serializers.CharField(read_only=True)
    recurrence_type_label = serializers.CharField(read_only=True)

    class Meta:
        model = AccountPayable
        fields = [
            "id", "number", "origin", "origin_label", "recurrence_type", "recurrence_type_label", "purchase_order",
            "purchase_order_number", "supplier", "supplier_id", "supplier_name", "category", "description", "issue_date",
            "due_date", "amount", "paid_amount", "balance_amount", "status", "status_label", "installment_number",
            "installment_total", "recurrence_group", "next_generation_date", "notes", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "number", "origin", "origin_label", "purchase_order", "purchase_order_number", "supplier", "supplier_name",
            "paid_amount", "balance_amount", "status", "status_label", "recurrence_type_label", "recurrence_group",
            "next_generation_date", "created_at", "updated_at",
        ]


class AccountPayableDetailSerializer(AccountPayableSerializer):
    payments = AccountPayablePaymentSerializer(many=True, read_only=True)

    class Meta(AccountPayableSerializer.Meta):
        fields = AccountPayableSerializer.Meta.fields + ["payments"]
        read_only_fields = AccountPayableSerializer.Meta.read_only_fields + ["payments"]


class AccountPayableCreateSerializer(serializers.Serializer):
    supplier_id = serializers.PrimaryKeyRelatedField(source="supplier", queryset=Supplier.objects.filter(is_active=True), required=False, allow_null=True)
    category = serializers.CharField(required=False, allow_blank=True, max_length=80)
    description = serializers.CharField(max_length=220)
    issue_date = serializers.DateField(required=False, default=timezone.localdate)
    due_date = serializers.DateField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    recurrence_type = serializers.ChoiceField(choices=AccountPayable.RecurrenceType.choices, default=AccountPayable.RecurrenceType.CASH)
    installment_total = serializers.IntegerField(required=False, min_value=1, default=1)
    notes = serializers.CharField(required=False, allow_blank=True)

    def save(self, **kwargs):
        actor = self.context.get("actor")
        try:
            return create_manual_payables(
                supplier=self.validated_data.get("supplier"),
                category=self.validated_data.get("category", ""),
                description=self.validated_data["description"],
                issue_date=self.validated_data.get("issue_date"),
                first_due_date=self.validated_data["due_date"],
                amount=self.validated_data["amount"],
                recurrence_type=self.validated_data["recurrence_type"],
                installment_total=self.validated_data.get("installment_total", 1),
                notes=self.validated_data.get("notes", ""),
                actor=actor,
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages if hasattr(exc, "messages") else str(exc))


class AccountPayableUpdateSerializer(serializers.ModelSerializer):
    supplier_id = serializers.PrimaryKeyRelatedField(source="supplier", queryset=Supplier.objects.filter(is_active=True), required=False, allow_null=True, write_only=True)

    class Meta:
        model = AccountPayable
        fields = ["supplier_id", "category", "description", "issue_date", "due_date", "amount", "notes"]

    def validate(self, attrs):
        instance = self.instance
        if instance and instance.origin == AccountPayable.Origin.PURCHASE_ORDER:
            blocked = set(attrs.keys()) - {"due_date", "notes"}
            if blocked:
                raise serializers.ValidationError("Conta a pagar originada de pedido de compra só permite alterar vencimento e observações. Altere valores no pedido de compra.")
        if attrs.get("amount") is not None and attrs["amount"] <= Decimal("0.00"):
            raise serializers.ValidationError({"amount": "Valor precisa ser maior que zero."})
        return attrs

    def save(self, **kwargs):
        account = super().save(**kwargs)
        account.recalculate(save=True)
        return account


class RegisterPayablePaymentSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=AccountPayablePayment.Method.choices, default=AccountPayablePayment.Method.PIX)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    paid_at = serializers.DateTimeField(required=False, default=timezone.now)
    reference = serializers.CharField(required=False, allow_blank=True, max_length=120)
    notes = serializers.CharField(required=False, allow_blank=True)

    def save(self, **kwargs):
        payable = self.context["payable"]
        actor = self.context.get("actor")
        try:
            return register_payable_payment(payable, actor=actor, **self.validated_data)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages if hasattr(exc, "messages") else str(exc))


class GenerateNextFixedPayableSerializer(serializers.Serializer):
    def save(self, **kwargs):
        account = self.context["payable"]
        actor = self.context.get("actor")
        try:
            return generate_next_fixed_payable(account, actor=actor)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
