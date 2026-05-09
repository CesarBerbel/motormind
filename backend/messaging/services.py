import socket

from bs4 import BeautifulSoup
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import EmailMultiAlternatives
from django.template import Context, Template, TemplateSyntaxError
from django.utils import timezone

from .models import Automation, ChannelConfiguration, Contact, ContactGroup, MessageLog, MessageTemplate
from .providers.base import WhatsAppProviderError
from .providers.whatsapp_meta import MetaWhatsAppProvider

User = get_user_model()


class MessageRenderError(Exception):
    pass


class MessageDispatchError(Exception):
    pass


SMTP_PLACEHOLDER_HOSTS = {"smtp.example.com", "example.com", "mail.example.com"}


def actor_name(user):
    if not user or not getattr(user, "is_authenticated", False):
        return ""
    return user.get_full_name() or user.username


def user_public_dict(user):
    if not user:
        return {}
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": user.get_full_name() or user.username,
        "is_staff": user.is_staff,
    }


def contact_public_dict(contact):
    if not contact:
        return {}
    return {
        "id": contact.id,
        "first_name": contact.first_name,
        "last_name": contact.last_name,
        "full_name": contact.full_name,
        "email": contact.email,
        "phone_e164": contact.phone_e164,
        "custom_data": contact.custom_data or {},
    }


def recipient_public_dict(contact=None, recipient_user=None, raw_email="", raw_phone=""):
    if contact:
        return {
            "tipo": "contato",
            "id": contact.id,
            "nome": contact.full_name,
            "email": contact.email,
            "telefone": contact.phone_e164,
            "phone_e164": contact.phone_e164,
            "first_name": contact.first_name,
            "last_name": contact.last_name,
            "custom_data": contact.custom_data or {},
        }
    if recipient_user:
        return {
            "tipo": "usuario",
            "id": recipient_user.id,
            "nome": recipient_user.get_full_name() or recipient_user.username,
            "email": recipient_user.email,
            "telefone": "",
            "phone_e164": "",
            "username": recipient_user.username,
            "first_name": recipient_user.first_name,
            "last_name": recipient_user.last_name,
        }
    if raw_email or raw_phone:
        return {
            "tipo": "avulso",
            "id": "",
            "nome": raw_email or raw_phone,
            "email": raw_email,
            "telefone": raw_phone,
            "phone_e164": raw_phone,
        }
    return {}


def build_context(actor=None, contact=None, recipient_user=None, raw_email="", raw_phone="", extra=None):
    extra = extra or {}
    recipient = recipient_public_dict(contact=contact, recipient_user=recipient_user, raw_email=raw_email, raw_phone=raw_phone)
    context = {
        # Backwards-compatible aliases. In this system, usuario/user means the logged-in actor/sender.
        "usuario": actor,
        "user": actor,
        "nome_usuario": actor_name(actor),
        "email_usuario": getattr(actor, "email", ""),
        "usuario_logado": user_public_dict(actor),
        "remetente": user_public_dict(actor),
        # Recipient/contact aliases. Use these for per-recipient fields such as phone.
        "contato": contact,
        "contact": contact,
        "contato_dict": contact_public_dict(contact),
        "nome_contato": contact.full_name if contact else "",
        "recipient_user": recipient_user,
        "destinatario": recipient,
        "nome_destinatario": recipient.get("nome", ""),
        "email_destinatario": recipient.get("email", ""),
        "telefone_destinatario": recipient.get("telefone", ""),
        "agora": timezone.now(),
        "custom": getattr(contact, "custom_data", {}) or {},
    }
    context.update(extra)
    return context


def render_string(template_string, context):
    if not template_string:
        return ""
    try:
        return Template(template_string).render(Context(context, autoescape=True)).strip()
    except TemplateSyntaxError as exc:
        raise MessageRenderError(f"Erro de sintaxe no template: {exc}") from exc


