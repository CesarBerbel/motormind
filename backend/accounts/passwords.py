from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.core.exceptions import ValidationError
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode

User = get_user_model()


def build_password_setup_url(user):
    uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    frontend_base_url = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")
    return f"{frontend_base_url}/definir-senha/{uidb64}/{token}"


def send_password_setup_email(user, request=None):
    if not user.email:
        raise ValidationError("O usuário precisa ter email cadastrado para receber o link de definição de senha.")
    url = build_password_setup_url(user)
    subject = "Defina sua senha de acesso"
    context = {"user": user, "display_name": user.get_full_name() or user.username, "password_setup_url": url, "system_name": "Sistema da Oficina"}
    plain_message = render_to_string("accounts/password_setup_email.txt", context)
    send_mail(subject, plain_message, settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=False)
    return url


def get_user_from_password_setup_token(uidb64, token):
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return None
    if not default_token_generator.check_token(user, token):
        return None
    return user


def confirm_password_setup(uidb64, token, password):
    user = get_user_from_password_setup_token(uidb64, token)
    if not user:
        raise ValidationError("Link inválido ou expirado. Solicite um novo link ao administrador.")
    validate_password(password, user=user)
    user.set_password(password)
    user.is_active = True
    user.save(update_fields=["password", "is_active"])
    return user
