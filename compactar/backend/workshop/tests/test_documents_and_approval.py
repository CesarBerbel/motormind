from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from messaging.models import Contact
from workshop.models import Vehicle, WorkOrder, WorkOrderCustomerApproval, WorkshopService, Part


@override_settings(ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"], FRONTEND_BASE_URL="http://localhost:5173")
class WorkOrderDocumentsAndApprovalTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_superuser(username="owner", email="owner@example.com", password="testpass123")
        self.client.force_authenticate(self.user)
        self.customer = Contact.objects.create(first_name="Cliente Teste", email="cliente@example.com")
        self.vehicle = Vehicle.objects.create(customer=self.customer, plate="ABC1D23", make="VW", model="Gol", year=2020)
        self.work_order = WorkOrder.objects.create(customer=self.customer, vehicle=self.vehicle, title="Revisão", complaint="Barulho ao frear", created_by=self.user, updated_by=self.user)
        self.service = WorkshopService.objects.create(name="Diagnóstico", default_unit_price="120.00")
        self.part = Part.objects.create(sku="P001", name="Pastilha", unit="un", sale_price="80.00", cost_price="40.00")

    def test_can_generate_work_order_pdf(self):
        response = self.client.get(f"/api/workshop/work-orders/{self.work_order.id}/document/?type=work_order")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))

    def test_can_create_public_approval_link_and_approve(self):
        create_response = self.client.post(
            f"/api/workshop/work-orders/{self.work_order.id}/create_customer_approval/",
            {"document_type": "estimate", "expires_days": 5},
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        self.assertIn("public_url", create_response.data)
        token = create_response.data["token"]

        self.client.force_authenticate(user=None)
        detail_response = self.client.get(f"/api/workshop/customer-approvals/{token}/")
        self.assertEqual(detail_response.status_code, 200)
        self.assertTrue(detail_response.data["can_decide"])

        decision_response = self.client.post(
            f"/api/workshop/customer-approvals/{token}/",
            {"decision": "approved", "name": "Cliente Teste", "document": "123", "notes": "Aprovado."},
            format="json",
        )
        self.assertEqual(decision_response.status_code, 200)
        self.assertEqual(decision_response.data["effective_status"], WorkOrderCustomerApproval.Status.APPROVED)

        pdf_response = self.client.get(f"/api/workshop/customer-approvals/{token}/pdf/")
        self.assertEqual(pdf_response.status_code, 200)
        self.assertEqual(pdf_response["Content-Type"], "application/pdf")
