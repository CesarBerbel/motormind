from django.db.models import Count, F, Q, Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import HasViewPermission
from finance.serializers import AccountReceivableSerializer
from workshop.models import WorkOrder
from workshop.serializers import PartSerializer, WorkOrderDetailSerializer, WorkOrderListSerializer
from workshop.models import Part

from .models import CounterSale, Estimate
from .serializers import (
    CancelCounterSaleSerializer,
    ChangeEstimateStatusSerializer,
    ConvertEstimateSerializer,
    CounterSaleSerializer,
    FinalizeCounterSaleSerializer,
    RegisterCounterSalePaymentSerializer,
    EstimateSerializer,
)


class AttendanceDashboardView(APIView):
    permission_classes = [HasViewPermission]
    permission_code = "dashboard.attendance"

    def get(self, request):
        today = timezone.localdate()
        month_start = today.replace(day=1)
        open_work_order_statuses = [
            WorkOrder.Status.OPEN,
            WorkOrder.Status.DIAGNOSIS,
            WorkOrder.Status.AWAITING_APPROVAL,
            WorkOrder.Status.APPROVED,
            WorkOrder.Status.IN_PROGRESS,
            WorkOrder.Status.QUALITY_CHECK,
            WorkOrder.Status.READY,
        ]
        estimate_open_statuses = [Estimate.Status.DRAFT, Estimate.Status.SENT]
        sales = CounterSale.objects.select_related("customer").all()
        estimates = Estimate.objects.select_related("customer", "vehicle", "converted_work_order").all()
        finalized_sales = sales.filter(status=CounterSale.Status.FINALIZED)
        sales_month = finalized_sales.filter(sold_at__date__gte=month_start).aggregate(total=Sum("total_amount"), paid=Sum("paid_amount"), balance=Sum("balance_amount"))
        estimates_month = estimates.filter(created_at__date__gte=month_start).aggregate(total=Sum("total_amount"))
        return Response({
            "counts": {
                "open_work_orders": WorkOrder.objects.filter(status__in=open_work_order_statuses).count(),
                "awaiting_approval_work_orders": WorkOrder.objects.filter(status=WorkOrder.Status.AWAITING_APPROVAL).count(),
                "ready_work_orders": WorkOrder.objects.filter(status=WorkOrder.Status.READY).count(),
                "estimates_open": estimates.filter(status__in=estimate_open_statuses).count(),
                "estimates_sent": estimates.filter(status=Estimate.Status.SENT).count(),
                "estimates_approved_month": estimates.filter(status__in=[Estimate.Status.APPROVED, Estimate.Status.CONVERTED], approved_at__date__gte=month_start).count(),
                "counter_sales_today": finalized_sales.filter(sold_at__date=today).count(),
                "counter_sales_month_amount": sales_month["total"] or 0,
                "counter_sales_month_paid": sales_month["paid"] or 0,
                "counter_sales_month_balance": sales_month["balance"] or 0,
                "estimates_month_amount": estimates_month["total"] or 0,
                "low_stock_parts": Part.objects.filter(stock_quantity__lte=F("minimum_stock")).count(),
            },
            "work_order_status_counts": list(WorkOrder.objects.values("status").annotate(total=Count("id")).order_by("status")),
            "estimate_status_counts": list(estimates.values("status").annotate(total=Count("id")).order_by("status")),
            "sale_status_counts": list(sales.values("status").annotate(total=Count("id")).order_by("status")),
            "recent_work_orders": WorkOrderListSerializer(WorkOrder.objects.select_related("customer", "vehicle", "assigned_to")[:8], many=True).data,
            "recent_estimates": EstimateSerializer(estimates[:8], many=True).data,
            "recent_counter_sales": CounterSaleSerializer(sales[:8], many=True).data,
            "ready_work_orders": WorkOrderListSerializer(WorkOrder.objects.select_related("customer", "vehicle", "assigned_to").filter(status=WorkOrder.Status.READY)[:8], many=True).data,
            "low_stock_parts": PartSerializer(Part.objects.filter(stock_quantity__lte=F("minimum_stock"))[:8], many=True).data,
        })


