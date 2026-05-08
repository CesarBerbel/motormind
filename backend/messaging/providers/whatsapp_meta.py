import requests

from .base import BaseWhatsAppProvider, WhatsAppProviderError


class MetaWhatsAppProvider(BaseWhatsAppProvider):
    def __init__(self, access_token, phone_number_id, api_version="v24.0"):
        self.access_token = access_token
        self.phone_number_id = phone_number_id
        self.api_version = api_version

    def send_text(self, to_phone, body, preview_url=False):
        if not self.access_token:
            raise WhatsAppProviderError("WhatsApp access token não configurado.")
        if not self.phone_number_id:
            raise WhatsAppProviderError(
                "ID do número remetente da Meta não configurado. Este campo não é o telefone do contato; "
                "ele vem do WhatsApp Manager/Meta Developers."
            )
        url = f"https://graph.facebook.com/{self.api_version}/{self.phone_number_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to_phone,
            "type": "text",
            "text": {"preview_url": bool(preview_url), "body": body},
        }
        try:
            response = requests.post(
                url,
                headers={"Authorization": f"Bearer {self.access_token}", "Content-Type": "application/json"},
                json=payload,
                timeout=20,
            )
        except requests.exceptions.RequestException as exc:
            raise WhatsAppProviderError(
                "Falha de conexão com a Meta Graph API. Verifique internet, DNS, proxy/firewall e api_version. "
                f"Erro original: {exc}"
            ) from exc

        try:
            data = response.json()
        except ValueError:
            data = {"raw": response.text}
        if response.status_code >= 400:
            raise WhatsAppProviderError(str(data))
        return data
