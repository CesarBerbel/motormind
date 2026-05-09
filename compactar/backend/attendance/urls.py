from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AttendanceDashboardView, CounterSaleViewSet, EstimateViewSet

router = DefaultRouter()
router.register("counter-sales", CounterSaleViewSet, basename="attendance-counter-sale")
router.register("estimates", EstimateViewSet, basename="attendance-estimate")

urlpatterns = [
    path("dashboard/", AttendanceDashboardView.as_view(), name="attendance-dashboard"),
]
urlpatterns += router.urls
