import re

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Automation, ChannelConfiguration, Contact, ContactGroup, MessageLog, MessageTemplate

User = get_user_model()

from accounts.roles import ROLE_CHOICES, ROLE_OWNER, ROLE_TECHNICIAN, TECHNICIAN_SPECIALTY_CHOICES
from accounts.services import apply_role_to_user, get_permission_codes, get_user_dashboard_path

E164_RE = re.compile(r"^\+[1-9]\d{7,14}$")
UF_RE = re.compile(r"^[A-Z]{2}$")


def only_digits(value):
    return re.sub(r"\D", "", value or "")


def format_cpf_cnpj(digits):
    if len(digits) == 11:
        return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"
    if len(digits) == 14:
        return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"
    return digits


def format_cep(digits):
    if len(digits) == 8:
        return f"{digits[:5]}-{digits[5:]}"
    return digits


def normalize_br_phone_e164(value):
    raw = (value or "").strip()
    if not raw:
        return ""
    compact = re.sub(r"\s+", "", raw)
    if compact.startswith("+") and not compact.startswith("+55"):
        if E164_RE.match(compact):
            return compact
        raise serializers.ValidationError("Use telefone válido. Exemplo Brasil: (11) 99999-9999 ou +5511999999999.")
    digits = only_digits(compact)
    if digits.startswith("55") and len(digits) >= 12:
        digits = digits[2:]
    if len(digits) not in (10, 11):
        raise serializers.ValidationError("Informe telefone brasileiro com DDD. Exemplo: (11) 99999-9999.")
    return f"+55{digits}"