def html_to_text(html):
    soup = BeautifulSoup(html or "", "html.parser")
    for tag in soup(["style", "script"]):
        tag.decompose()
    text = soup.get_text("\n")
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def render_message(template, actor=None, contact=None, recipient_user=None, raw_email="", raw_phone="", extra=None):
    context = build_context(
        actor=actor,
        contact=contact,
        recipient_user=recipient_user,
        raw_email=raw_email,
        raw_phone=raw_phone,
        extra=extra,
    )
    if template.channel == MessageTemplate.Channel.EMAIL:
        subject = render_string(template.email_subject, context)
        html = render_string(template.email_html_body, context)
        text = render_string(template.email_text_body, context) if template.email_text_body else html_to_text(html)
        return {"subject": subject, "html": html, "text": text}
    body = render_string(template.whatsapp_body, context)
    return {"text": body}


def recipient_name(contact=None, recipient_user=None, raw=None):
    if contact:
        return contact.full_name
    if recipient_user:
        return recipient_user.get_full_name() or recipient_user.username
    return raw or ""


def get_whatsapp_provider(config=None):
    config = config or ChannelConfiguration.load()
    if config.whatsapp_provider != ChannelConfiguration.WhatsAppProvider.META:
        raise MessageDispatchError(
            "WhatsApp Dummy/desenvolvimento foi removido. Configure o provedor Meta Cloud API no admin do Django."
        )
    return MetaWhatsAppProvider(
        access_token=config.whatsapp_access_token,
        phone_number_id=config.whatsapp_phone_number_id,
        api_version=config.whatsapp_api_version or "v24.0",
    )


def using_smtp_backend():
    return (settings.EMAIL_BACKEND or "").endswith(".smtp.EmailBackend")


def validate_email_configuration(config):
    if not config.email_enabled:
        raise MessageDispatchError("Canal de email desativado.")
    if not using_smtp_backend():
        return

    email_host = (settings.EMAIL_HOST or "").strip()
    if not email_host:
        raise MessageDispatchError("EMAIL_HOST não configurado no .env do backend.")
    if email_host.lower() in SMTP_PLACEHOLDER_HOSTS:
        raise MessageDispatchError(
            "EMAIL_HOST ainda está com valor de exemplo. Troque smtp.example.com pelo host SMTP real "
            "ou use EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend em desenvolvimento."
        )
    if settings.EMAIL_USE_TLS and settings.EMAIL_USE_SSL:
        raise MessageDispatchError("EMAIL_USE_TLS e EMAIL_USE_SSL não podem ficar True ao mesmo tempo.")


def explain_dispatch_exception(exc):
    if isinstance(exc, socket.gaierror):
        return (
            "Falha de DNS ao conectar no servidor externo: o hostname não foi encontrado. "
            "Verifique EMAIL_HOST no .env, conexão de rede e DNS. Erro original: "
            f"{exc}"
        )
    message = str(exc)
    if "getaddrinfo failed" in message or "NameResolutionError" in message:
        return (
            "Falha de DNS ao conectar no servidor externo. Verifique se o host configurado existe "
            "e se a máquina tem acesso à internet/DNS. Erro original: "
            f"{message}"
        )
    return message


def create_message_log(template, actor, contact=None, recipient_user=None, raw_email="", raw_phone="", automation=None, extra=None):
    rendered = render_message(
        template,
        actor=actor,
        contact=contact,
        recipient_user=recipient_user,
        raw_email=raw_email,
        raw_phone=raw_phone,
        extra=extra,
    )
    to_email = raw_email or (contact.email if contact else "") or (recipient_user.email if recipient_user else "")
    to_phone = raw_phone or (contact.phone_e164 if contact else "")
    log = MessageLog.objects.create(
        channel=template.channel,
        template=template,
        automation=automation,
        contact=contact,
        recipient_user=recipient_user,
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        recipient_name=recipient_name(contact=contact, recipient_user=recipient_user, raw=to_email or to_phone),
        to_email=to_email,
        to_phone=to_phone,
        rendered_subject=rendered.get("subject", ""),
        rendered_html=rendered.get("html", ""),
        rendered_text=rendered.get("text", ""),
        status=MessageLog.Status.PENDING,
    )
    return log


