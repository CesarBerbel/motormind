from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from finance.models import AccountPayable


class AccountPayableApiTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser(
            username="dono",
            email="dono@example.com",
            password="senha-forte-123",
        )
        self.client.force_authenticate(self.user)

    def test_create_cash_payable_returns_created_collection(self):
        response = self.client.post(
            "/api/finance/accounts-payable/",
            {
                "supplier_id": None,
                "category": "Luz",
                "description": "Bandeirante",
                "issue_date": "2026-05-08",
                "due_date": "2026-05-08",
                "amount": "150.00",
                "recurrence_type": "cash",
                "installment_total": 1,
                "notes": "",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(len(response.data["created"]), 1)
        self.assertEqual(response.data["created"][0]["description"], "Bandeirante")
        self.assertEqual(AccountPayable.objects.count(), 1)

    def test_create_installment_payable_returns_all_created_installments(self):
        response = self.client.post(
            "/api/finance/accounts-payable/",
            {
                "supplier_id": None,
                "category": "Ferramentas",
                "description": "Compra parcelada",
                "issue_date": "2026-05-08",
                "due_date": "2026-05-08",
                "amount": "300.00",
                "recurrence_type": "installment",
                "installment_total": 3,
                "notes": "",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["count"], 3)
        self.assertEqual(len(response.data["created"]), 3)
        self.assertEqual(AccountPayable.objects.count(), 3)
