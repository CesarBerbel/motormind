from django.test import TestCase

from messaging.models import ChannelConfiguration, MessageLog, MessageTemplate
from messaging.services import send_message_log


class WhatsAppRealOnlyTests(TestCase):
    def test_dummy_provider_is_not_sent(self):
        config = ChannelConfiguration.load()
        config.whatsapp_enabled = True
        config.whatsapp_provider = "dummy"
        config.save(update_fields=["whatsapp_enabled", "whatsapp_provider", "updated_at"])
        template = MessageTemplate.objects.create(name="W", channel=MessageTemplate.Channel.WHATSAPP, whatsapp_body="teste")
        log = MessageLog.objects.create(
            channel=MessageTemplate.Channel.WHATSAPP,
            template=template,
            recipient_name="Cliente",
            to_phone="+5511999999999",
            rendered_text="teste",
        )
        send_message_log(log)
        log.refresh_from_db()
        self.assertEqual(log.status, MessageLog.Status.FAILED)
        self.assertIn("Dummy/desenvolvimento foi removido", log.error_message)
