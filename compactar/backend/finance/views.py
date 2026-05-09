from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import dateparse, timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import HasViewPermission
from attendance.models import CounterSalePayment
from workshop.models import WorkOrderPayment
from workshop.serializers import WorkOrderPaymentSerializer

from .models import AccountPayable, AccountPayablePayment, AccountReceivable, AccountReceivablePayment
from .serializers import (
    AccountPayableCreateSerializer,
    AccountPayableDetailSerializer,
    AccountPayablePaymentSerializer,
    AccountPayableSerializer,
    AccountPayableUpdateSerializer,
    AccountReceivableCreateSerializer,
    AccountReceivableDetailSerializer,
    AccountReceivablePaymentSerializer,
    AccountReceivableSerializer,
    AccountReceivableUpdateSerializer,
    GenerateNextFixedPayableSerializer,
    RegisterPayablePaymentSerializer,
    RegisterReceivablePaymentSerializer,
)


class FinanceDashboardView(APIView):
    permission_classes = [HasViewPermission]
    permission_code = "finance.view"

    def get(self, request):
        today = timezone.localdate()
        month_start = today.replace(day=1)
        receivables = AccountReceivable.objects.select_related("customer", "work_order").all()
        payables = AccountPayable.objects.select_related("supplier", "purchase_order").all()
        receivable_open_statuses = [AccountReceivable.Status.OPEN, AccountReceivable.Status.PARTIAL, AccountReceivable.Status.OVERDUE]
        payable_open_statuses = [AccountPayable.Status.OPEN, AccountPayable.Status.PARTIAL, AccountPayable.Status.OVERDUE]
        receivable_totals = receivables.aggregate(total_amount=Sum("amount"), total_paid=Sum("paid_amount"), total_open=Sum("balance_amount"))
        payable_totals = payables.aggregate(total_amount=Sum("amount"), total_paid=Sum("paid_amount"), total_open=Sum("balance_amount"))
        receivable_open = receivable_totals["total_open"] or 0
        payable_open = payable_totals["total_open"] or 0
        return Response({
            "counts": {
                "open_receivables": receivables.filter(status__in=receivable_open_statuses).count(),
                "overdue_receivables": receivables.filter(status=AccountReceivable.Status.OVERDUE).count(),
                "paid_receivables_month": receivables.filter(status=AccountReceivable.Status.PAID, updated_at__date__gte=month_start).count(),
                "open_payables": payables.filter(status__in=payable_open_statuses).count(),
                "overdue_payables": payables.filter(status=AccountPayable.Status.OVERDUE).count(),
                "paid_payables_month": payables.filter(status=AccountPayable.Status.PAID, updated_at__date__gte=month_start).count(),
                "receivable_total_amount": receivable_totals["total_amount"] or 0,
                "receivable_total_paid": receivable_totals["total_paid"] or 0,
                "receivable_total_open": receivable_open,
                "payable_total_amount": payable_totals["total_amount"] or 0,
                "payable_total_paid": payable_totals["total_paid"] or 0,
                "payable_total_open": payable_open,
                "projected_balance": receivable_open - payable_open,
            },
            "receivable_status_counts": list(receivables.values("status").annotate(total=Count("id")).order_by("status")),
            "payable_status_counts": list(payables.values("status").annotate(total=Count("id")).order_by("status")),
            "receivables_due_today": AccountReceivableSerializer(receivables.filter(status__in=receivable_open_statuses, due_date=today)[:10], many=True).data,
            "payables_due_today": AccountPayableSerializer(payables.filter(status__in=payable_open_statuses, due_date=today)[:10], many=True).data,
            "overdue_receivables": AccountReceivableSerializer(receivables.filter(status=AccountReceivable.Status.OVERDUE)[:10], many=True).data,
            "overdue_payables": AccountPayableSerializer(payables.filter(status=AccountPayable.Status.OVERDUE)[:10], many=True).data,
            "recent_receivables": AccountReceivableSerializer(receivables[:10], many=True).data,
            "recent_payables": AccountPayableSerializer(payables[:10], many=True).data,
        })


