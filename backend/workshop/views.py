from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, F, Q, Sum
from django.http import HttpResponse
from django.utils import timezone
import requests
from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import HasViewPermission
from accounts.roles import ROLE_TECHNICIAN
from accounts.services import get_user_role, user_has_permission
from messaging.models import Contact
from finance.models import AccountPayable, AccountReceivable
from purchasing.models import PurchaseOrder

from .models import (
    GeneralCategory,
    WorkshopProfile,
    PartBrand,
    normalize_lookup_name,
    Part,
    PartStockMovement,
    ServicePackage,
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
from .serializers import (
    ChangeWorkOrderStatusSerializer,
    CompleteWorkOrderServiceSerializer,
    GeneralCategorySerializer,
    WorkshopProfileSerializer,
    PublicLandingSerializer,
    PartBrandSerializer,
    PartSerializer,
    PartStockMovementSerializer,
    QualityCheckWorkOrderServiceSerializer,
    SendWorkOrderMessageSerializer,
    ServicePackageSerializer,
    StartWorkOrderServiceSerializer,
    StockAdjustmentSerializer,
    VehicleSerializer,
    WorkOrderDetailSerializer,
    WorkOrderPhotoSerializer,
    WorkOrderEventSerializer,
    WorkOrderListSerializer,
    WorkOrderMessageSerializer,
    WorkOrderCustomerApprovalCreateSerializer,
    WorkOrderCustomerApprovalDecisionSerializer,
    WorkOrderCustomerApprovalPublicSerializer,
    WorkOrderCustomerApprovalSerializer,
    WorkOrderDeliverySignatureCreateSerializer,
    WorkOrderDeliverySignatureSerializer,
    WorkOrderServiceChecklistItemSerializer,
    WorkshopServiceChecklistTemplateSerializer,
    WorkOrderNotificationRuleSerializer,
    WorkOrderPartSerializer,
    WorkOrderPaymentSerializer,
    WorkOrderSerializer,
    WorkOrderServiceSerializer,
    WorkshopServiceSerializer,
)
from .documents import generate_work_order_pdf
from .services import adjust_part_stock, change_work_order_status, complete_work_order_service, quality_check_work_order_service, record_event, send_work_order_message, start_work_order_service, trigger_status_notifications

User = get_user_model()


def drf_validation_from_django(exc):
    if hasattr(exc, "message_dict"):
        return ValidationError(exc.message_dict)
    if hasattr(exc, "messages"):
        return ValidationError(exc.messages)
    return ValidationError(str(exc))


def get_client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def pdf_response(work_order, document_type):
    content = generate_work_order_pdf(work_order, document_type=document_type)
    filename = f"{document_type}-{work_order.number}.pdf".replace("/", "-")
    response = HttpResponse(content, content_type="application/pdf")
    response["Content-Disposition"] = f'inline; filename="{filename}"'
    return response


class PublicLandingView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        profile = WorkshopProfile.get_solo()
        data = PublicLandingSerializer(profile, context={"request": request}).data
        if not profile.landing_enabled:
            data["landing_enabled"] = False
        return Response(data)


class CustomerApprovalPublicView(APIView):
    permission_classes = [AllowAny]

    def get_object(self, token):
        return WorkOrderCustomerApproval.objects.select_related("work_order__customer", "work_order__vehicle", "requested_by").prefetch_related("work_order__services", "work_order__parts__part", "work_order__payments").get(token=token, is_active=True)

    def get(self, request, token):
        try:
            approval = self.get_object(token)
        except WorkOrderCustomerApproval.DoesNotExist:
            return Response({"detail": "Link de aprovação não encontrado ou indisponível."}, status=status.HTTP_404_NOT_FOUND)
        return Response(WorkOrderCustomerApprovalPublicSerializer(approval).data)

    def post(self, request, token):
        try:
            approval = self.get_object(token)
        except WorkOrderCustomerApproval.DoesNotExist:
            return Response({"detail": "Link de aprovação não encontrado ou indisponível."}, status=status.HTTP_404_NOT_FOUND)
        serializer = WorkOrderCustomerApprovalDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            approval.mark_decision(
                serializer.validated_data["decision"],
                name=serializer.validated_data.get("name", ""),
                document=serializer.validated_data.get("document", ""),
                notes=serializer.validated_data.get("notes", ""),
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
            )
        except DjangoValidationError as exc:
            raise drf_validation_from_django(exc) from exc
        event_type = WorkOrderEvent.EventType.UPDATED
        decision_label = "aprovou" if approval.status == WorkOrderCustomerApproval.Status.APPROVED else "recusou"
        record_event(
            approval.work_order,
            event_type,
            description=f"Cliente {decision_label} digitalmente o documento {approval.document_type_label}.",
            data={"approval_id": approval.id, "token": str(approval.token), "decision": approval.status, "decision_name": approval.decision_name},
        )
        return Response(WorkOrderCustomerApprovalPublicSerializer(approval).data)


class CustomerApprovalPdfView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            approval = WorkOrderCustomerApproval.objects.select_related("work_order__customer", "work_order__vehicle").prefetch_related("work_order__services", "work_order__parts__part", "work_order__payments").get(token=token, is_active=True)
        except WorkOrderCustomerApproval.DoesNotExist:
            return Response({"detail": "Link de aprovação não encontrado ou indisponível."}, status=status.HTTP_404_NOT_FOUND)
        return pdf_response(approval.work_order, approval.document_type)


class WorkshopProfileView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        profile = WorkshopProfile.get_solo()
        return Response(WorkshopProfileSerializer(profile, context={"request": request}).data)

    def put(self, request):
        if not user_has_permission(request.user, "settings.manage"):
            raise PermissionDenied("Você não tem permissão para alterar o cadastro da oficina.")
        profile = WorkshopProfile.get_solo()
        data = request.data.copy()
        if data.get("remove_logo") in {"true", "1", "yes"}:
            profile.logo.delete(save=False)
            data.pop("logo", None)
        data.pop("remove_logo", None)
        serializer = WorkshopProfileSerializer(profile, data=data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def patch(self, request):
        return self.put(request)


class GeneralCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = GeneralCategorySerializer
    permission_classes = [HasViewPermission]
    permission_code_map = {"read": "categories.view", "write": "categories.manage"}
    queryset = GeneralCategory.objects.all()

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        category_type = self.request.query_params.get("type")
        active = self.request.query_params.get("active")
        if search:
            qs = qs.filter(Q(code__icontains=search) | Q(name__icontains=search) | Q(description__icontains=search))
        if category_type:
            qs = qs.filter(type=category_type)
        if active in {"true", "false"}:
            qs = qs.filter(is_active=(active == "true"))
        return qs


class PartBrandViewSet(viewsets.ModelViewSet):
    serializer_class = PartBrandSerializer
    permission_classes = [HasViewPermission]
    permission_code_map = {"read": "parts.view", "write": "parts.manage"}
    queryset = PartBrand.objects.all()

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        active = self.request.query_params.get("active")
        if search:
            normalized_search = normalize_lookup_name(search)
            qs = qs.filter(Q(name__icontains=search) | Q(normalized_name__icontains=normalized_search))
        if active in {"true", "false"}:
            qs = qs.filter(is_active=(active == "true"))
        return qs.distinct()


class FipeLookupView(APIView):
    permission_classes = [HasViewPermission]
    permission_code = "vehicles.manage"
    base_url = "https://parallelum.com.br/fipe/api/v1"
    valid_vehicle_types = {"carros", "motos", "caminhoes"}

    def _get_json(self, path):
        try:
            response = requests.get(f"{self.base_url}/{path.lstrip('/')}", timeout=10)
            response.raise_for_status()
        except requests.RequestException as exc:
            return Response({"detail": "Falha ao consultar a API FIPE da Parallelum.", "error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(response.json())

    def get(self, request, resource):
        vehicle_type = request.query_params.get("vehicle_type", "carros")
        if vehicle_type not in self.valid_vehicle_types:
            raise ValidationError({"vehicle_type": "Use carros, motos ou caminhoes."})
        brand_code = request.query_params.get("brand_code")
        model_code = request.query_params.get("model_code")
        year_code = request.query_params.get("year_code")

        if resource == "brands":
            return self._get_json(f"{vehicle_type}/marcas")
        if resource == "models":
            if not brand_code:
                raise ValidationError({"brand_code": "Informe a marca."})
            return self._get_json(f"{vehicle_type}/marcas/{brand_code}/modelos")
        if resource == "years":
            if not brand_code or not model_code:
                raise ValidationError({"brand_code": "Informe a marca.", "model_code": "Informe o modelo."})
            return self._get_json(f"{vehicle_type}/marcas/{brand_code}/modelos/{model_code}/anos")
        if resource == "detail":
            if not brand_code or not model_code or not year_code:
                raise ValidationError({"brand_code": "Informe a marca.", "model_code": "Informe o modelo.", "year_code": "Informe o ano."})
            return self._get_json(f"{vehicle_type}/marcas/{brand_code}/modelos/{model_code}/anos/{year_code}")
        raise ValidationError({"resource": "Use brands, models, years ou detail."})


class WorkshopDashboardView(APIView):
    permission_classes = [HasViewPermission]
    permission_code = ["dashboard.attendance", "dashboard.stock", "dashboard.technical", "dashboard.finance"]

    def get(self, request):
        today = timezone.localdate()
        open_statuses = [WorkOrder.Status.OPEN, WorkOrder.Status.DIAGNOSIS, WorkOrder.Status.AWAITING_APPROVAL, WorkOrder.Status.APPROVED, WorkOrder.Status.IN_PROGRESS, WorkOrder.Status.QUALITY_CHECK, WorkOrder.Status.READY]
        month_start = today.replace(day=1)
        paid_month = WorkOrderPayment.objects.filter(paid_at__date__gte=month_start).aggregate(total=Sum("amount"))["total"] or 0
        return Response({
            "counts": {
                "vehicles": Vehicle.objects.count(),
                "parts": Part.objects.count(),
                "open_work_orders": WorkOrder.objects.filter(status__in=open_statuses).count(),
                "awaiting_approval": WorkOrder.objects.filter(status=WorkOrder.Status.AWAITING_APPROVAL).count(),
                "in_progress": WorkOrder.objects.filter(status=WorkOrder.Status.IN_PROGRESS).count(),
                "ready": WorkOrder.objects.filter(status=WorkOrder.Status.READY).count(),
                "delivered_today": WorkOrder.objects.filter(status=WorkOrder.Status.DELIVERED, delivered_at__date=today).count(),
                "low_stock_parts": Part.objects.filter(stock_quantity__lte=F("minimum_stock")).count(),
                "paid_month": paid_month,
            },
            "status_counts": list(WorkOrder.objects.values("status").annotate(total=Count("id")).order_by("status")),
            "recent_work_orders": WorkOrderListSerializer(WorkOrder.objects.select_related("customer", "vehicle", "assigned_to")[:10], many=True).data,
            "low_stock_parts": PartSerializer(Part.objects.filter(stock_quantity__lte=F("minimum_stock"))[:10], many=True).data,
        })


class RoleDashboardView(APIView):
    permission_classes = [HasViewPermission]

    def get(self, request, role):
        permission_by_role = {
            "dono": "users.manage",
            "administrativo": "users.manage",
            "atendimento": "dashboard.attendance",
            "estoque": "dashboard.stock",
            "tecnico": "dashboard.technical",
            "financeiro": "dashboard.finance",
        }
        required = permission_by_role.get(role)
        if required is None:
            raise ValidationError({"role": "Dashboard inválido."})
        if not user_has_permission(request.user, required):
            raise PermissionDenied("Você não tem permissão para este dashboard.")

        today = timezone.localdate()
        month_start = today.replace(day=1)
        open_statuses = [WorkOrder.Status.OPEN, WorkOrder.Status.DIAGNOSIS, WorkOrder.Status.AWAITING_APPROVAL, WorkOrder.Status.APPROVED, WorkOrder.Status.IN_PROGRESS, WorkOrder.Status.QUALITY_CHECK, WorkOrder.Status.READY]
        base = {
            "role": role,
            "counts": {},
            "recent_work_orders": WorkOrderListSerializer(WorkOrder.objects.select_related("customer", "vehicle", "assigned_to")[:10], many=True).data,
            "low_stock_parts": PartSerializer(Part.objects.filter(stock_quantity__lte=F("minimum_stock"))[:10], many=True).data,
            "recent_payments": WorkOrderPaymentSerializer(WorkOrderPayment.objects.select_related("work_order", "created_by")[:10], many=True).data,
        }

        if role in {"dono", "administrativo", "atendimento"}:
            base["counts"].update({
                "contacts": Contact.objects.count(),
                "vehicles": Vehicle.objects.count(),
                "open_work_orders": WorkOrder.objects.filter(status__in=open_statuses).count(),
                "awaiting_approval": WorkOrder.objects.filter(status=WorkOrder.Status.AWAITING_APPROVAL).count(),
                "delivered_today": WorkOrder.objects.filter(status=WorkOrder.Status.DELIVERED, delivered_at__date=today).count(),
            })
        if role in {"dono", "administrativo", "estoque"}:
            open_purchase_statuses = [PurchaseOrder.Status.DRAFT, PurchaseOrder.Status.REQUESTED, PurchaseOrder.Status.APPROVED, PurchaseOrder.Status.ORDERED, PurchaseOrder.Status.PARTIALLY_RECEIVED]
            base["counts"].update({
                "parts": Part.objects.count(),
                "low_stock_parts": Part.objects.filter(stock_quantity__lte=F("minimum_stock")).count(),
                "stock_movements_today": PartStockMovement.objects.filter(created_at__date=today).count(),
                "open_purchase_orders": PurchaseOrder.objects.filter(status__in=open_purchase_statuses).count(),
                "auto_purchase_orders": PurchaseOrder.objects.filter(origin=PurchaseOrder.Origin.AUTOMATIC, status__in=open_purchase_statuses).count(),
            })
        if role in {"dono", "administrativo", "tecnico"}:
            technician_qs = WorkOrderService.objects.select_related("work_order", "service", "technician")
            if get_user_role(request.user) == ROLE_TECHNICIAN:
                technician_qs = technician_qs.filter(Q(technician=request.user) | Q(work_order__assigned_to=request.user))
            base["counts"].update({
                "services_pending": technician_qs.filter(status=WorkOrderService.Status.PENDING).count(),
                "services_in_progress": technician_qs.filter(status=WorkOrderService.Status.IN_PROGRESS).count(),
                "services_done": technician_qs.filter(status=WorkOrderService.Status.DONE).count(),
            })
        if role in {"dono", "administrativo", "financeiro"}:
            paid_month = WorkOrderPayment.objects.filter(paid_at__date__gte=month_start).aggregate(total=Sum("amount"))["total"] or 0
            receivable_balance = AccountReceivable.objects.aggregate(total=Sum("balance_amount"))["total"] or 0
            payable_balance = AccountPayable.objects.aggregate(total=Sum("balance_amount"))["total"] or 0
            base["counts"].update({
                "paid_month": paid_month,
                "payments_today": WorkOrderPayment.objects.filter(paid_at__date=today).count(),
                "balance_due": receivable_balance,
                "payables_due": payable_balance,
                "projected_balance": receivable_balance - payable_balance,
                "open_receivables": AccountReceivable.objects.filter(status__in=[AccountReceivable.Status.OPEN, AccountReceivable.Status.PARTIAL, AccountReceivable.Status.OVERDUE]).count(),
                "overdue_receivables": AccountReceivable.objects.filter(status=AccountReceivable.Status.OVERDUE).count(),
                "open_payables": AccountPayable.objects.filter(status__in=[AccountPayable.Status.OPEN, AccountPayable.Status.PARTIAL, AccountPayable.Status.OVERDUE]).count(),
                "overdue_payables": AccountPayable.objects.filter(status=AccountPayable.Status.OVERDUE).count(),
            })
        return Response(base)


class TechnicalDashboardView(APIView):
    permission_classes = [HasViewPermission]
    permission_code = ["dashboard.technical", "technical.dashboard"]

    def _base_queryset(self, request):
        qs = WorkOrderService.objects.select_related("work_order", "work_order__customer", "work_order__vehicle", "service", "technician").exclude(work_order__status__in=[WorkOrder.Status.DELIVERED, WorkOrder.Status.CANCELLED])
        if get_user_role(request.user) == ROLE_TECHNICIAN:
            qs = qs.filter(Q(technician=request.user) | Q(work_order__assigned_to=request.user))
        specialty = request.query_params.get("specialty")
        if specialty:
            qs = qs.filter(technician__profile__technician_specialty=specialty)
        return qs.distinct()

    def get(self, request):
        qs = self._base_queryset(request)
        pending = qs.filter(status__in=[WorkOrderService.Status.PENDING, WorkOrderService.Status.APPROVED]).order_by("work_order__priority", "work_order__promised_at", "id")[:50]
        in_progress = qs.filter(status=WorkOrderService.Status.IN_PROGRESS).order_by("started_at", "id")[:50]
        done = qs.filter(status=WorkOrderService.Status.DONE).order_by("-finished_at", "-updated_at")[:50]
        today = timezone.localdate()
        return Response({
            "counts": {
                "pending": qs.filter(status__in=[WorkOrderService.Status.PENDING, WorkOrderService.Status.APPROVED]).count(),
                "in_progress": qs.filter(status=WorkOrderService.Status.IN_PROGRESS).count(),
                "done_today": qs.filter(status=WorkOrderService.Status.DONE, finished_at__date=today).count(),
                "quality_pending": qs.filter(status=WorkOrderService.Status.DONE, needs_quality_check=True, quality_checked_at__isnull=True).count(),
                "late_promised_orders": WorkOrder.objects.filter(status__in=[WorkOrder.Status.OPEN, WorkOrder.Status.DIAGNOSIS, WorkOrder.Status.APPROVED, WorkOrder.Status.IN_PROGRESS, WorkOrder.Status.QUALITY_CHECK], promised_at__date__lt=today).count(),
            },
            "pending_services": WorkOrderServiceSerializer(pending, many=True).data,
            "in_progress_services": WorkOrderServiceSerializer(in_progress, many=True).data,
            "done_services": WorkOrderServiceSerializer(done, many=True).data,
        })


class VehicleViewSet(viewsets.ModelViewSet):
    serializer_class = VehicleSerializer
    permission_classes = [HasViewPermission]
    permission_code_map = {"read": "vehicles.view", "write": "vehicles.manage"}
    queryset = Vehicle.objects.select_related("customer").all()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        customer_id = self.request.query_params.get("customer")
        active = self.request.query_params.get("active")
        if search:
            qs = qs.filter(Q(plate__icontains=search) | Q(make__icontains=search) | Q(model__icontains=search) | Q(customer__first_name__icontains=search) | Q(customer__last_name__icontains=search) | Q(customer__email__icontains=search))
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        if active in {"true", "false"}:
            qs = qs.filter(is_active=(active == "true"))
        return qs


class WorkshopServiceViewSet(viewsets.ModelViewSet):
    serializer_class = WorkshopServiceSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    permission_classes = [HasViewPermission]
    permission_code_map = {"read": "services.view", "write": "services.manage"}
    queryset = WorkshopService.objects.select_related("category").all()

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        category_id = self.request.query_params.get("category")
        active = self.request.query_params.get("active")
        ordering = self.request.query_params.get("ordering")
        qs = qs.annotate(usage_count=Count("work_order_lines", distinct=True))
        if search:
            qs = qs.filter(Q(code__icontains=search) | Q(name__icontains=search) | Q(category__name__icontains=search) | Q(legacy_category_name__icontains=search))
        if category_id:
            qs = qs.filter(category_id=category_id)
        if active in {"true", "false"}:
            qs = qs.filter(is_active=(active == "true"))
        if ordering == "most_used":
            return qs.order_by("-is_featured", "-usage_count", "category__name", "name")
        return qs




class ServicePackageViewSet(viewsets.ModelViewSet):
    serializer_class = ServicePackageSerializer
    permission_classes = [HasViewPermission]
    permission_code_map = {"read": "service_packages.view", "write": "service_packages.manage"}
    queryset = ServicePackage.objects.prefetch_related("items__service").all()

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        active = self.request.query_params.get("active")
        if search:
            qs = qs.filter(Q(code__icontains=search) | Q(name__icontains=search) | Q(description__icontains=search))
        if active in {"true", "false"}:
            qs = qs.filter(is_active=(active == "true"))
        return qs.distinct()


class PartViewSet(viewsets.ModelViewSet):
    serializer_class = PartSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    permission_classes = [HasViewPermission]
    permission_code_map = {"read": "parts.view", "write": "parts.manage", "adjust_stock": "stock.adjust"}
    queryset = Part.objects.select_related("category").all()

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        category_id = self.request.query_params.get("category")
        low_stock = self.request.query_params.get("low_stock")
        active = self.request.query_params.get("active")
        ordering = self.request.query_params.get("ordering")
        qs = qs.annotate(usage_count=Count("work_order_lines", distinct=True))
        if search:
            qs = qs.filter(Q(sku__icontains=search) | Q(name__icontains=search) | Q(brand__icontains=search) | Q(category__name__icontains=search))
        if category_id:
            qs = qs.filter(category_id=category_id)
        if low_stock == "true":
            qs = qs.filter(stock_quantity__lte=F("minimum_stock"))
        if active in {"true", "false"}:
            qs = qs.filter(is_active=(active == "true"))
        if ordering == "most_used":
            return qs.order_by("-is_featured", "-usage_count", "category__name", "name", "sku")
        return qs

    @action(detail=True, methods=["post"])
    def adjust_stock(self, request, pk=None):
        part = self.get_object()
        serializer = StockAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        movement = adjust_part_stock(part, quantity=data["quantity"], movement_type=data["movement_type"], actor=request.user, notes=data.get("notes", ""), unit_cost=data.get("unit_cost"))
        part.refresh_from_db()
        return Response({"part": PartSerializer(part).data, "movement": PartStockMovementSerializer(movement).data})


class PartStockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PartStockMovementSerializer
    permission_classes = [HasViewPermission]
    permission_code = "stock.view"
    queryset = PartStockMovement.objects.select_related("part", "work_order", "actor").all()

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("part"):
            qs = qs.filter(part_id=self.request.query_params["part"])
        if self.request.query_params.get("work_order"):
            qs = qs.filter(work_order_id=self.request.query_params["work_order"])
        return qs


class WorkOrderViewSet(viewsets.ModelViewSet):
    permission_classes = [HasViewPermission]
    permission_code_map = {"read": "work_orders.view", "create": "work_orders.create", "update": "work_orders.edit", "partial_update": "work_orders.edit", "destroy": "work_orders.edit", "change_status": "work_orders.status", "send_message": "messages.send", "recalculate": ["work_orders.edit", "payments.manage"], "trigger_notifications": "messages.send", "document": "work_orders.view", "customer_approvals": "work_orders.view", "create_customer_approval": "work_orders.edit", "delivery_signature": "work_orders.view", "create_delivery_signature": "work_orders.edit", "delivery_receipt": "work_orders.view"}
    queryset = WorkOrder.objects.select_related("customer", "vehicle", "assigned_to", "created_by", "updated_by").prefetch_related("services__service", "services__source_package", "services__checklist_items", "parts__part", "payments", "photos__uploaded_by", "events__actor", "messages__template", "messages__message_log")

    def get_serializer_class(self):
        if self.action == "list":
            return WorkOrderListSerializer
        if self.action == "retrieve":
            return WorkOrderDetailSerializer
        return WorkOrderSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        status_value = self.request.query_params.get("status")
        customer_id = self.request.query_params.get("customer")
        vehicle_id = self.request.query_params.get("vehicle")
        priority = self.request.query_params.get("priority")
        assigned_to = self.request.query_params.get("assigned_to")
        if search:
            qs = qs.filter(Q(number__icontains=search) | Q(title__icontains=search) | Q(complaint__icontains=search) | Q(customer__first_name__icontains=search) | Q(customer__last_name__icontains=search) | Q(vehicle__plate__icontains=search))
        if status_value:
            qs = qs.filter(status=status_value)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        if vehicle_id:
            qs = qs.filter(vehicle_id=vehicle_id)
        if priority:
            qs = qs.filter(priority=priority)
        if assigned_to:
            qs = qs.filter(assigned_to_id=assigned_to)
        if get_user_role(self.request.user) == ROLE_TECHNICIAN:
            qs = qs.filter(Q(assigned_to=self.request.user) | Q(services__technician=self.request.user))
        return qs.distinct()

    def perform_create(self, serializer):
        work_order = serializer.save(created_by=self.request.user, updated_by=self.request.user)
        record_event(work_order, WorkOrderEvent.EventType.CREATED, actor=self.request.user, description="Ordem de servico criada.", new_status=work_order.status)

    def perform_update(self, serializer):
        work_order = serializer.save(updated_by=self.request.user)
        record_event(work_order, WorkOrderEvent.EventType.UPDATED, actor=self.request.user, description="Ordem de servico atualizada.")

    @action(detail=True, methods=["post"])
    def change_status(self, request, pk=None):
        serializer = ChangeWorkOrderStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            updated, message_ids = change_work_order_status(self.get_object(), serializer.validated_data["status"], actor=request.user, note=serializer.validated_data.get("note", ""), send_notifications=serializer.validated_data.get("send_notifications", True))
        except DjangoValidationError as exc:
            raise drf_validation_from_django(exc) from exc
        return Response({"work_order": WorkOrderDetailSerializer(updated).data, "work_order_message_ids": message_ids})

    @action(detail=True, methods=["post"])
    def send_message(self, request, pk=None):
        serializer = SendWorkOrderMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            relation = send_work_order_message(self.get_object(), serializer.validated_data["template"], actor=request.user)
        except DjangoValidationError as exc:
            raise drf_validation_from_django(exc) from exc
        return Response(WorkOrderMessageSerializer(relation).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def recalculate(self, request, pk=None):
        work_order = self.get_object()
        work_order.recalculate_totals()
        return Response(WorkOrderDetailSerializer(work_order).data)

    @action(detail=True, methods=["get"])
    def document(self, request, pk=None):
        document_type = request.query_params.get("type") or WorkOrderCustomerApproval.DocumentType.WORK_ORDER
        if document_type not in dict(WorkOrderCustomerApproval.DocumentType.choices):
            raise ValidationError({"type": "Tipo de documento inválido."})
        return pdf_response(self.get_object(), document_type)

    @action(detail=True, methods=["get"])
    def customer_approvals(self, request, pk=None):
        approvals = self.get_object().customer_approvals.select_related("requested_by").all()
        return Response(WorkOrderCustomerApprovalSerializer(approvals, many=True).data)

    @action(detail=True, methods=["post"])
    def create_customer_approval(self, request, pk=None):
        serializer = WorkOrderCustomerApprovalCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        work_order = self.get_object()
        expires_days = serializer.validated_data.get("expires_days") or 7
        approval = WorkOrderCustomerApproval.objects.create(
            work_order=work_order,
            document_type=serializer.validated_data["document_type"],
            requested_by=request.user,
            expires_at=timezone.now() + timezone.timedelta(days=expires_days),
        )
        base_url = request.data.get("frontend_base_url") or getattr(request, "frontend_base_url", "") or ""
        if not base_url:
            from django.conf import settings
            base_url = getattr(settings, "FRONTEND_BASE_URL", "") or request.build_absolute_uri("/").rstrip("/api/")
        public_url = f"{str(base_url).rstrip('/')}{approval.public_url_path}"
        record_event(
            work_order,
            WorkOrderEvent.EventType.UPDATED,
            actor=request.user,
            description=f"Link de aprovação digital gerado para {approval.document_type_label}.",
            data={"approval_id": approval.id, "document_type": approval.document_type, "expires_at": approval.expires_at.isoformat() if approval.expires_at else None},
        )
        data = WorkOrderCustomerApprovalSerializer(approval).data
        data["public_url"] = public_url
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def trigger_notifications(self, request, pk=None):
        return Response({"work_order_message_ids": trigger_status_notifications(self.get_object(), actor=request.user)})

    @action(detail=True, methods=["get"], url_path="delivery-signature")
    def delivery_signature(self, request, pk=None):
        work_order = self.get_object()
        try:
            signature = work_order.delivery_signature
        except WorkOrderDeliverySignature.DoesNotExist:
            return Response(None)
        return Response(WorkOrderDeliverySignatureSerializer(signature, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="delivery-signature")
    def create_delivery_signature(self, request, pk=None):
        work_order = self.get_object()
        profile = WorkshopProfile.get_solo()
        if not profile.delivery_signature_enabled:
            raise ValidationError({"detail": "Assinatura digital de entrega está desativada nas configurações administrativas."})
        serializer = WorkOrderDeliverySignatureCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        signature, _created = WorkOrderDeliverySignature.objects.update_or_create(
            work_order=work_order,
            defaults={
                "recipient_name": serializer.validated_data["recipient_name"],
                "recipient_document": serializer.validated_data.get("recipient_document", ""),
                "notes": serializer.validated_data.get("notes", ""),
                "signature_image": serializer.validated_data["signature_data_url"],
                "signed_ip": get_client_ip(request),
                "signed_user_agent": request.META.get("HTTP_USER_AGENT", ""),
                "signed_by_user": request.user,
                "signed_at": timezone.now(),
            },
        )
        if work_order.status != WorkOrder.Status.DELIVERED:
            work_order.status = WorkOrder.Status.DELIVERED
            work_order.delivered_at = timezone.now()
            work_order.save(update_fields=["status", "delivered_at", "updated_at"])
        record_event(
            work_order,
            WorkOrderEvent.EventType.DELIVERY_SIGNED,
            actor=request.user,
            description=f"Entrega assinada digitalmente por {signature.recipient_name}.",
            data={"delivery_signature_id": signature.id, "recipient_document": signature.recipient_document},
        )
        return Response(WorkOrderDeliverySignatureSerializer(signature, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="delivery-receipt")
    def delivery_receipt(self, request, pk=None):
        return pdf_response(self.get_object(), "delivery_receipt")


class WorkshopServiceChecklistTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = WorkshopServiceChecklistTemplateSerializer
    permission_classes = [HasViewPermission]
    permission_code_map = {"read": "services.view", "write": "services.manage"}
    queryset = WorkshopServiceChecklistTemplate.objects.select_related("service").all()

    def get_queryset(self):
        qs = super().get_queryset()
        service_id = self.request.query_params.get("service")
        active = self.request.query_params.get("active")
        if service_id:
            qs = qs.filter(service_id=service_id)
        if active in {"true", "false"}:
            qs = qs.filter(is_active=(active == "true"))
        return qs.order_by("service_id", "sort_order", "id")


class WorkOrderServiceChecklistItemViewSet(viewsets.ModelViewSet):
    serializer_class = WorkOrderServiceChecklistItemSerializer
    permission_classes = [HasViewPermission]
    permission_code_map = {"read": "work_orders.view", "write": ["technical.execute", "work_orders.edit"]}
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    queryset = WorkOrderServiceChecklistItem.objects.select_related("work_order", "work_order_service", "completed_by", "source_template").all()

    def get_queryset(self):
        qs = super().get_queryset()
        work_order_id = self.request.query_params.get("work_order")
        service_line_id = self.request.query_params.get("work_order_service")
        if work_order_id:
            qs = qs.filter(work_order_id=work_order_id)
        if service_line_id:
            qs = qs.filter(work_order_service_id=service_line_id)
        return qs.order_by("work_order_service_id", "sort_order", "id")

    def perform_update(self, serializer):
        instance = serializer.save(completed_by=self.request.user if serializer.validated_data.get("is_completed") else None)
        record_event(
            instance.work_order,
            WorkOrderEvent.EventType.CHECKLIST_UPDATED,
            actor=self.request.user,
            description=f"Checklist técnico atualizado: {instance.description}.",
            data={"checklist_item_id": instance.id, "completed": instance.is_completed},
        )


class WorkOrderServiceViewSet(viewsets.ModelViewSet):
    serializer_class = WorkOrderServiceSerializer
    permission_classes = [HasViewPermission]
    permission_code_map = {
        "read": "work_order_services.view",
        "write": "work_order_services.manage",
        "start_execution": "technical.execute",
        "complete_execution": "technical.execute",
        "quality_check": ["technical.quality_check", "work_orders.edit"],
    }
    queryset = WorkOrderService.objects.select_related("work_order", "work_order__customer", "work_order__vehicle", "service", "source_package", "technician", "quality_checked_by").all()

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("work_order"):
            qs = qs.filter(work_order_id=self.request.query_params["work_order"])
        if self.request.query_params.get("status"):
            qs = qs.filter(status=self.request.query_params["status"])
        if self.request.query_params.get("technician"):
            qs = qs.filter(technician_id=self.request.query_params["technician"])
        if self.request.query_params.get("mine") == "true":
            qs = qs.filter(Q(technician=self.request.user) | Q(work_order__assigned_to=self.request.user))
        if get_user_role(self.request.user) == ROLE_TECHNICIAN:
            qs = qs.filter(Q(technician=self.request.user) | Q(work_order__assigned_to=self.request.user))
        return qs.distinct()

    @action(detail=True, methods=["post"], url_path="start-execution")
    def start_execution(self, request, pk=None):
        serializer = StartWorkOrderServiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            service_line = start_work_order_service(self.get_object(), actor=request.user, note=serializer.validated_data.get("note", ""))
        except DjangoValidationError as exc:
            raise drf_validation_from_django(exc) from exc
        return Response(WorkOrderServiceSerializer(service_line).data)

    @action(detail=True, methods=["post"], url_path="complete-execution")
    def complete_execution(self, request, pk=None):
        serializer = CompleteWorkOrderServiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            service_line = complete_work_order_service(
                self.get_object(),
                actor=request.user,
                technical_diagnosis=serializer.validated_data.get("technical_diagnosis", ""),
                execution_notes=serializer.validated_data.get("execution_notes", ""),
                checklist=serializer.validated_data.get("checklist", {}),
                mark_order_quality_check=serializer.validated_data.get("mark_order_quality_check", True),
            )
        except DjangoValidationError as exc:
            raise drf_validation_from_django(exc) from exc
        return Response(WorkOrderServiceSerializer(service_line).data)

    @action(detail=True, methods=["post"], url_path="quality-check")
    def quality_check(self, request, pk=None):
        serializer = QualityCheckWorkOrderServiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            service_line = quality_check_work_order_service(self.get_object(), actor=request.user, approved=serializer.validated_data.get("approved", True), notes=serializer.validated_data.get("notes", ""))
        except DjangoValidationError as exc:
            raise drf_validation_from_django(exc) from exc
        return Response(WorkOrderServiceSerializer(service_line).data)


class WorkOrderPartViewSet(viewsets.ModelViewSet):
    serializer_class = WorkOrderPartSerializer
    permission_classes = [HasViewPermission]
    permission_code_map = {"read": "work_order_parts.view", "write": "work_order_parts.manage"}
    queryset = WorkOrderPart.objects.select_related("work_order", "part", "stock_movement").all()

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("work_order"):
            qs = qs.filter(work_order_id=self.request.query_params["work_order"])
        return qs

    def perform_create(self, serializer):
        line = serializer.save()
        from purchasing.services import ensure_purchase_for_work_order_part

        ensure_purchase_for_work_order_part(line, actor=self.request.user)

    def perform_update(self, serializer):
        line = serializer.save()
        from purchasing.services import ensure_purchase_for_work_order_part

        ensure_purchase_for_work_order_part(line, actor=self.request.user)


class WorkOrderPaymentViewSet(viewsets.ModelViewSet):
    serializer_class = WorkOrderPaymentSerializer
    permission_classes = [HasViewPermission]
    permission_code_map = {"read": "payments.view", "write": "payments.manage"}
    queryset = WorkOrderPayment.objects.select_related("work_order", "created_by").all()

    def perform_create(self, serializer):
        payment = serializer.save(created_by=self.request.user)
        record_event(payment.work_order, WorkOrderEvent.EventType.PAYMENT_ADDED, actor=self.request.user, description=f"Pagamento registrado: {payment.amount}.", data={"payment_id": payment.id, "method": payment.method, "amount": str(payment.amount)})

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("work_order"):
            qs = qs.filter(work_order_id=self.request.query_params["work_order"])
        return qs


class WorkOrderPhotoViewSet(viewsets.ModelViewSet):
    serializer_class = WorkOrderPhotoSerializer
    permission_classes = [HasViewPermission]
    permission_code_map = {"read": "work_orders.view", "write": ["work_orders.edit", "work_orders.create"]}
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    queryset = WorkOrderPhoto.objects.select_related("work_order", "uploaded_by").all()

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("work_order"):
            qs = qs.filter(work_order_id=self.request.query_params["work_order"])
        if self.request.query_params.get("photo_type"):
            qs = qs.filter(photo_type=self.request.query_params["photo_type"])
        return qs

    def perform_create(self, serializer):
        photo = serializer.save(uploaded_by=self.request.user)
        record_event(
            photo.work_order,
            WorkOrderEvent.EventType.PHOTO_ADDED,
            actor=self.request.user,
            description=f"Foto adicionada: {photo.get_photo_type_display()}.",
            data={"photo_id": photo.id, "photo_type": photo.photo_type, "caption": photo.caption, "sha256": photo.sha256},
        )


class WorkOrderEventViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = WorkOrderEventSerializer
    permission_classes = [HasViewPermission]
    permission_code = "work_orders.view"
    queryset = WorkOrderEvent.objects.select_related("work_order", "actor").all()

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("work_order"):
            qs = qs.filter(work_order_id=self.request.query_params["work_order"])
        return qs


class WorkOrderMessageViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = WorkOrderMessageSerializer
    permission_classes = [HasViewPermission]
    permission_code = "work_orders.view"
    queryset = WorkOrderMessage.objects.select_related("work_order", "template", "notification_rule", "message_log", "created_by").all()

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("work_order"):
            qs = qs.filter(work_order_id=self.request.query_params["work_order"])
        return qs


class WorkOrderNotificationRuleViewSet(viewsets.ModelViewSet):
    serializer_class = WorkOrderNotificationRuleSerializer
    permission_classes = [HasViewPermission]
    permission_code = "messaging.manage"
    queryset = WorkOrderNotificationRule.objects.select_related("template", "created_by").all()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("trigger_status"):
            qs = qs.filter(trigger_status=self.request.query_params["trigger_status"])
        if self.request.query_params.get("channel"):
            qs = qs.filter(channel=self.request.query_params["channel"])
        active = self.request.query_params.get("active")
        search = self.request.query_params.get("search")
        if active in {"true", "false"}:
            qs = qs.filter(is_active=(active == "true"))
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(template__name__icontains=search))
        return qs
