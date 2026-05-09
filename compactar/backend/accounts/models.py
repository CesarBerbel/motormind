from uuid import uuid4
import os

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver

from .roles import ROLE_ATTENDANT, ROLE_CHOICES, ROLE_OWNER, ROLE_TECHNICIAN, TECHNICIAN_SPECIALTY_CHOICES


def employee_photo_upload_path(instance, filename):
    ext = os.path.splitext(filename or "foto.jpg")[1].lower() or ".jpg"
    username = getattr(instance.user, "username", "funcionario") or "funcionario"
    safe_username = "".join(ch for ch in username.lower() if ch.isalnum() or ch in ("-", "_"))[:40] or "funcionario"
    return f"accounts/employees/{safe_username}/{uuid4().hex}{ext}"


class UserProfile(models.Model):
    class PersonType(models.TextChoices):
        INDIVIDUAL = "individual", "Pessoa física"
        COMPANY = "company", "Pessoa jurídica"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=30, choices=ROLE_CHOICES, default=ROLE_ATTENDANT, db_index=True)
    technician_specialty = models.CharField(max_length=30, choices=TECHNICIAN_SPECIALTY_CHOICES, blank=True)
    person_type = models.CharField(max_length=20, choices=PersonType.choices, default=PersonType.INDIVIDUAL, db_index=True)
    document_number = models.CharField(max_length=18, blank=True, db_index=True, verbose_name="CPF/CNPJ")
    trade_name = models.CharField(max_length=160, blank=True, verbose_name="Nome fantasia")
    state_registration = models.CharField(max_length=40, blank=True, verbose_name="Inscrição estadual")
    municipal_registration = models.CharField(max_length=40, blank=True, verbose_name="Inscrição municipal")
    birth_date = models.DateField(null=True, blank=True, verbose_name="Data de nascimento/fundação")
    photo_3x4 = models.FileField(
        upload_to=employee_photo_upload_path,
        blank=True,
        validators=[FileExtensionValidator(allowed_extensions=["jpg", "jpeg", "png", "webp"])],
        verbose_name="Foto 3x4",
    )
    phone_e164 = models.CharField(max_length=40, blank=True, verbose_name="WhatsApp / telefone principal")
    secondary_phone_e164 = models.CharField(max_length=40, blank=True, verbose_name="Telefone secundário")
    zip_code = models.CharField(max_length=9, blank=True, verbose_name="CEP")
    address_line = models.CharField(max_length=180, blank=True, verbose_name="Endereço")
    address_number = models.CharField(max_length=20, blank=True, verbose_name="Número")
    address_complement = models.CharField(max_length=120, blank=True, verbose_name="Complemento")
    district = models.CharField(max_length=120, blank=True, verbose_name="Bairro")
    city = models.CharField(max_length=120, blank=True, verbose_name="Cidade")
    state = models.CharField(max_length=2, blank=True, verbose_name="UF")
    country = models.CharField(max_length=80, default="Brasil", blank=True, verbose_name="País")
    notes = models.TextField(blank=True)
    custom_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["user__first_name", "user__last_name", "user__username"]
        verbose_name = "Perfil de usuário/funcionário"
        verbose_name_plural = "Perfis de usuários/funcionários"

    def clean(self):
        super().clean()
        if self.role == ROLE_OWNER and not (self.user.is_superuser and self.user.is_staff):
            raise ValidationError({"role": "O papel Dono exige um usuário superuser/staff criado por comando."})
        if self.role == ROLE_TECHNICIAN and not self.technician_specialty:
            raise ValidationError({"technician_specialty": "Informe se o técnico é Mecânico, Funileiro ou Eletricista."})
        if self.role != ROLE_TECHNICIAN and self.technician_specialty:
            raise ValidationError({"technician_specialty": "Especialidade técnica só deve ser usada para o papel Técnico."})
        if self.photo_3x4 and getattr(self.photo_3x4, "size", 0) > 3 * 1024 * 1024:
            raise ValidationError({"photo_3x4": "A foto 3x4 deve ter no máximo 3 MB."})

    @property
    def role_label(self):
        return self.get_role_display()

    @property
    def technician_specialty_label(self):
        return self.get_technician_specialty_display() if self.technician_specialty else ""

    @property
    def person_type_label(self):
        return self.get_person_type_display()

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
        return f"{self.user.get_full_name() or self.user.username} - {self.role_label}"


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def ensure_user_profile(sender, instance, created, **kwargs):
    default_role = ROLE_OWNER if instance.is_superuser else ROLE_ATTENDANT
    UserProfile.objects.get_or_create(user=instance, defaults={"role": default_role})


class AuditLog(models.Model):
    class Action(models.TextChoices):
        CREATE = "create", "Criação"
        UPDATE = "update", "Alteração"
        DELETE = "delete", "Exclusão"
        STATUS_CHANGE = "status_change", "Alteração de status"
        LOGIN = "login", "Login"
        LOGOUT = "logout", "Logout"
        PERMISSION = "permission", "Permissão"
        SYSTEM = "system", "Sistema"

    action = models.CharField(max_length=30, choices=Action.choices, db_index=True)
    app_label = models.CharField(max_length=80, blank=True, db_index=True)
    model_name = models.CharField(max_length=80, blank=True, db_index=True)
    object_id = models.CharField(max_length=80, blank=True, db_index=True)
    object_repr = models.CharField(max_length=255, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_logs")
    description = models.CharField(max_length=255, blank=True)
    before = models.JSONField(default=dict, blank=True)
    after = models.JSONField(default=dict, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["app_label", "model_name", "object_id"], name="audit_object_idx"),
            models.Index(fields=["action", "created_at"], name="audit_action_created_idx"),
        ]
        verbose_name = "registro de auditoria"
        verbose_name_plural = "registros de auditoria"

    @property
    def action_label(self):
        return self.get_action_display()

    def __str__(self):
        target = self.object_repr or "/".join(part for part in [self.app_label, self.model_name, self.object_id] if part)
        return f"{self.get_action_display()} - {target or self.description or 'sistema'}"
