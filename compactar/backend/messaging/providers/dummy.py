from uuid import uuid4

from .base import BaseWhatsAppProvider


class DummyWhatsAppProvider(BaseWhatsAppProvider):
    def send_text(self, to_phone, body, preview_url=False):
        return {
            "messages": [{"id": f"dummy-{uuid4()}"}],
            "contacts": [{"input": to_phone, "wa_id": to_phone.replace("+", "")}],
            "preview_url": preview_url,
        }
