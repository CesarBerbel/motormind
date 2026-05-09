class WhatsAppProviderError(Exception):
    pass


class BaseWhatsAppProvider:
    def send_text(self, to_phone, body, preview_url=False):
        raise NotImplementedError
