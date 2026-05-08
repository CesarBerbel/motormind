from django.urls import path

from .views import (
    ExecutiveSummaryReportView,
    FinanceReportCsvView,
    FinanceReportView,
    InventoryReportCsvView,
    InventoryReportView,
    WorkOrdersReportCsvView,
    WorkOrdersReportView,
)

urlpatterns = [
    path("executive-summary/", ExecutiveSummaryReportView.as_view(), name="reports-executive-summary"),
    path("work-orders/", WorkOrdersReportView.as_view(), name="reports-work-orders"),
    path("finance/", FinanceReportView.as_view(), name="reports-finance"),
    path("inventory/", InventoryReportView.as_view(), name="reports-inventory"),
    path("work-orders/export.csv", WorkOrdersReportCsvView.as_view(), name="reports-work-orders-csv"),
    path("finance/export.csv", FinanceReportCsvView.as_view(), name="reports-finance-csv"),
    path("inventory/export.csv", InventoryReportCsvView.as_view(), name="reports-inventory-csv"),
]