def print_email_debug_block(log, from_email):
    """Always print a compact email preview in server logs before dispatch."""
    print("\n" + "=" * 72, flush=True)
    print("MENSAGERIA - EMAIL GERADO", flush=True)
    print("=" * 72, flush=True)
    print(f"Template: {getattr(log.template, 'name', '')}", flush=True)
    print(f"Para: {log.to_email}", flush=True)
    print(f"De: {from_email}", flush=True)
    print(f"Assunto: {log.rendered_subject}", flush=True)
    print(f"Backend: {settings.EMAIL_BACKEND}", flush=True)
    print("-" * 72, flush=True)
    print(log.rendered_text or "", flush=True)
    if log.rendered_html:
        print("-" * 72, flush=True)
        print("HTML:", flush=True)
        print(log.rendered_html, flush=True)
    print("=" * 72 + "\n", flush=True)


def send_email_log(log, config):
    validate_email_configuration(config)
    if not log.to_email:
        raise MessageDispatchError("Destinatário sem email.")
    from_email = config.default_from_email or settings.DEFAULT_FROM_EMAIL
    print_email_debug_block(log, from_email)
    message = EmailMultiAlternatives(
        subject=log.rendered_subject,
        body=log.rendered_text,
        from_email=from_email,
        to=[log.to_email],
    )
    if log.rendered_html:
        message.attach_alternative(log.rendered_html, "text/html")
    sent_count = message.send(fail_silently=False)
    if sent_count < 1:
        raise MessageDispatchError(
            "O backend de e-mail não confirmou envio para nenhum destinatário. "
            "Verifique EMAIL_BACKEND/SMTP ou use console.EmailBackend em desenvolvimento."
        )
    return {"sent_count": sent_count, "backend": settings.EMAIL_BACKEND}



def print_whatsapp_debug_block(log, config, provider_response=None, skipped_reason=""):
    print("\n" + "=" * 72, flush=True)
    print("MENSAGERIA - WHATSAPP GERADO", flush=True)
    print("=" * 72, flush=True)
    print(f"Template: {getattr(log.template, 'name', '')}", flush=True)
    print(f"Para: {log.to_phone}", flush=True)
    print(f"Provider: {config.whatsapp_provider}", flush=True)
    print(f"Phone Number ID: {config.whatsapp_phone_number_id or '[não configurado]'}", flush=True)
    if skipped_reason:
        print(f"Status: NÃO ENVIADO - {skipped_reason}", flush=True)
    print("-" * 72, flush=True)
    print(log.rendered_text or "", flush=True)
    if provider_response:
        print("-" * 72, flush=True)
        print(f"Resposta do provedor: {provider_response}", flush=True)
    print("=" * 72 + "\n", flush=True)


def print_dispatch_failure_block(log, error_message):
    print("\n" + "=" * 72, flush=True)
    print("MENSAGERIA - FALHA NO ENVIO", flush=True)
    print("=" * 72, flush=True)
    print(f"Canal: {log.channel}", flush=True)
    print(f"Template: {getattr(log.template, 'name', '')}", flush=True)
    print(f"Para: {log.to_email or log.to_phone or log.recipient_name}", flush=True)
    print(f"Erro: {error_message}", flush=True)
    print("=" * 72 + "\n", flush=True)

def send_whatsapp_log(log, config):
    if not config.whatsapp_enabled:
        raise MessageDispatchError("Canal de WhatsApp desativado nas configurações do admin do Django.")
    if not log.to_phone:
        raise MessageDispatchError("Destinatário sem telefone WhatsApp em E.164.")

    if config.whatsapp_provider != ChannelConfiguration.WhatsAppProvider.META:
        raise MessageDispatchError(
            "WhatsApp Dummy/desenvolvimento foi removido. Configure o provedor Meta Cloud API no admin do Django."
        )
    if not config.whatsapp_access_token or not config.whatsapp_phone_number_id:
        raise MessageDispatchError("Configure token e Phone Number ID do WhatsApp no admin do Django.")
    provider = get_whatsapp_provider(config)
    response = provider.send_text(log.to_phone, log.rendered_text, preview_url=config.whatsapp_preview_url)
    print_whatsapp_debug_block(log, config, provider_response=response)
    message_id = ""
    try:
        message_id = response.get("messages", [{}])[0].get("id", "")
    except (AttributeError, IndexError):
        message_id = ""
    if not message_id:
        raise MessageDispatchError(f"Meta Graph API não retornou ID da mensagem. Resposta: {response}")
    return {"provider_response": response, "message_id": message_id}


