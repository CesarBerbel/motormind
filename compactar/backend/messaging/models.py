from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

User = get_user_model()
phone_validator = RegexValidator(regex=r"^\+[1-9]\d{7,14}$", message="Use formato E.164. Exemplo Brasil: +5511999999999")


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class ContactGroup(TimeStampedModel):
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="contact_groups")

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Contact(TimeStampedModel):
    class PersonType(models.TextChoices):
        INDIVIDUAL = "individual", "Pessoa física"
        COMPANY = "company", "Pessoa jurídica"

    person_type = models.CharField(max_length=20, choices=PersonType.choices, default=PersonType.INDIVIDUAL, db_index=True)
    first_name = models.CharField(max_length=120, verbose_name="Nome / Razão social")
    last_name = models.CharField(max_length=120, blank=True, verbose_name="Sobrenome")
    trade_name = models.CharField(max_length=160, blank=True, verbose_name="Nome fantasia")
    document_number = models.CharField(max_length=18, blank=True, db_index=True, verbose_name="CPF/CNPJ")
    state_registration = models.CharField(max_length=40, blank=True, verbose_name="Inscrição estadual")
    municipal_registration = models.CharField(max_length=40, blank=True, verbose_name="Inscrição municipal")
    birth_date = models.DateField(null=True, blank=True, verbose_name="Data de nascimento/fundação")
    email = models.EmailField(blank=True)
    phone_e164 = models.CharField(max_length=20, blank=True, validators=[phone_validator], verbose_name="WhatsApp")
    secondary_phone_e164 = models.CharField(max_length=20, blank=True, validators=[phone_validator], verbose_name="Telefone secundário")
    zip_code = models.CharField(max_length=9, blank=True, verbose_name="CEP")
    address_line = models.CharField(max_length=180, blank=True, verbose_name="Endereço")
    address_number = models.CharField(max_length=20, blank=True, verbose_name="Número")
    address_complement = models.CharField(max_length=120, blank=True, verbose_name="Complemento")
    district = models.CharField(max_length=120, blank=True, verbose_name="Bairro")
    city = models.CharField(max_length=120, blank=True, verbose_name="Cidade")
    state = models.CharField(max_length=2, blank=True, verbose_name="UF")
    country = models.CharField(max_length=80, default="Brasil", blank=True, verbose_name="País")
    notes = models.TextField(blank=True, verbose_name="Observações")
    groups = models.ManyToManyField(ContactGroup, blank=True, related_name="contacts")
    custom_data = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="contacts")

    class Meta:
        ordering = ["first_name", "last_name", "email"]

    @property
    def full_name(self):
        if self.person_type == self.PersonType.COMPANY:
            return self.first_name.strip()
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def display_name(self):
        if self.person_type == self.PersonType.COMPANY and self.trade_name:
            return f"{self.first_name} ({self.trade_name})"
        return self.full_name

    @property
    def document_digits(self):
        return "".join(ch for ch in (self.document_number or "") if ch.isdigit())

    @property
    def address_display(self):
        parts = []
        if self.address_line:
            line = self.address_line
            if self.address_number:
                line = f"{line}, {self.address_number}"
            if self.address_complement:
                line = f"{line} - {self.address_complement}"
            parts.append(line)
        if self.district:
            parts.append(self.district)
        city_state = " / ".join([p for p in [self.city, self.state] if p])
        if city_state:
            parts.append(city_state)
        if self.zip_code:
            parts.append(f"CEP {self.zip_code}")
        return " - ".join(parts)

    def __str__(self):
        return self.display_name or self.email or self.phone_e164


class MessageTemplate(TimeStampedModel):
    class Channel(models.TextChoices):
        EMAIL = "email", "Email"
        WHATSAPP = "whatsapp", "WhatsApp"

    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=180, unique=True, blank=True)
    channel = models.CharField(max_length=20, choices=Channel.choices)
    description = models.TextField(blank=True)
    email_subject = models.CharField(max_length=255, blank=True)
    email_html_body = models.TextField(blank=True)
    email_text_body = models.TextField(blank=True, help_text="Opcional. Se vazio, sera gerado a partir do HTML renderizado.")
    whatsapp_body = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="message_templates")

    class Meta:
        ordering = ["channel", "name"]

    def clean(self):
        if self.channel == self.Channel.EMAIL:
            if not self.email_subject:
                raise ValidationError({"email_subject": "O assunto e obrigatorio para email."})
            if not self.email_html_body:
                raise ValidationError({"email_html_body": "O corpo HTML e obrigatorio para email."})
        if self.channel == self.Channel.WHATSAPP and not self.whatsapp_body:
            raise ValidationError({"whatsapp_body": "O texto e obrigatorio para WhatsApp."})

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name) or "template"
            candidate = base
            counter = 2
            while MessageTemplate.objects.filter(slug=candidate).exclude(pk=self.pk).exists():
                candidate = f"{base}-{counter}"
                counter += 1
            self.slug = candidate
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.channel})"


