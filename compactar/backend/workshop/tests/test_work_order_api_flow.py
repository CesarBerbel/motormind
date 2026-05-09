from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from messaging.models import Contact
from workshop.models import Part, Vehicle, WorkOrder, WorkshopService


@override_settings(ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"])
class WorkOrderApiFlowTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser(
            username="owner-workshop",
            email="owner-workshop@example.com",
            password="senha-forte-123",
        )
        self.client.force_authenticate(self.user)

    def test_create_customer_vehicle_service_part_and_work_order(self):
        contact_response = self.client.post(
            "/api/contacts/",
            {
                "person_type": "individual",
                "first_name": "Cliente",
                "last_name": "Teste",
                "email": "cliente@example.com",
                "phone_e164": "+5511999999999",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(contact_response.status_code, status.HTTP_201_CREATED, contact_response.data)
        contact_id = contact_response.data["id"]

        vehicle_response = self.client.post(
            "/api/workshop/vehicles/",
            {
                "customer_id": contact_id,
                "plate": "ABC1D23",
                "make": "Fiat",
                "model": "Uno",
                "year": 2015,
                "color": "Branco",
                "odometer_km": 100000,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(vehicle_response.status_code, status.HTTP_201_CREATED, vehicle_response.data)
        vehicle_id = vehicle_response.data["id"]

        service_response = self.client.post(
            "/api/workshop/services/",
            {
                "code": "REV-TESTE",
                "name": "Revisão teste",
                "description": "Serviço criado pelo teste automatizado.",
                "default_unit_price": "120.00",
                "estimated_hours": "1.00",
                "is_featured": True,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(service_response.status_code, status.HTTP_201_CREATED, service_response.data)

        part_response = self.client.post(
            "/api/workshop/parts/",
            {
                "sku": "PCA-TESTE-001",
                "name": "Filtro teste API",
                "brand": "Marca Teste",
                "unit": "un",
                "cost_price": "20.00",
                "sale_price": "35.00",
                "stock_quantity": "5.00",
                "minimum_stock": "1.00",
                "is_featured": True,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(part_response.status_code, status.HTTP_201_CREATED, part_response.data)

        work_order_response = self.client.post(
            "/api/workshop/work-orders/",
            {
                "customer_id": contact_id,
                "vehicle_id": vehicle_id,
                "title": "OS de teste automatizado",
                "complaint": "Cliente solicitou revisão geral.",
                "priority": "normal",
                "order_type": "standard",
                "mileage_in": 100000,
            },
            format="json",
        )
        self.assertEqual(work_order_response.status_code, status.HTTP_201_CREATED, work_order_response.data)
        self.assertEqual(Contact.objects.count(), 1)
        self.assertEqual(Vehicle.objects.count(), 1)
        self.assertEqual(WorkshopService.objects.count(), 1)
        self.assertEqual(Part.objects.count(), 1)
        self.assertEqual(WorkOrder.objects.count(), 1)