class CashFlowView(APIView):
    permission_classes = [HasViewPermission]
    permission_code = "finance.view"

    def _date_param(self, request, name, default):
        value = request.query_params.get(name)
        if not value:
            return default
        parsed = dateparse.parse_date(value)
        return parsed or default

    def _date_range(self, start_date, end_date):
        current = start_date
        while current <= end_date:
            yield current
            current += timedelta(days=1)

    def get(self, request):
        today = timezone.localdate()
        start_date = self._date_param(request, "start_date", today.replace(day=1))
        end_date = self._date_param(request, "end_date", start_date + timedelta(days=30))
        if end_date < start_date:
            start_date, end_date = end_date, start_date

        rows = {
            day: {
                "date": day.isoformat(),
                "received_amount": Decimal("0.00"),
                "paid_amount": Decimal("0.00"),
                "receivable_forecast": Decimal("0.00"),
                "payable_forecast": Decimal("0.00"),
            }
            for day in self._date_range(start_date, end_date)
        }

        def add(day, key, value):
            if day in rows:
                rows[day][key] += value or Decimal("0.00")

        for payment in WorkOrderPayment.objects.filter(paid_at__date__gte=start_date, paid_at__date__lte=end_date):
            add(timezone.localtime(payment.paid_at).date(), "received_amount", payment.amount)
        for payment in CounterSalePayment.objects.filter(paid_at__date__gte=start_date, paid_at__date__lte=end_date):
            add(timezone.localtime(payment.paid_at).date(), "received_amount", payment.amount)
        for payment in AccountReceivablePayment.objects.filter(paid_at__date__gte=start_date, paid_at__date__lte=end_date):
            add(timezone.localtime(payment.paid_at).date(), "received_amount", payment.amount)
        for payment in AccountPayablePayment.objects.filter(paid_at__date__gte=start_date, paid_at__date__lte=end_date):
            add(timezone.localtime(payment.paid_at).date(), "paid_amount", payment.amount)

        open_receivable_statuses = [AccountReceivable.Status.OPEN, AccountReceivable.Status.PARTIAL, AccountReceivable.Status.OVERDUE]
        open_payable_statuses = [AccountPayable.Status.OPEN, AccountPayable.Status.PARTIAL, AccountPayable.Status.OVERDUE]
        for receivable in AccountReceivable.objects.filter(status__in=open_receivable_statuses, due_date__gte=start_date, due_date__lte=end_date):
            add(receivable.due_date, "receivable_forecast", receivable.balance_amount)
        for payable in AccountPayable.objects.filter(status__in=open_payable_statuses, due_date__gte=start_date, due_date__lte=end_date):
            add(payable.due_date, "payable_forecast", payable.balance_amount)

        running_actual = Decimal("0.00")
        running_forecast = Decimal("0.00")
        serialized_rows = []
        totals = {"received_amount": Decimal("0.00"), "paid_amount": Decimal("0.00"), "receivable_forecast": Decimal("0.00"), "payable_forecast": Decimal("0.00")}
        for day in sorted(rows):
            row = rows[day]
            row["net_actual"] = row["received_amount"] - row["paid_amount"]
            row["net_forecast"] = row["receivable_forecast"] - row["payable_forecast"]
            running_actual += row["net_actual"]
            running_forecast += row["net_forecast"]
            row["running_actual_balance"] = running_actual
            row["running_forecast_balance"] = running_forecast
            for key in totals:
                totals[key] += row[key]
            serialized_rows.append(row)

        totals["net_actual"] = totals["received_amount"] - totals["paid_amount"]
        totals["net_forecast"] = totals["receivable_forecast"] - totals["payable_forecast"]
        return Response({
            "start_date": start_date,
            "end_date": end_date,
            "totals": totals,
            "rows": serialized_rows,
        })


