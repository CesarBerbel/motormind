from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from messaging.models import Contact
from workshop.models import WorkshopProfile, WorkshopService, WorkOrder, WorkOrderService


@override_settings(ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"])
class ChecklistDeliveryLandingTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_superuser(username="owner", email="owner@example.com", password="testpass123")
        self.client.force_authenticate(self.user)
        self.customer = Contact.objects.create(first_name="Cliente", last_name="Teste", email="cliente@example.com")
        self.service = WorkshopService.objects.create(name="Troca de óleo", default_unit_price="120.00")

    def test_public_landing_is_available_without_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get("/api/workshop/public/landing/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("display_name", response.data)
        self.assertIn("featured_services", response.data)

    def test_checklist_templates_are_copied_when_feature_is_enabled(self):
        profile = WorkshopProfile.get_solo()
        profile.technical_checklist_enabled = True
        profile.save()

        template_payload = {
            "service": self.service.id,
            "description": "Conferir vazamentos",
            "is_required": True,
            "requires_photo": False,
            "requires_note": False,
            "sort_order": 1,
            "is_active": True,
        }
        template_response = self.client.post("/api/workshop/service-checklist-templates/", template_payload, format="json")
        self.assertEqual(template_response.status_code, 201)

        order = WorkOrder.objects.create(customer=self.customer, title="OS teste", created_by=self.user)
        service_response = self.client.post(
            "/api/workshop/work-order-services/",
            {"work_order": order.id, "service_id": self.service.id, "description": self.service.name, "quantity": "1.00", "unit_price": "120.00"},
            format="json",
        )
        self.assertEqual(service_response.status_code, 201)
        service_line = WorkOrderService.objects.get(pk=service_response.data["id"])
        self.assertEqual(service_line.checklist_items.count(), 1)

    def test_checklist_not_copied_when_feature_is_disabled(self):
        profile = WorkshopProfile.get_solo()
        profile.technical_checklist_enabled = False
        profile.save()
        self.client.post("/api/workshop/service-checklist-templates/", {"service": self.service.id, "description": "Conferir filtro"}, format="json")
        order = WorkOrder.objects.create(customer=self.customer, title="OS sem checklist", created_by=self.user)
        response = self.client.post(
            "/api/workshop/work-order-services/",
            {"work_order": order.id, "service_id": self.service.id, "description": self.service.name, "quantity": "1.00", "unit_price": "120.00"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(WorkOrderService.objects.get(pk=response.data["id"]).checklist_items.count(), 0)


class WhatsAppAdminConfigurationTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_superuser(username="owner2", email="owner2@example.com", password="testpass123")
        self.client.force_authenticate(self.user)

    def test_channel_settings_read_whatsapp_from_admin_configuration(self):
        from messaging.models import ChannelConfiguration

        config = ChannelConfiguration.load()
        config.whatsapp_enabled = True
        config.whatsapp_provider = "dummy"
        config.whatsapp_access_token = "secret"
        config.whatsapp_phone_number_id = "1234567890"
        config.whatsapp_api_version = "v24.0"
        config.whatsapp_preview_url = True
        config.save()

        response = self.client.get("/api/settings/channel/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["whatsapp_enabled"])
        self.assertEqual(response.data["whatsapp_provider"], "dummy")
        self.assertTrue(response.data["whatsapp_token_configured"])
        self.assertEqual(response.data["whatsapp_phone_number_id"], "1234567890")
