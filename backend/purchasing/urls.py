from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import PurchaseOrderViewSet, PurchasingDashboardView, SupplierViewSet

router = DefaultRouter()
router.register("suppliers", SupplierViewSet, basename="purchasing-supplier")
router.register("purchase-orders", PurchaseOrderViewSet, basename="purchasing-purchase-order")

urlpatterns = [
    path("dashboard/", PurchasingDashboardView.as_view(), name="purchasing-dashboard"),
]
urlpatterns += router.urls
