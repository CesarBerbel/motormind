from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase


@override_settings(ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"])
class MainApiRegressionSmokeTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser(
            username="owner-smoke",
            email="owner-smoke@example.com",
            password="senha-forte-123",
        )
        self.client.force_authenticate(self.user)

    def test_authenticated_core_list_endpoints_do_not_crash(self):
        endpoints = [
            "/api/me/",
            "/api/users/",
            "/api/contact-groups/",
            "/api/contacts/",
            "/api/templates/",
            "/api/workshop/categories/",
            "/api/workshop/vehicles/",
            "/api/workshop/services/",
            "/api/workshop/parts/",
            "/api/workshop/work-orders/",
            "/api/purchasing/suppliers/",
            "/api/purchasing/purchase-orders/",
            "/api/finance/accounts-payable/",
            "/api/finance/accounts-receivable/",
            "/api/accounts/audit-logs/",
        ]

        for endpoint in endpoints:
            with self.subTest(endpoint=endpoint):
                response = self.client.get(endpoint)
                self.assertLess(response.status_code, 500, getattr(response, "data", response.content))
                self.assertNotIn(response.status_code, {401, 403}, getattr(response, "data", response.content))

    def test_token_endpoint_returns_tokens_for_valid_credentials(self):
        self.client.force_authenticate(None)
        response = self.client.post(
            "/api/token/",
            {"username": "owner-smoke", "password": "senha-forte-123"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_login_endpoint_rejects_invalid_credentials_without_server_error(self):
        self.client.force_authenticate(None)
        response = self.client.post(
            "/api/token/",
            {"username": "owner-smoke", "password": "senha-errada"},
            format="json",
        )

        self.assertEqual(response.status_code, 401)
        self.assertTrue(response.data.get("detail") or response.data.get("message"), response.data)
