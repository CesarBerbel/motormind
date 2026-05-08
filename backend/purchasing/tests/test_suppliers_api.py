from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase


@override_settings(ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"])
class SupplierApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_superuser(username="owner", email="owner@example.com", password="testpass123")
        self.client.force_authenticate(self.user)

    def test_can_list_suppliers(self):
        response = self.client.get("/api/purchasing/suppliers/")

        self.assertEqual(response.status_code, 200)
        self.assertIn("results", response.data)

    def test_can_create_company_supplier_with_complete_schema(self):
        payload = {
            "person_type": "company",
            "name": "Fornecedor Teste LTDA",
            "trade_name": "Fornecedor Teste",
            "document": "12.345.678/0001-95",
            "email": "fornecedor@example.com",
            "phone": "(11) 99999-9999",
            "zip_code": "01001-000",
            "address_line": "Praça da Sé",
            "address_number": "100",
            "district": "Sé",
            "city": "São Paulo",
            "state": "sp",
            "country": "Brasil",
            "notes": "Fornecedor criado pelo teste automatizado.",
            "is_active": True,
        }

        response = self.client.post("/api/purchasing/suppliers/", payload, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["name"], "Fornecedor Teste LTDA")
        self.assertEqual(response.data["person_type"], "company")
        self.assertEqual(response.data["document"], "12.345.678/0001-95")
        self.assertEqual(response.data["phone"], "+5511999999999")
        self.assertEqual(response.data["state"], "SP")
