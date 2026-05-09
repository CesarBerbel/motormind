from django.contrib.auth import get_user_model
from django.test import override_settings
from django.core import mail
from rest_framework import status
from rest_framework.test import APITestCase

from messaging.models import Contact, MessageTemplate, MessageLog, ChannelConfiguration
from workshop.models import WorkOrder, WorkOrderNotificationRule, WorkOrderMessage


@override_settings(
    ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"],
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class WorkOrderAwaitingApprovalAutoEmailTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser(
            username="owner-notify",
            email="owner-notify@example.com",
            password="senha-forte-123",
        )
        self.client.force_authenticate(self.user)
        config = ChannelConfiguration.load()
        config.email_enabled = True
        config.default_from_email = "oficina@example.com"
        config.save()
        self.customer = Contact.objects.create(
            person_type="individual",
            first_name="Cliente",
            last_name="Email",
            email="cliente-email@example.com",
            phone_e164="+5511999999999",
        )
        self.template = MessageTemplate.objects.create(
            name="Aguardando aprovação teste",
            channel=MessageTemplate.Channel.EMAIL,
            email_subject="OS {{ numero_os }} aguardando aprovação",
            email_html_body="Olá {{ nome_cliente }}. Link: {{ approval_url }}",
            email_text_body="Olá {{ nome_cliente }}. Link: {{ approval_url }}",
        )
        self.rule = WorkOrderNotificationRule.objects.create(
            name="Email aguardando aprovação",
            trigger_status=WorkOrder.Status.AWAITING_APPROVAL,
            channel=MessageTemplate.Channel.EMAIL,
            template=self.template,
            recipient_target=WorkOrderNotificationRule.RecipientTarget.CUSTOMER,
            is_active=True,
            send_once_per_status=True,
        )

    def test_technical_complete_diagnosis_sends_automatic_email(self):
        order = WorkOrder.objects.create(
            customer=self.customer,
            title="Teste envio automático",
            complaint="Falha para diagnóstico",
            status=WorkOrder.Status.DIAGNOSIS,
            assigned_to=self.user,
        )
        response = self.client.post(
            f"/api/workshop/work-orders/{order.id}/technical-action/",
            {"action": "complete", "diagnosis_description": "Teste de diagnóstico."},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        order.refresh_from_db()
        self.assertEqual(order.status, WorkOrder.Status.AWAITING_APPROVAL)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("cliente-email@example.com", mail.outbox[0].to)
        self.assertIn("/aprovar-os/", mail.outbox[0].body)
        self.assertEqual(MessageLog.objects.filter(status=MessageLog.Status.SENT).count(), 1)
        self.assertEqual(WorkOrderMessage.objects.filter(work_order=order, notification_rule=self.rule).count(), 1)

    def test_failed_previous_log_does_not_block_retry(self):
        order = WorkOrder.objects.create(
            customer=self.customer,
            title="Teste reenvio",
            complaint="Falha para diagnóstico",
            status=WorkOrder.Status.AWAITING_APPROVAL,
            assigned_to=self.user,
        )
        failed_log = MessageLog.objects.create(
            channel=MessageTemplate.Channel.EMAIL,
            template=self.template,
            actor=self.user,
            contact=self.customer,
            recipient_name=self.customer.full_name,
            to_email=self.customer.email,
            rendered_subject="falhou",
            rendered_text="falhou",
            status=MessageLog.Status.FAILED,
            error_message="erro antigo",
        )
        WorkOrderMessage.objects.create(
            work_order=order,
            trigger_type=WorkOrderMessage.TriggerType.STATUS_AUTO,
            trigger_status=WorkOrder.Status.AWAITING_APPROVAL,
            channel=MessageTemplate.Channel.EMAIL,
            recipient_target=WorkOrderNotificationRule.RecipientTarget.CUSTOMER,
            template=self.template,
            notification_rule=self.rule,
            message_log=failed_log,
            status=MessageLog.Status.FAILED,
            error_message="erro antigo",
            created_by=self.user,
        )

        response = self.client.post(f"/api/workshop/work-orders/{order.id}/trigger_notifications/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(MessageLog.objects.filter(status=MessageLog.Status.SENT).count(), 1)


    def test_email_send_count_zero_marks_failure(self):
        from unittest.mock import patch
        order = WorkOrder.objects.create(
            customer=self.customer,
            title="Teste zero",
            complaint="Falha para diagnóstico",
            status=WorkOrder.Status.AWAITING_APPROVAL,
            assigned_to=self.user,
        )
        with patch("django.core.mail.message.EmailMultiAlternatives.send", return_value=0):
            response = self.client.post(f"/api/workshop/work-orders/{order.id}/trigger_notifications/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        log = MessageLog.objects.latest("id")
        self.assertEqual(log.status, MessageLog.Status.FAILED)
        self.assertIn("não confirmou envio", log.error_message)

    def test_manual_change_status_to_awaiting_approval_triggers_auto_email(self):
        order = WorkOrder.objects.create(
            customer=self.customer,
            title="Teste mudança manual",
            complaint="Falha para diagnóstico",
            diagnosis="Diagnóstico via mudança manual.",
            status=WorkOrder.Status.DIAGNOSIS,
            assigned_to=self.user,
        )
        response = self.client.post(
            f"/api/workshop/work-orders/{order.id}/change_status/",
            {"status": WorkOrder.Status.AWAITING_APPROVAL, "note": "Enviar para aprovação", "send_notifications": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        order.refresh_from_db()
        self.assertEqual(order.status, WorkOrder.Status.AWAITING_APPROVAL)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("cliente-email@example.com", mail.outbox[0].to)
        self.assertEqual(WorkOrderMessage.objects.filter(work_order=order, notification_rule=self.rule).count(), 1)
