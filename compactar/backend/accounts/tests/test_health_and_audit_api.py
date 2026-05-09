from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import AuditLog


@override_settings(ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"])
class HealthAndAuditApiTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser(
            username="owner-health",
            email="owner-health@example.com",
            password="senha-forte-123",
        )

    def test_health_check_is_public_and_reports_database(self):
        response = self.client.get("/api/health/")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn(response.data["status"], {"ok", "warning"})
        self.assertEqual(response.data["checks"]["database"]["status"], "ok")
        self.assertIn("migrations", response.data["checks"])

    def test_audit_log_requires_authentication(self):
        response = self.client.get("/api/accounts/audit-logs/")

        self.assertEqual(response.status_code, 401)

    def test_audit_log_can_be_listed_by_owner(self):
        AuditLog.objects.create(action=AuditLog.Action.SYSTEM, user=self.user, description="Teste de auditoria API")
        self.client.force_authenticate(self.user)

        response = self.client.get("/api/accounts/audit-logs/")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["description"], "Teste de auditoria API")