class Automation(TimeStampedModel):
    class TargetType(models.TextChoices):
        CONTACT = "contact", "Contato especifico"
        GROUP = "group", "Grupo de contatos"
        ALL_CONTACTS = "all_contacts", "Todos os contatos ativos"
        USER = "user", "Usuario especifico"
        ALL_USERS = "all_users", "Todos os usuarios ativos"

    class ScheduleType(models.TextChoices):
        ONCE = "once", "Uma vez"
        INTERVAL = "interval", "Intervalo em minutos"
        DAILY = "daily", "Diariamente"
        WEEKLY = "weekly", "Semanalmente"
        MONTHLY = "monthly", "Mensalmente"

    name = models.CharField(max_length=150)
    template = models.ForeignKey(MessageTemplate, on_delete=models.PROTECT, related_name="automations")
    channel = models.CharField(max_length=20, choices=MessageTemplate.Channel.choices)
    target_type = models.CharField(max_length=30, choices=TargetType.choices)
    contact = models.ForeignKey(Contact, null=True, blank=True, on_delete=models.SET_NULL, related_name="automations")
    group = models.ForeignKey(ContactGroup, null=True, blank=True, on_delete=models.SET_NULL, related_name="automations")
    recipient_user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="recipient_automations")
    schedule_type = models.CharField(max_length=20, choices=ScheduleType.choices, default=ScheduleType.ONCE)
    run_at = models.DateTimeField(help_text="Data/hora inicial ou unica da automacao.")
    interval_minutes = models.PositiveIntegerField(null=True, blank=True)
    next_run_at = models.DateTimeField(null=True, blank=True, db_index=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="automations")

    class Meta:
        ordering = ["-is_active", "next_run_at", "name"]

    def clean(self):
        if self.template and self.channel != self.template.channel:
            raise ValidationError({"channel": "O canal deve ser igual ao canal do template."})
        if self.target_type == self.TargetType.CONTACT and not self.contact_id:
            raise ValidationError({"contact": "Informe o contato."})
        if self.target_type == self.TargetType.GROUP and not self.group_id:
            raise ValidationError({"group": "Informe o grupo."})
        if self.target_type == self.TargetType.USER and not self.recipient_user_id:
            raise ValidationError({"recipient_user": "Informe o usuario."})
        if self.schedule_type == self.ScheduleType.INTERVAL and not self.interval_minutes:
            raise ValidationError({"interval_minutes": "Informe o intervalo em minutos."})

    def save(self, *args, **kwargs):
        if self.template_id and not self.channel:
            self.channel = self.template.channel
        if self.is_active and not self.next_run_at:
            self.next_run_at = self.run_at
        super().save(*args, **kwargs)

    def advance_after_run(self, reference=None):
        now = reference or timezone.now()
        self.last_run_at = now
        self.last_error = ""
        if self.schedule_type == self.ScheduleType.ONCE:
            self.is_active = False
            self.next_run_at = None
        elif self.schedule_type == self.ScheduleType.INTERVAL:
            self.next_run_at = now + timedelta(minutes=self.interval_minutes or 60)
        elif self.schedule_type == self.ScheduleType.DAILY:
            self.next_run_at = now + timedelta(days=1)
        elif self.schedule_type == self.ScheduleType.WEEKLY:
            self.next_run_at = now + timedelta(days=7)
        elif self.schedule_type == self.ScheduleType.MONTHLY:
            self.next_run_at = now + timedelta(days=30)

    def __str__(self):
        return self.name


class MessageLog(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pendente"
        SENDING = "sending", "Enviando"
        SENT = "sent", "Enviado"
        FAILED = "failed", "Falhou"
        SKIPPED = "skipped", "Ignorado"

    channel = models.CharField(max_length=20, choices=MessageTemplate.Channel.choices)
    template = models.ForeignKey(MessageTemplate, null=True, blank=True, on_delete=models.SET_NULL, related_name="logs")
    automation = models.ForeignKey(Automation, null=True, blank=True, on_delete=models.SET_NULL, related_name="logs")
    contact = models.ForeignKey(Contact, null=True, blank=True, on_delete=models.SET_NULL, related_name="message_logs")
    recipient_user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="message_logs")
    actor = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="sent_message_logs")
    recipient_name = models.CharField(max_length=180, blank=True)
    to_email = models.EmailField(blank=True)
    to_phone = models.CharField(max_length=20, blank=True)
    rendered_subject = models.CharField(max_length=255, blank=True)
    rendered_html = models.TextField(blank=True)
    rendered_text = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    provider_message_id = models.CharField(max_length=255, blank=True)
    provider_response = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        target = self.to_email or self.to_phone or self.recipient_name
        return f"{self.channel} to {target} ({self.status})"


class ChannelConfiguration(TimeStampedModel):
    class WhatsAppProvider(models.TextChoices):
        META = "meta", "Meta Cloud API"
        DUMMY = "dummy", "Dummy / development"

    email_enabled = models.BooleanField(default=True)
    default_from_email = models.EmailField(blank=True)
    whatsapp_enabled = models.BooleanField(default=False)
    whatsapp_provider = models.CharField(max_length=30, choices=WhatsAppProvider.choices, default=WhatsAppProvider.META)
    whatsapp_access_token = models.TextField(blank=True)
    whatsapp_phone_number_id = models.CharField(max_length=100, blank=True)
    whatsapp_api_version = models.CharField(max_length=20, default="v24.0")
    whatsapp_preview_url = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Channel configuration"
        verbose_name_plural = "Channel configurations"

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(
            pk=1,
            defaults={"default_from_email": getattr(settings, "DEFAULT_FROM_EMAIL", "")},
        )
        return obj

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def __str__(self):
        return "Channel configuration"
