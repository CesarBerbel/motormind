from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AccountPayableViewSet, AccountReceivableViewSet, CashFlowView, FinanceDashboardView

router = DefaultRouter()
router.register("accounts-receivable", AccountReceivableViewSet, basename="finance-account-receivable")
router.register("accounts-payable", AccountPayableViewSet, basename="finance-account-payable")

urlpatterns = [
    path("dashboard/", FinanceDashboardView.as_view(), name="finance-dashboard"),
    path("cash-flow/", CashFlowView.as_view(), name="finance-cash-flow"),
]
urlpatterns += router.urls
