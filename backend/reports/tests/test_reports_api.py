from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from messaging.models import Contact
from workshop.models import Part, PartStockMovement, Vehicle, WorkOrder, WorkOrderPart, WorkOrderPayment, WorkOrderService, WorkshopService
from finance.models import AccountPayable, AccountReceivable


@override_settings(ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"])
class ReportsApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_superuser(username="owner", email="owner@example.com", password="testpass123")
        self.client.force_authenticate(self.user)
        self.customer = Contact.objects.create(first_name="Cliente Relatório", email="cliente@example.com")
        self.vehicle = Vehicle.objects.create(customer=self.customer, plate="ABC1D23", make="Fiat", model="Uno", year=2020)
        self.service = WorkshopService.objects.create(name="Troca de óleo", default_unit_price=Decimal("120.00"))
        self.part = Part.objects.create(sku="OLEO-1", name="Óleo 5W30", unit="un", cost_price=Decimal("35.00"), sale_price=Decimal("55.00"), stock_quantity=Decimal("2.00"), minimum_stock=Decimal("5.00"))
        self.order = WorkOrder.objects.create(customer=self.customer, vehicle=self.vehicle, status=WorkOrder.Status.DELIVERED, delivered_at=timezone.now(), title="OS relatório", created_by=self.user)
        WorkOrderService.objects.create(work_order=self.order, service=self.service, quantity=Decimal("1.00"), unit_price=Decimal("120.00"))
        WorkOrderPart.objects.create(work_order=self.order, part=self.part, quantity=Decimal("2.00"), unit_price=Decimal("55.00"), cost_price=Decimal("35.00"))
        self.order.recalculate_totals(save=True)
        WorkOrderPayment.objects.create(work_order=self.order, amount=Decimal("230.00"), method=WorkOrderPayment.Method.PIX, created_by=self.user)
        PartStockMovement.objects.create(part=self.part, movement_type=PartStockMovement.MovementType.CONSUMPTION, quantity=Decimal("-2.00"), unit_cost=Decimal("35.00"), work_order=self.order, actor=self.user)
        AccountReceivable.objects.create(customer=self.customer, description="Receber relatório", amount=Decimal("230.00"), due_date=timezone.localdate())
        AccountPayable.objects.create(description="Pagar relatório", category="Teste", amount=Decimal("80.00"), due_date=timezone.localdate(), created_by=self.user)

    def test_executive_summary_report(self):
        response = self.client.get("/api/reports/executive-summary/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("cards", response.data)
        self.assertIn("work_order_status", response.data)
        self.assertGreaterEqual(response.data["cards"]["work_order_count_period"], 1)

    def test_work_orders_report_and_csv(self):
        response = self.client.get("/api/reports/work-orders/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("summary", response.data)
        self.assertIn("rows", response.data)
        csv_response = self.client.get("/api/reports/work-orders/export.csv")
        self.assertEqual(csv_response.status_code, 200)
        self.assertIn("text/csv", csv_response["Content-Type"])

    def test_finance_report_and_csv(self):
        response = self.client.get("/api/reports/finance/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("summary", response.data)
        self.assertIn("rows", response.data)
        csv_response = self.client.get("/api/reports/finance/export.csv")
        self.assertEqual(csv_response.status_code, 200)
        self.assertIn("text/csv", csv_response["Content-Type"])

    def test_inventory_report_and_csv(self):
        response = self.client.get("/api/reports/inventory/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("summary", response.data)
        self.assertIn("rows", response.data)
        self.assertGreaterEqual(response.data["summary"]["low_stock_parts"], 1)
        csv_response = self.client.get("/api/reports/inventory/export.csv")
        self.assertEqual(csv_response.status_code, 200)
        self.assertIn("text/csv", csv_response["Content-Type"])
