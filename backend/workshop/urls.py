from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    CustomerApprovalPdfView,
    CustomerApprovalPublicView,
    FipeLookupView,
    GeneralCategoryViewSet,
    PartBrandViewSet,
    PartStockMovementViewSet,
    PartViewSet,
    RoleDashboardView,
    ServicePackageViewSet,
    TechnicalDashboardView,
    VehicleViewSet,
    WorkOrderEventViewSet,
    WorkOrderMessageViewSet,
    WorkOrderNotificationRuleViewSet,
    WorkOrderPhotoViewSet,
    WorkOrderPartViewSet,
    WorkOrderPaymentViewSet,
    WorkOrderServiceViewSet,
    WorkOrderViewSet,
    WorkshopDashboardView,
    WorkshopProfileView,
    WorkshopServiceChecklistTemplateViewSet,
    WorkOrderServiceChecklistItemViewSet,
    PublicLandingView,
    WorkshopServiceViewSet,
)

router = DefaultRouter()
router.register("categories", GeneralCategoryViewSet, basename="workshop-category")
router.register("vehicles", VehicleViewSet, basename="workshop-vehicle")
router.register("services", WorkshopServiceViewSet, basename="workshop-service")
router.register("service-checklist-templates", WorkshopServiceChecklistTemplateViewSet, basename="workshop-service-checklist-template")
router.register("service-packages", ServicePackageViewSet, basename="workshop-service-package")
router.register("part-brands", PartBrandViewSet, basename="workshop-part-brand")
router.register("parts", PartViewSet, basename="workshop-part")
router.register("stock-movements", PartStockMovementViewSet, basename="workshop-stock-movement")
router.register("work-orders", WorkOrderViewSet, basename="workshop-work-order")
router.register("work-order-services", WorkOrderServiceViewSet, basename="workshop-work-order-service")
router.register("work-order-checklist-items", WorkOrderServiceChecklistItemViewSet, basename="workshop-work-order-checklist-item")
router.register("work-order-parts", WorkOrderPartViewSet, basename="workshop-work-order-part")
router.register("work-order-photos", WorkOrderPhotoViewSet, basename="workshop-work-order-photo")
router.register("work-order-payments", WorkOrderPaymentViewSet, basename="workshop-work-order-payment")
router.register("work-order-events", WorkOrderEventViewSet, basename="workshop-work-order-event")
router.register("work-order-messages", WorkOrderMessageViewSet, basename="workshop-work-order-message")
router.register("notification-rules", WorkOrderNotificationRuleViewSet, basename="workshop-notification-rule")

urlpatterns = [
    path("public/landing/", PublicLandingView.as_view(), name="workshop-public-landing"),
    path("customer-approvals/<uuid:token>/", CustomerApprovalPublicView.as_view(), name="workshop-customer-approval-public"),
    path("customer-approvals/<uuid:token>/pdf/", CustomerApprovalPdfView.as_view(), name="workshop-customer-approval-pdf"),
    path("dashboard/", WorkshopDashboardView.as_view(), name="workshop-dashboard"),
    path("company-profile/", WorkshopProfileView.as_view(), name="workshop-company-profile"),
    path("dashboards/<str:role>/", RoleDashboardView.as_view(), name="workshop-role-dashboard"),
    path("technical/dashboard/", TechnicalDashboardView.as_view(), name="workshop-technical-dashboard"),
    path("fipe/<str:resource>/", FipeLookupView.as_view(), name="workshop-fipe"),
]
urlpatterns += router.urls