class AccountReceivableViewSet(viewsets.ModelViewSet):
    permission_classes = [HasViewPermission]
    permission_code_map = {
        "read": "finance.view",
        "write": "finance.manage",
        "create": "finance.manage",
        "update": "finance.manage",
        "partial_update": "finance.manage",
        "destroy": "finance.manage",
        "register_payment": "finance.manage",
        "refresh": "finance.manage",
        "cancel": "finance.manage",
    }
    queryset = AccountReceivable.objects.select_related("customer", "work_order", "counter_sale").prefetch_related("manual_payments").all()

    def get_serializer_class(self):
        if self.action == "retrieve":
            return AccountReceivableDetailSerializer
        if self.action == "create":
            return AccountReceivableCreateSerializer
        if self.action in {"update", "partial_update"}:
            return AccountReceivableUpdateSerializer
        return AccountReceivableSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        status_value = self.request.query_params.get("status")
        customer_id = self.request.query_params.get("customer")
        work_order_id = self.request.query_params.get("work_order")
        if search:
            qs = qs.filter(number__icontains=search) | qs.filter(description__icontains=search) | qs.filter(work_order__number__icontains=search) | qs.filter(counter_sale__number__icontains=search) | qs.filter(counter_sale__customer_name__icontains=search) | qs.filter(customer__first_name__icontains=search) | qs.filter(customer__last_name__icontains=search)
        if status_value:
            qs = qs.filter(status=status_value)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        if work_order_id:
            qs = qs.filter(work_order_id=work_order_id)
        return qs.distinct()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={"actor": request.user})
        serializer.is_valid(raise_exception=True)
        receivable = serializer.save()
        return Response(AccountReceivableDetailSerializer(receivable).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save(updated_by=request.user)
        return Response(AccountReceivableDetailSerializer(updated).data)

    def destroy(self, request, *args, **kwargs):
        account = self.get_object()
        if account.origin != AccountReceivable.Origin.MANUAL:
            return Response({"detail": "Conta originada de OS ou venda avulsa não pode ser excluída. Cancele ou ajuste o documento de origem."}, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def register_payment(self, request, pk=None):
        receivable = self.get_object()
        serializer = RegisterReceivablePaymentSerializer(data=request.data, context={"receivable": receivable, "actor": request.user})
        serializer.is_valid(raise_exception=True)
        payment, updated = serializer.save()
        if isinstance(payment, AccountReceivablePayment):
            payment_data = AccountReceivablePaymentSerializer(payment).data
        elif hasattr(payment, "counter_sale_id"):
            from attendance.serializers import CounterSalePaymentSerializer
            payment_data = CounterSalePaymentSerializer(payment).data
        else:
            payment_data = WorkOrderPaymentSerializer(payment).data
        return Response({"payment": payment_data, "account_receivable": AccountReceivableDetailSerializer(updated).data})

    @action(detail=True, methods=["post"])
    def refresh(self, request, pk=None):
        receivable = self.get_object()
        receivable.recalculate(save=True)
        return Response(AccountReceivableDetailSerializer(receivable).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        receivable = self.get_object()
        receivable.status = AccountReceivable.Status.CANCELLED
        receivable.updated_by = request.user
        receivable.save(update_fields=["status", "updated_by", "updated_at"])
        return Response(AccountReceivableDetailSerializer(receivable).data)


class AccountPayableViewSet(viewsets.ModelViewSet):
    permission_classes = [HasViewPermission]
    permission_code_map = {
        "read": "finance.view",
        "write": "finance.manage",
        "create": "finance.manage",
        "update": "finance.manage",
        "partial_update": "finance.manage",
        "destroy": "finance.manage",
        "register_payment": "finance.manage",
        "refresh": "finance.manage",
        "generate_next_fixed": "finance.manage",
        "cancel": "finance.manage",
    }
    queryset = AccountPayable.objects.select_related("supplier", "purchase_order").prefetch_related("payments").all()

    def get_serializer_class(self):
        if self.action == "retrieve":
            return AccountPayableDetailSerializer
        if self.action == "create":
            return AccountPayableCreateSerializer
        if self.action in {"update", "partial_update"}:
            return AccountPayableUpdateSerializer
        return AccountPayableSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        status_value = self.request.query_params.get("status")
        origin = self.request.query_params.get("origin")
        recurrence_type = self.request.query_params.get("recurrence_type")
        supplier_id = self.request.query_params.get("supplier")
        category = self.request.query_params.get("category")
        if search:
            qs = qs.filter(number__icontains=search) | qs.filter(description__icontains=search) | qs.filter(supplier__name__icontains=search) | qs.filter(purchase_order__number__icontains=search) | qs.filter(category__icontains=search)
        if status_value:
            qs = qs.filter(status=status_value)
        if origin:
            qs = qs.filter(origin=origin)
        if recurrence_type:
            qs = qs.filter(recurrence_type=recurrence_type)
        if supplier_id:
            qs = qs.filter(supplier_id=supplier_id)
        if category:
            qs = qs.filter(category__icontains=category)
        return qs.distinct()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={"actor": request.user})
        serializer.is_valid(raise_exception=True)
        created = serializer.save()
        data = AccountPayableDetailSerializer(created, many=True).data
        headers = self.get_success_headers(data[0] if data else {})
        return Response({"created": data, "count": len(data)}, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save(updated_by=request.user)
        return Response(AccountPayableDetailSerializer(updated).data)

    def destroy(self, request, *args, **kwargs):
        account = self.get_object()
        if account.origin == AccountPayable.Origin.PURCHASE_ORDER:
            return Response({"detail": "Conta gerada por pedido de compra não pode ser excluída. Cancele ou ajuste o pedido."}, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def register_payment(self, request, pk=None):
        payable = self.get_object()
        serializer = RegisterPayablePaymentSerializer(data=request.data, context={"payable": payable, "actor": request.user})
        serializer.is_valid(raise_exception=True)
        payment, updated = serializer.save()
        return Response({"payment": AccountPayablePaymentSerializer(payment).data, "account_payable": AccountPayableDetailSerializer(updated).data})

    @action(detail=True, methods=["post"])
    def refresh(self, request, pk=None):
        payable = self.get_object()
        payable.recalculate(save=True)
        return Response(AccountPayableDetailSerializer(payable).data)

    @action(detail=True, methods=["post"])
    def generate_next_fixed(self, request, pk=None):
        payable = self.get_object()
        serializer = GenerateNextFixedPayableSerializer(data=request.data, context={"payable": payable, "actor": request.user})
        serializer.is_valid(raise_exception=True)
        new_payable = serializer.save()
        return Response(AccountPayableDetailSerializer(new_payable).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        payable = self.get_object()
        payable.status = AccountPayable.Status.CANCELLED
        payable.updated_by = request.user
        payable.save(update_fields=["status", "updated_by", "updated_at"])
        return Response(AccountPayableDetailSerializer(payable).data)
