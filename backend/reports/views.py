from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import HasViewPermission

from .services import (
    executive_summary,
    export_finance_csv,
    export_inventory_csv,
    export_work_orders_csv,
    finance_report,
    inventory_report,
    work_orders_report,
)


class ReportPermissionMixin:
    permission_classes = [HasViewPermission]
    permission_code = "reports.view"


class ExecutiveSummaryReportView(ReportPermissionMixin, APIView):
    def get(self, request):
        return Response(executive_summary(request))


class WorkOrdersReportView(ReportPermissionMixin, APIView):
    def get(self, request):
        return Response(work_orders_report(request))


class FinanceReportView(ReportPermissionMixin, APIView):
    def get(self, request):
        return Response(finance_report(request))


class InventoryReportView(ReportPermissionMixin, APIView):
    def get(self, request):
        return Response(inventory_report(request))


class WorkOrdersReportCsvView(ReportPermissionMixin, APIView):
    def get(self, request):
        return export_work_orders_csv(request)


class FinanceReportCsvView(ReportPermissionMixin, APIView):
    def get(self, request):
        return export_finance_csv(request)


class InventoryReportCsvView(ReportPermissionMixin, APIView):
    def get(self, request):
        return export_inventory_csv(request)