def send_message_log(log):
    config = ChannelConfiguration.load()
    log.status = MessageLog.Status.SENDING
    log.error_message = ""
    log.save(update_fields=["status", "error_message", "updated_at"])
    try:
        if log.channel == MessageTemplate.Channel.EMAIL:
            response = send_email_log(log, config)
            provider_message_id = ""
            provider_response = response
        elif log.channel == MessageTemplate.Channel.WHATSAPP:
            response = send_whatsapp_log(log, config)
            provider_message_id = response.get("message_id", "")
            provider_response = response.get("provider_response", {})
        else:
            raise MessageDispatchError("Canal desconhecido.")
        log.status = MessageLog.Status.SENT
        log.provider_message_id = provider_message_id
        log.provider_response = provider_response or {}
        log.sent_at = timezone.now()
        log.save(update_fields=["status", "provider_message_id", "provider_response", "sent_at", "updated_at"])
    except Exception as exc:
        log.status = MessageLog.Status.FAILED
        log.error_message = explain_dispatch_exception(exc)
        log.provider_response = {"error": log.error_message, "backend": getattr(settings, "EMAIL_BACKEND", ""), "channel": log.channel}
        print_dispatch_failure_block(log, log.error_message)
        log.save(update_fields=["status", "error_message", "provider_response", "updated_at"])
    return log


def create_and_send(template, actor, contact=None, recipient_user=None, raw_email="", raw_phone="", automation=None, extra=None, send_now=True):
    log = create_message_log(
        template=template,
        actor=actor,
        contact=contact,
        recipient_user=recipient_user,
        raw_email=raw_email,
        raw_phone=raw_phone,
        automation=automation,
        extra=extra,
    )
    if send_now:
        send_message_log(log)
    return log


def recipients_for_automation(automation):
    target = automation.target_type
    if target == Automation.TargetType.CONTACT:
        return [(automation.contact, None)] if automation.contact else []
    if target == Automation.TargetType.GROUP and automation.group:
        return [(contact, None) for contact in automation.group.contacts.filter(is_active=True)]
    if target == Automation.TargetType.ALL_CONTACTS:
        return [(contact, None) for contact in Contact.objects.filter(is_active=True)]
    if target == Automation.TargetType.USER:
        return [(None, automation.recipient_user)] if automation.recipient_user else []
    if target == Automation.TargetType.ALL_USERS:
        return [(None, user) for user in User.objects.filter(is_active=True)]
    return []


def process_automation(automation):
    created = []
    try:
        for contact, recipient_user in recipients_for_automation(automation):
            log = create_and_send(
                template=automation.template,
                actor=automation.created_by,
                contact=contact,
                recipient_user=recipient_user,
                automation=automation,
                send_now=True,
            )
            created.append(log.id)
        automation.advance_after_run()
    except Exception as exc:
        automation.last_error = explain_dispatch_exception(exc)
    automation.save(update_fields=["last_run_at", "last_error", "is_active", "next_run_at", "updated_at"])
    return created


def process_due_automations(now=None):
    now = now or timezone.now()
    automations = Automation.objects.select_related("template", "created_by", "contact", "group", "recipient_user").filter(
        is_active=True,
        next_run_at__isnull=False,
        next_run_at__lte=now,
    )
    processed = []
    for automation in automations:
        log_ids = process_automation(automation)
        processed.append({"automation_id": automation.id, "message_log_ids": log_ids})
    return processed
