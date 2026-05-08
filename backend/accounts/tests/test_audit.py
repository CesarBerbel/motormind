from django.contrib.auth import get_user_model
from django.test import TestCase

from accounts.audit import audit_log
from accounts.models import AuditLog


class AuditLogTests(TestCase):
    def test_creates_audit_log_for_system_action(self):
        user = get_user_model().objects.create_user(username="auditor", password="senha-forte-123")
        entry = audit_log(action=AuditLog.Action.SYSTEM, user=user, description="Teste de auditoria", metadata={"ok": True})
        self.assertEqual(entry.user, user)
        self.assertEqual(entry.description, "Teste de auditoria")
        self.assertEqual(entry.metadata, {"ok": True})