class CounterSaleViewSet(viewsets.ModelViewSet):
    serializer_class = CounterSaleSerializer
    permission_classes = [HasViewPermission]
    permission_code_map = {
        "read": "counter_sales.view",
        "write": "counter_sales.manage",
        "create": "counter_sales.manage",
        "update": "counter_sales.manage",
        "partial_update": "counter_sales.manage",
        "destroy": "counter_sales.manage",
        "finalize": "counter_sales.manage",
        "register_payment": "payments.manage",
        "cancel": "counter_sales.manage",
    }
    queryset = CounterSale.objects.select_related("customer", "account_receivable").prefetch_related("items__part", "payments").all()

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        status_value = self.request.query_params.get("status")
        customer_id = self.request.query_params.get("customer")
        if search:
            qs = qs.filter(Q(number__icontains=search) | Q(customer_name__icontains=search) | Q(customer__first_name__icontains=search) | Q(customer__last_name__icontains=search) | Q(items__description__icontains=search) | Q(items__part__sku__icontains=search))
        if status_value:
            qs = qs.filter(status=status_value)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        return qs.distinct()

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["actor"] = self.request.user
        return context

    def perform_create(self, serializer):
        serializer.save()

    def perform_update(self, serializer):
        serializer.save()

    @action(detail=True, methods=["post"])
    def finalize(self, request, pk=None):
        sale = self.get_object()
        serializer = FinalizeCounterSaleSerializer(data=request.data, context={"counter_sale": sale, "actor": request.user})
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        return Response(CounterSaleSerializer(updated).data)

    @action(detail=True, methods=["post"], url_path="register-payment")
    def register_payment(self, request, pk=None):
        sale = self.get_object()
        serializer = RegisterCounterSalePaymentSerializer(data=request.data, context={"counter_sale": sale, "actor": request.user})
        serializer.is_valid(raise_exception=True)
        payment, updated = serializer.save()
        return Response({"payment_id": payment.id, "counter_sale": CounterSaleSerializer(updated).data})

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        sale = self.get_object()
        serializer = CancelCounterSaleSerializer(data=request.data, context={"counter_sale": sale, "actor": request.user})
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        return Response(CounterSaleSerializer(updated).data)


class EstimateViewSet(viewsets.ModelViewSet):
    serializer_class = EstimateSerializer
    permission_classes = [HasViewPermission]
    permission_code_map = {
        "read": "estimates.view",
        "write": "estimates.manage",
        "create": "estimates.manage",
        "update": "estimates.manage",
        "partial_update": "estimates.manage",
        "destroy": "estimates.manage",
        "change_status": "estimates.manage",
        "convert_to_work_order": "work_orders.create",
    }
    queryset = Estimate.objects.select_related("customer", "vehicle", "converted_work_order").prefetch_related("services__service", "parts__part").all()

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        status_value = self.request.query_params.get("status")
        customer_id = self.request.query_params.get("customer")
        vehicle_id = self.request.query_params.get("vehicle")
        if search:
            qs = qs.filter(Q(number__icontains=search) | Q(title__icontains=search) | Q(complaint__icontains=search) | Q(customer__first_name__icontains=search) | Q(customer__last_name__icontains=search) | Q(vehicle__plate__icontains=search))
        if status_value:
            qs = qs.filter(status=status_value)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        if vehicle_id:
            qs = qs.filter(vehicle_id=vehicle_id)
        return qs.distinct()

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["actor"] = self.request.user
        return context

    @action(detail=True, methods=["post"], url_path="change-status")
    def change_status(self, request, pk=None):
        estimate = self.get_object()
        serializer = ChangeEstimateStatusSerializer(data=request.data, context={"estimate": estimate, "actor": request.user})
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        return Response(EstimateSerializer(updated).data)

    @action(detail=True, methods=["post"], url_path="convert-to-work-order")
    def convert_to_work_order(self, request, pk=None):
        estimate = self.get_object()
        serializer = ConvertEstimateSerializer(data=request.data, context={"estimate": estimate, "actor": request.user})
        serializer.is_valid(raise_exception=True)
        work_order = serializer.save()
        return Response(WorkOrderDetailSerializer(work_order).data, status=status.HTTP_201_CREATED)
