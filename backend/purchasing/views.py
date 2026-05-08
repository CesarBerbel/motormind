from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import HasViewPermission
from accounts.services import user_has_permission
from finance.services import ensure_payable_for_purchase_order

from .models import PurchaseOrder, Supplier
from .serializers import (
    PurchaseOrderSerializer,
    PurchaseOrderStatusSerializer,
    ReceivePurchaseOrderSerializer,
    SupplierSerializer,
)


class PurchasingDashboardView(APIView):
    permission_classes = [HasViewPermission]
    permission_code = "purchases.view"

    def get(self, request):
        orders = PurchaseOrder.objects.select_related("supplier", "work_order")
        open_statuses = [PurchaseOrder.Status.DRAFT, PurchaseOrder.Status.REQUESTED, PurchaseOrder.Status.APPROVED, PurchaseOrder.Status.ORDERED, PurchaseOrder.Status.PARTIALLY_RECEIVED]
        totals = orders.filter(status__in=open_statuses).aggregate(total_open=Sum("total_amount"))
        return Response({
            "counts": {
                "open_purchase_orders": orders.filter(status__in=open_statuses).count(),
                "auto_purchase_orders": orders.filter(origin=PurchaseOrder.Origin.AUTOMATIC, status__in=open_statuses).count(),
                "approved_without_payable": orders.filter(status__in=[PurchaseOrder.Status.APPROVED, PurchaseOrder.Status.ORDERED, PurchaseOrder.Status.PARTIALLY_RECEIVED, PurchaseOrder.Status.RECEIVED], account_payable__isnull=True).count(),
                "received_month": orders.filter(status=PurchaseOrder.Status.RECEIVED, received_at__date__gte=timezone.localdate().replace(day=1)).count(),
                "open_total": totals["total_open"] or 0,
            },
            "status_counts": list(orders.values("status").annotate(total=Count("id")).order_by("status")),
            "automatic": PurchaseOrderSerializer(orders.filter(origin=PurchaseOrder.Origin.AUTOMATIC, status__in=open_statuses)[:10], many=True).data,
            "recent": PurchaseOrderSerializer(orders[:10], many=True).data,
        })


class SupplierViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierSerializer
    permission_classes = [HasViewPermission]
    permission_code_map = {"read": "suppliers.view", "write": "suppliers.manage"}
    queryset = Supplier.objects.all()

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        active = self.request.query_params.get("active")
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(trade_name__icontains=search)
                | Q(document__icontains=search)
                | Q(email__icontains=search)
                | Q(phone__icontains=search)
                | Q(secondary_phone__icontains=search)
                | Q(contact_person__icontains=search)
                | Q(city__icontains=search)
                | Q(state__icontains=search)
            )
        if active in {"true", "false"}:
            qs = qs.filter(is_active=(active == "true"))
        return qs


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseOrderSerializer
    permission_classes = [HasViewPermission]
    permission_code_map = {"read": "purchases.view", "write": "purchases.manage", "change_status": "purchases.manage", "receive": "purchases.manage"}
    queryset = PurchaseOrder.objects.select_related("supplier", "work_order", "account_payable").prefetch_related("items__part").all()

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        status_value = self.request.query_params.get("status")
        origin = self.request.query_params.get("origin")
        supplier_id = self.request.query_params.get("supplier")
        work_order_id = self.request.query_params.get("work_order")
        if search:
            qs = qs.filter(Q(number__icontains=search) | Q(notes__icontains=search) | Q(supplier__name__icontains=search) | Q(work_order__number__icontains=search) | Q(items__description__icontains=search) | Q(account_payable__number__icontains=search))
        if status_value:
            qs = qs.filter(status=status_value)
        if origin:
            qs = qs.filter(origin=origin)
        if supplier_id:
            qs = qs.filter(supplier_id=supplier_id)
        if work_order_id:
            qs = qs.filter(work_order_id=work_order_id)
        return qs.distinct()

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def change_status(self, request, pk=None):
        purchase_order = self.get_object()
        serializer = PurchaseOrderStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data["status"]

        if new_status == PurchaseOrder.Status.APPROVED and not user_has_permission(request.user, "purchases.approve"):
            return Response({"detail": "Somente Administrativo, Financeiro ou Dono podem aprovar pedidos de compra."}, status=status.HTTP_403_FORBIDDEN)
        if new_status == PurchaseOrder.Status.APPROVED:
            if not purchase_order.supplier_id:
                return Response({"supplier": "Informe o fornecedor antes de aprovar o pedido de compra."}, status=status.HTTP_400_BAD_REQUEST)
            purchase_order.recalculate_totals()
            if purchase_order.total_amount <= 0:
                return Response({"total_amount": "Pedido de compra aprovado precisa ter valor maior que zero."}, status=status.HTTP_400_BAD_REQUEST)
            if not purchase_order.items.exists():
                return Response({"items": "Pedido de compra aprovado precisa ter pelo menos um item."}, status=status.HTTP_400_BAD_REQUEST)

        purchase_order.status = new_status
        purchase_order.updated_by = request.user
        if serializer.validated_data.get("notes"):
            purchase_order.notes = (purchase_order.notes + "\n" if purchase_order.notes else "") + serializer.validated_data["notes"]
        now = timezone.now()
        if purchase_order.status == PurchaseOrder.Status.REQUESTED and not purchase_order.requested_at:
            purchase_order.requested_at = now
        if purchase_order.status == PurchaseOrder.Status.APPROVED and not purchase_order.approved_at:
            purchase_order.approved_at = now
        if purchase_order.status == PurchaseOrder.Status.ORDERED and not purchase_order.ordered_at:
            purchase_order.ordered_at = now
        if purchase_order.status == PurchaseOrder.Status.RECEIVED and not purchase_order.received_at:
            purchase_order.received_at = now
        purchase_order.save()
        if purchase_order.status == PurchaseOrder.Status.APPROVED:
            try:
                ensure_payable_for_purchase_order(purchase_order, actor=request.user)
            except ValidationError as exc:
                return Response({"detail": exc.messages if hasattr(exc, "messages") else str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        purchase_order.refresh_from_db()
        return Response(PurchaseOrderSerializer(purchase_order).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def receive(self, request, pk=None):
        purchase_order = self.get_object()
        if purchase_order.status in {PurchaseOrder.Status.DRAFT, PurchaseOrder.Status.REQUESTED, PurchaseOrder.Status.CANCELLED}:
            return Response({"detail": "Somente pedidos aprovados, enviados ou parcialmente recebidos podem receber itens."}, status=status.HTTP_400_BAD_REQUEST)
        serializer = ReceivePurchaseOrderSerializer(data=request.data, context={"purchase_order": purchase_order, "actor": request.user})
        serializer.is_valid(raise_exception=True)
        updated, movements = serializer.save()
        if updated.status in {PurchaseOrder.Status.APPROVED, PurchaseOrder.Status.ORDERED, PurchaseOrder.Status.PARTIALLY_RECEIVED, PurchaseOrder.Status.RECEIVED}:
            try:
                ensure_payable_for_purchase_order(updated, actor=request.user)
            except ValidationError:
                pass
        return Response({"purchase_order": PurchaseOrderSerializer(updated).data, "stock_movement_ids": [movement.id for movement in movements]}, status=status.HTTP_200_OK)