class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    photo_3x4 = serializers.FileField(source="profile.photo_3x4", required=False, allow_null=True)
    photo_3x4_url = serializers.SerializerMethodField()
    remove_photo_3x4 = serializers.BooleanField(required=False, write_only=True, default=False)
    role = serializers.CharField(required=False, write_only=True)
    role_value = serializers.SerializerMethodField()
    role_label = serializers.SerializerMethodField()
    technician_specialty = serializers.CharField(required=False, allow_blank=True, write_only=True)
    technician_specialty_value = serializers.SerializerMethodField()
    technician_specialty_label = serializers.SerializerMethodField()
    group_names = serializers.SerializerMethodField()
    permission_codes = serializers.SerializerMethodField()
    dashboard_path = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()
    has_usable_password = serializers.SerializerMethodField()
    person_type = serializers.CharField(source="profile.person_type", required=False)
    person_type_label = serializers.CharField(source="profile.person_type_label", read_only=True)
    document_number = serializers.CharField(source="profile.document_number", required=False, allow_blank=True)
    trade_name = serializers.CharField(source="profile.trade_name", required=False, allow_blank=True)
    state_registration = serializers.CharField(source="profile.state_registration", required=False, allow_blank=True)
    municipal_registration = serializers.CharField(source="profile.municipal_registration", required=False, allow_blank=True)
    birth_date = serializers.DateField(source="profile.birth_date", required=False, allow_null=True)
    phone_e164 = serializers.CharField(source="profile.phone_e164", required=False, allow_blank=True)
    secondary_phone_e164 = serializers.CharField(source="profile.secondary_phone_e164", required=False, allow_blank=True)
    zip_code = serializers.CharField(source="profile.zip_code", required=False, allow_blank=True)
    address_line = serializers.CharField(source="profile.address_line", required=False, allow_blank=True)
    address_number = serializers.CharField(source="profile.address_number", required=False, allow_blank=True)
    address_complement = serializers.CharField(source="profile.address_complement", required=False, allow_blank=True)
    district = serializers.CharField(source="profile.district", required=False, allow_blank=True)
    city = serializers.CharField(source="profile.city", required=False, allow_blank=True)
    state = serializers.CharField(source="profile.state", required=False, allow_blank=True)
    country = serializers.CharField(source="profile.country", required=False, allow_blank=True)
    address_display = serializers.CharField(source="profile.address_display", read_only=True)
    notes = serializers.CharField(source="profile.notes", required=False, allow_blank=True)
    custom_data = serializers.JSONField(source="profile.custom_data", required=False)

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name", "full_name", "photo_3x4", "photo_3x4_url", "remove_photo_3x4", "is_staff", "is_superuser", "is_active",
            "role", "role_value", "role_label", "technician_specialty", "technician_specialty_value", "technician_specialty_label",
            "group_names", "permission_codes", "dashboard_path", "is_owner", "has_usable_password",
            "person_type", "person_type_label", "document_number", "trade_name", "state_registration", "municipal_registration",
            "birth_date", "phone_e164", "secondary_phone_e164", "zip_code", "address_line", "address_number",
            "address_complement", "district", "city", "state", "country", "address_display", "notes", "custom_data",
        ]
        read_only_fields = [
            "id", "full_name", "photo_3x4_url", "is_staff", "is_superuser", "role_value", "role_label", "technician_specialty_value",
            "technician_specialty_label", "group_names", "permission_codes", "dashboard_path", "is_owner", "has_usable_password",
            "person_type_label", "address_display",
        ]

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username

    def get_photo_3x4_url(self, obj):
        photo = getattr(getattr(obj, "profile", None), "photo_3x4", None)
        if not photo:
            return ""
        request = self.context.get("request")
        url = photo.url
        return request.build_absolute_uri(url) if request else url

    def get_role_value(self, obj):
        return getattr(getattr(obj, "profile", None), "role", "")

    def get_role_label(self, obj):
        profile = getattr(obj, "profile", None)
        return profile.role_label if profile else ""

    def get_technician_specialty_value(self, obj):
        return getattr(getattr(obj, "profile", None), "technician_specialty", "")

    def get_technician_specialty_label(self, obj):
        profile = getattr(obj, "profile", None)
        return profile.technician_specialty_label if profile else ""

    def get_group_names(self, obj):
        return list(obj.groups.values_list("name", flat=True))

    def get_permission_codes(self, obj):
        return get_permission_codes(obj)

    def get_dashboard_path(self, obj):
        return get_user_dashboard_path(obj)

    def get_is_owner(self, obj):
        return obj.is_superuser or self.get_role_value(obj) == ROLE_OWNER

    def get_has_usable_password(self, obj):
        return obj.has_usable_password()

    def validate_role(self, value):
        allowed = {choice[0] for choice in ROLE_CHOICES}
        if value not in allowed:
            raise serializers.ValidationError("Papel de usuário inválido.")
        if value == ROLE_OWNER:
            raise serializers.ValidationError("O papel Dono só pode ser criado/alterado pelo comando create_owner_user.")
        return value

    def validate_technician_specialty(self, value):
        value = (value or "").strip()
        allowed = {choice[0] for choice in TECHNICIAN_SPECIALTY_CHOICES}
        if value and value not in allowed:
            raise serializers.ValidationError("Especialidade técnica inválida.")
        return value

    def validate_email(self, value):
        value = (value or "").strip().lower()
        if not value:
            raise serializers.ValidationError("Informe o email. Ele será usado para enviar o link de definição de senha.")
        qs = User.objects.filter(email__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Já existe usuário cadastrado com este email.")
        return value

    def validate_photo_3x4(self, value):
        if value and value.size > 3 * 1024 * 1024:
            raise serializers.ValidationError("A foto 3x4 deve ter no máximo 3 MB.")
        return value

    def validate_document_number(self, value):
        digits = only_digits(value)
        if not digits:
            return ""
        if len(digits) not in (11, 14):
            raise serializers.ValidationError("Informe CPF com 11 dígitos ou CNPJ com 14 dígitos.")
        from accounts.models import UserProfile
        qs = UserProfile.objects.filter(document_number__in=[digits, format_cpf_cnpj(digits)])
        if self.instance:
            qs = qs.exclude(user=self.instance)
        if qs.exists():
            raise serializers.ValidationError("Já existe funcionário cadastrado com este CPF/CNPJ.")
        return format_cpf_cnpj(digits)

    def validate_phone_e164(self, value):
        return self._validate_e164(value, "Use formato E.164. Exemplo Brasil: +5511999999999")

    def validate_secondary_phone_e164(self, value):
        return self._validate_e164(value, "Use formato E.164. Exemplo Brasil: +5511988887777")

    def _validate_e164(self, value, message):
        try:
            return normalize_br_phone_e164(value)
        except serializers.ValidationError:
            raise serializers.ValidationError(message)

    def validate_zip_code(self, value):
        digits = only_digits(value)
        if not digits:
            return ""
        if len(digits) != 8:
            raise serializers.ValidationError("Informe o CEP com 8 dígitos.")
        return format_cep(digits)

    def validate_state(self, value):
        value = (value or "").strip().upper()
        if value and not UF_RE.match(value):
            raise serializers.ValidationError("Informe a UF com 2 letras. Exemplo: SP.")
        return value

    def validate(self, attrs):
        profile_attrs = attrs.get("profile", {})
        role = attrs.get("role") or getattr(getattr(self.instance, "profile", None), "role", None)
        technician_specialty = attrs.get("technician_specialty") or getattr(getattr(self.instance, "profile", None), "technician_specialty", "")
        if role == ROLE_TECHNICIAN and not technician_specialty:
            raise serializers.ValidationError({"technician_specialty": "Informe a sub divisão do técnico: Mecânico, Funileiro ou Eletricista."})
        if self.instance and getattr(getattr(self.instance, "profile", None), "role", None) == ROLE_OWNER:
            raise serializers.ValidationError("Usuário Dono não pode ser alterado por esta tela. Use o comando create_owner_user.")
        person_type = profile_attrs.get("person_type", getattr(getattr(self.instance, "profile", None), "person_type", "individual"))
        document = profile_attrs.get("document_number", getattr(getattr(self.instance, "profile", None), "document_number", "")) or ""
        digits = only_digits(document)
        if person_type == "company" and digits and len(digits) != 14:
            raise serializers.ValidationError({"document_number": "Pessoa jurídica deve usar CNPJ com 14 dígitos."})
        if person_type == "individual" and digits and len(digits) != 11:
            raise serializers.ValidationError({"document_number": "Pessoa física deve usar CPF com 11 dígitos."})
        if person_type == "company":
            attrs["last_name"] = ""
        return attrs

    def _apply_profile_attrs(self, user, profile_attrs):
        if not profile_attrs:
            return
        profile = user.profile
        for key, value in profile_attrs.items():
            if key == "state" and value:
                value = str(value).upper()
            setattr(profile, key, value)
        profile.full_clean()
        profile.save()

    def create(self, validated_data):
        validated_data.pop("remove_photo_3x4", None)
        role = validated_data.pop("role", "attendant")
        technician_specialty = validated_data.pop("technician_specialty", "")
        profile_attrs = validated_data.pop("profile", {})
        user = User(**validated_data)
        user.set_unusable_password()
        user.save()
        apply_role_to_user(user, role, technician_specialty)
        self._apply_profile_attrs(user, profile_attrs)
        return user

    def update(self, instance, validated_data):
        remove_photo_3x4 = validated_data.pop("remove_photo_3x4", False)
        role = validated_data.pop("role", None)
        technician_specialty = validated_data.pop("technician_specialty", None)
        profile_attrs = validated_data.pop("profile", {})
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if role or technician_specialty is not None:
            apply_role_to_user(instance, role or instance.profile.role, technician_specialty if technician_specialty is not None else instance.profile.technician_specialty)
        if remove_photo_3x4 and instance.profile.photo_3x4:
            instance.profile.photo_3x4.delete(save=False)
            profile_attrs["photo_3x4"] = ""
        self._apply_profile_attrs(instance, profile_attrs)
        return instance


class ContactGroupSummarySerializer(serializers.ModelSerializer):
    contact_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = ContactGroup
        fields = ["id", "name", "description", "contact_count", "created_at", "updated_at"]
        read_only_fields = ["id", "contact_count", "created_at", "updated_at"]


class ContactGroupSerializer(serializers.ModelSerializer):
    contact_count = serializers.SerializerMethodField()

    class Meta:
        model = ContactGroup
        fields = ["id", "name", "description", "contact_count", "created_at", "updated_at"]
        read_only_fields = ["id", "contact_count", "created_at", "updated_at"]

    def get_contact_count(self, obj):
        return obj.contacts.count()


class ContactSerializer(serializers.ModelSerializer):
    groups = ContactGroupSummarySerializer(many=True, read_only=True)
    group_ids = serializers.PrimaryKeyRelatedField(
        source="groups",
        queryset=ContactGroup.objects.all(),
        many=True,
        required=False,
        write_only=True,
    )
    full_name = serializers.CharField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    address_display = serializers.CharField(read_only=True)
    person_type_label = serializers.CharField(source="get_person_type_display", read_only=True)

    class Meta:
        model = Contact
        fields = [
            "id",
            "person_type",
            "person_type_label",
            "first_name",
            "last_name",
            "trade_name",
            "full_name",
            "display_name",
            "document_number",
            "state_registration",
            "municipal_registration",
            "birth_date",
            "email",
            "phone_e164",
            "secondary_phone_e164",
            "zip_code",
            "address_line",
            "address_number",
            "address_complement",
            "district",
            "city",
            "state",
            "country",
            "address_display",
            "notes",
            "groups",
            "group_ids",
            "custom_data",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "full_name", "display_name", "address_display", "person_type_label", "created_at", "updated_at"]

    def validate_phone_e164(self, value):
        return self._validate_e164(value, "Use formato E.164. Exemplo Brasil: +5511999999999")

    def validate_secondary_phone_e164(self, value):
        return self._validate_e164(value, "Use formato E.164. Exemplo Brasil: +5511988887777")

    def _validate_e164(self, value, message):
        try:
            return normalize_br_phone_e164(value)
        except serializers.ValidationError:
            raise serializers.ValidationError(message)

    def validate_email(self, value):
        return (value or "").strip().lower()

    def validate_document_number(self, value):
        digits = only_digits(value)
        if not digits:
            return ""
        if len(digits) not in (11, 14):
            raise serializers.ValidationError("Informe CPF com 11 dígitos ou CNPJ com 14 dígitos.")
        qs = Contact.objects.filter(document_number__in=[digits, format_cpf_cnpj(digits)])
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Já existe cliente cadastrado com este CPF/CNPJ.")
        return format_cpf_cnpj(digits)

    def validate_zip_code(self, value):
        digits = only_digits(value)
        if not digits:
            return ""
        if len(digits) != 8:
            raise serializers.ValidationError("Informe o CEP com 8 dígitos.")
        return format_cep(digits)

    def validate_state(self, value):
        value = (value or "").strip().upper()
        if value and not UF_RE.match(value):
            raise serializers.ValidationError("Informe a UF com 2 letras. Exemplo: SP.")
        return value

    def validate(self, attrs):
        person_type = attrs.get("person_type", getattr(self.instance, "person_type", Contact.PersonType.INDIVIDUAL))
        first_name = (attrs.get("first_name", getattr(self.instance, "first_name", "")) or "").strip()
        last_name = (attrs.get("last_name", getattr(self.instance, "last_name", "")) or "").strip()
        document = attrs.get("document_number", getattr(self.instance, "document_number", "")) or ""
        digits = only_digits(document)

        if person_type == Contact.PersonType.COMPANY:
            if not first_name:
                raise serializers.ValidationError({"first_name": "Informe a razão social."})
            if digits and len(digits) != 14:
                raise serializers.ValidationError({"document_number": "Pessoa jurídica deve usar CNPJ com 14 dígitos."})
            attrs["last_name"] = ""
        else:
            if not first_name:
                raise serializers.ValidationError({"first_name": "Informe o nome."})
            if digits and len(digits) != 11:
                raise serializers.ValidationError({"document_number": "Pessoa física deve usar CPF com 11 dígitos."})
            attrs["last_name"] = last_name

        attrs["first_name"] = first_name
        return attrs


class MessageTemplateSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = MessageTemplate
        fields = [
            "id",
            "name",
            "slug",
            "channel",
            "description",
            "email_subject",
            "email_html_body",
            "email_text_body",
            "whatsapp_body",
            "is_active",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "slug", "created_by_name", "created_at", "updated_at"]

    def validate(self, attrs):
        channel = attrs.get("channel", getattr(self.instance, "channel", None))
        email_subject = attrs.get("email_subject", getattr(self.instance, "email_subject", ""))
        email_html_body = attrs.get("email_html_body", getattr(self.instance, "email_html_body", ""))
        whatsapp_body = attrs.get("whatsapp_body", getattr(self.instance, "whatsapp_body", ""))
        if channel == MessageTemplate.Channel.EMAIL:
            if not email_subject:
                raise serializers.ValidationError({"email_subject": "Informe o assunto do email."})
            if not email_html_body:
                raise serializers.ValidationError({"email_html_body": "Informe o corpo HTML do email."})
        if channel == MessageTemplate.Channel.WHATSAPP and not whatsapp_body:
            raise serializers.ValidationError({"whatsapp_body": "Informe o texto do WhatsApp."})
        return attrs


class AutomationSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source="template.name", read_only=True)
    contact_name = serializers.CharField(source="contact.full_name", read_only=True)
    group_name = serializers.CharField(source="group.name", read_only=True)
    recipient_user_name = serializers.SerializerMethodField()
    template_id = serializers.PrimaryKeyRelatedField(source="template", queryset=MessageTemplate.objects.all(), write_only=True)
    contact_id = serializers.PrimaryKeyRelatedField(source="contact", queryset=Contact.objects.all(), required=False, allow_null=True, write_only=True)
    group_id = serializers.PrimaryKeyRelatedField(source="group", queryset=ContactGroup.objects.all(), required=False, allow_null=True, write_only=True)
    recipient_user_id = serializers.PrimaryKeyRelatedField(source="recipient_user", queryset=User.objects.all(), required=False, allow_null=True, write_only=True)

    class Meta:
        model = Automation
        fields = [
            "id",
            "name",
            "template",
            "template_id",
            "template_name",
            "channel",
            "target_type",
            "contact",
            "contact_id",
            "contact_name",
            "group",
            "group_id",
            "group_name",
            "recipient_user",
            "recipient_user_id",
            "recipient_user_name",
            "schedule_type",
            "run_at",
            "interval_minutes",
            "next_run_at",
            "last_run_at",
            "last_error",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "template",
            "contact",
            "group",
            "recipient_user",
            "template_name",
            "contact_name",
            "group_name",
            "recipient_user_name",
            "next_run_at",
            "last_run_at",
            "last_error",
            "created_at",
            "updated_at",
        ]

    def get_recipient_user_name(self, obj):
        if not obj.recipient_user:
            return ""
        return obj.recipient_user.get_full_name() or obj.recipient_user.username

    def validate(self, attrs):
        template = attrs.get("template", getattr(self.instance, "template", None))
        channel = attrs.get("channel", getattr(self.instance, "channel", None))
        if template and channel and template.channel != channel:
            raise serializers.ValidationError({"channel": "O canal deve ser igual ao canal do template."})
        target_type = attrs.get("target_type", getattr(self.instance, "target_type", None))
        contact = attrs.get("contact", getattr(self.instance, "contact", None))
        group = attrs.get("group", getattr(self.instance, "group", None))
        recipient_user = attrs.get("recipient_user", getattr(self.instance, "recipient_user", None))
        if target_type == Automation.TargetType.CONTACT and not contact:
            raise serializers.ValidationError({"contact_id": "Informe o contato."})
        if target_type == Automation.TargetType.GROUP and not group:
            raise serializers.ValidationError({"group_id": "Informe o grupo."})
        if target_type == Automation.TargetType.USER and not recipient_user:
            raise serializers.ValidationError({"recipient_user_id": "Informe o usuario."})
        schedule_type = attrs.get("schedule_type", getattr(self.instance, "schedule_type", None))
        interval_minutes = attrs.get("interval_minutes", getattr(self.instance, "interval_minutes", None))
        if schedule_type == Automation.ScheduleType.INTERVAL and not interval_minutes:
            raise serializers.ValidationError({"interval_minutes": "Informe o intervalo em minutos."})
        return attrs

    def create(self, validated_data):
        template = validated_data.get("template")
        if template:
            validated_data["channel"] = validated_data.get("channel") or template.channel
        return super().create(validated_data)

    def update(self, instance, validated_data):
        template = validated_data.get("template", instance.template)
        if template:
            validated_data["channel"] = validated_data.get("channel") or template.channel
        validated_data["next_run_at"] = validated_data.get("run_at", instance.run_at)
        return super().update(instance, validated_data)


class MessageLogSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source="template.name", read_only=True)
    automation_name = serializers.CharField(source="automation.name", read_only=True)
    contact_name = serializers.CharField(source="contact.full_name", read_only=True)
    actor_name = serializers.CharField(source="actor.username", read_only=True)

    class Meta:
        model = MessageLog
        fields = [
            "id",
            "channel",
            "template",
            "template_name",
            "automation",
            "automation_name",
            "contact",
            "contact_name",
            "recipient_user",
            "actor_name",
            "recipient_name",
            "to_email",
            "to_phone",
            "rendered_subject",
            "rendered_html",
            "rendered_text",
            "status",
            "provider_message_id",
            "provider_response",
            "error_message",
            "sent_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ChannelConfigurationSerializer(serializers.ModelSerializer):
    whatsapp_token_configured = serializers.SerializerMethodField()
    whatsapp_access_token = serializers.CharField(write_only=True, required=False, allow_blank=True, style={"input_type": "password"})

    class Meta:
        model = ChannelConfiguration
        fields = [
            "email_enabled",
            "default_from_email",
            "whatsapp_enabled",
            "whatsapp_provider",
            "whatsapp_access_token",
            "whatsapp_token_configured",
            "whatsapp_phone_number_id",
            "whatsapp_api_version",
            "whatsapp_preview_url",
            "updated_at",
        ]
        read_only_fields = ["whatsapp_token_configured", "updated_at"]

    def get_whatsapp_token_configured(self, obj):
        return bool(obj.whatsapp_access_token)

    def validate_whatsapp_provider(self, value):
        if value != ChannelConfiguration.WhatsAppProvider.META:
            raise serializers.ValidationError("WhatsApp deve usar envio real via Meta Cloud API. Modo dummy/desenvolvimento não é permitido.")
        return value

    def update(self, instance, validated_data):
        for field in [
            "email_enabled",
            "default_from_email",
            "whatsapp_enabled",
            "whatsapp_provider",
            "whatsapp_phone_number_id",
            "whatsapp_api_version",
            "whatsapp_preview_url",
        ]:
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        if "whatsapp_access_token" in validated_data:
            instance.whatsapp_access_token = validated_data["whatsapp_access_token"]
        instance.save()
        return instance


class ManualSendSerializer(serializers.Serializer):
    TARGET_CHOICES = [
        ("contacts", "Contatos selecionados"),
        ("group", "Grupo"),
        ("users", "Usuarios selecionados"),
        ("all_contacts", "Todos os contatos ativos"),
        ("all_users", "Todos os usuarios ativos"),
        ("raw", "Destinatarios avulsos"),
    ]
    channel = serializers.ChoiceField(choices=MessageTemplate.Channel.choices)
    template_id = serializers.IntegerField()
    target_type = serializers.ChoiceField(choices=TARGET_CHOICES)
    contact_ids = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
    group_id = serializers.IntegerField(required=False, allow_null=True)
    user_ids = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
    email_to = serializers.ListField(child=serializers.EmailField(), required=False, default=list)
    phone_to = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    context_overrides = serializers.JSONField(required=False, default=dict)

    def validate_phone_to(self, value):
        phones = []
        for phone in value or []:
            try:
                phones.append(normalize_br_phone_e164(phone))
            except serializers.ValidationError as exc:
                raise serializers.ValidationError(f"Telefone inválido: {phone}. Use telefone brasileiro com DDD, por exemplo (11) 99999-9999.") from exc
        return phones

    def validate_template_id(self, value):
        try:
            return MessageTemplate.objects.get(pk=value, is_active=True)
        except MessageTemplate.DoesNotExist as exc:
            raise serializers.ValidationError("Template ativo nao encontrado.") from exc

    def validate(self, attrs):
        template = attrs["template_id"]
        if attrs["channel"] != template.channel:
            raise serializers.ValidationError({"channel": "O canal deve ser igual ao canal do template."})
        target_type = attrs["target_type"]
        if target_type == "contacts" and not attrs.get("contact_ids"):
            raise serializers.ValidationError({"contact_ids": "Informe ao menos um contato."})
        if target_type == "group" and not attrs.get("group_id"):
            raise serializers.ValidationError({"group_id": "Informe o grupo."})
        if target_type == "users" and not attrs.get("user_ids"):
            raise serializers.ValidationError({"user_ids": "Informe ao menos um usuario."})
        if target_type == "raw":
            if attrs["channel"] == MessageTemplate.Channel.EMAIL and not attrs.get("email_to"):
                raise serializers.ValidationError({"email_to": "Informe ao menos um email."})
            if attrs["channel"] == MessageTemplate.Channel.WHATSAPP and not attrs.get("phone_to"):
                raise serializers.ValidationError({"phone_to": "Informe ao menos um telefone."})
        return attrs


class PreviewSerializer(serializers.Serializer):
    contact_id = serializers.IntegerField(required=False, allow_null=True)
    user_id = serializers.IntegerField(required=False, allow_null=True)
    context_overrides = serializers.JSONField(required=False, default=dict)
