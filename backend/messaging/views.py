from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import HasViewPermission
from accounts.roles import ROLE_CHOICES, ROLE_OWNER, TECHNICIAN_SPECIALTY_CHOICES

from .models import Automation, ChannelConfiguration, Contact, ContactGroup, MessageLog, MessageTemplate
from .serializers import (
    AutomationSerializer,
    ChannelConfigurationSerializer,
    ContactGroupSerializer,
    ContactSerializer,
    ManualSendSerializer,
    MessageLogSerializer,
    MessageTemplateSerializer,
    PreviewSerializer,
    UserSerializer,
)
from .services import create_and_send, process_automation, render_message

User = get_user_model()


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class DashboardView(APIView):
    permission_classes = [HasViewPermission]
    permission_code = "messaging.manage"

    def get(self, request):
        today = timezone.localdate()
        logs_today = MessageLog.objects.filter(created_at__date=today)
        data = {
            "counts": {
                "contacts": Contact.objects.count(),
                "templates": MessageTemplate.objects.count(),
                "automations_active": Automation.objects.filter(is_active=True).count(),
                "sent_today": logs_today.filter(status=MessageLog.Status.SENT).count(),
                "failed_today": logs_today.filter(status=MessageLog.Status.FAILED).count(),
            },
            "status_counts": list(MessageLog.objects.values("status").annotate(total=Count("id")).order_by("status")),
            "recent_logs": MessageLogSerializer(MessageLog.objects.select_related("template", "automation", "contact", "actor")[:10], many=True).data,
            "next_automations": AutomationSerializer(
                Automation.objects.select_related("template", "contact", "group", "recipient_user").filter(is_active=True, next_run_at__isnull=False)[:10],
                many=True,
            ).data,
        }
        return Response(data)




class PasswordSetupConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        uidb64 = request.data.get("uidb64") or ""
        token = request.data.get("token") or ""
        password = request.data.get("password") or ""
        password_confirm = request.data.get("password_confirm") or ""
        if not uidb64 or not token:
            return Response({"detail": "Link de definição de senha incompleto."}, status=status.HTTP_400_BAD_REQUEST)
        if not password:
            return Response({"password": ["Informe a nova senha."]}, status=status.HTTP_400_BAD_REQUEST)
        if password != password_confirm:
            return Response({"password_confirm": ["A confirmação de senha não confere."]}, status=status.HTTP_400_BAD_REQUEST)
        try:
            from accounts.passwords import confirm_password_setup
            user = confirm_password_setup(uidb64, token, password)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"detail": "Senha definida com sucesso.", "username": user.username})


class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    permission_classes = [HasViewPermission]
    permission_code = "users.manage"
    queryset = User.objects.all().order_by("username")

    def get_queryset(self):
        qs = super().get_queryset().select_related("profile").prefetch_related("groups")
        search = self.request.query_params.get("search")
        if search:
            digits = "".join(ch for ch in search if ch.isdigit())
            search_filter = (
                Q(username__icontains=search)
                | Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(profile__trade_name__icontains=search)
                | Q(profile__phone_e164__icontains=search)
                | Q(profile__secondary_phone_e164__icontains=search)
                | Q(profile__city__icontains=search)
                | Q(profile__state__icontains=search)
            )
            if digits:
                search_filter |= Q(profile__document_number__icontains=digits) | Q(profile__zip_code__icontains=digits)
            qs = qs.filter(search_filter)
        return qs.distinct()

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        if user.is_superuser or getattr(getattr(user, "profile", None), "role", "") == ROLE_OWNER:
            return Response({"detail": "Usuário Dono não pode ser excluído por esta tela."}, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="send-password-setup")
    def send_password_setup(self, request, pk=None):
        user = self.get_object()
        if user.is_superuser or getattr(getattr(user, "profile", None), "role", "") == ROLE_OWNER:
            return Response({"detail": "Usuário Dono deve ter senha administrada somente pelo comando create_owner_user."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            from accounts.passwords import send_password_setup_email
            send_password_setup_email(user, request=request)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"detail": f"Link de definição de senha enviado para {user.email}."})

    @action(detail=False, methods=["get"], url_path="role-options")
    def role_options(self, request):
        roles = [{"value": value, "label": label} for value, label in ROLE_CHOICES if value != ROLE_OWNER]
        specialties = [{"value": value, "label": label} for value, label in TECHNICIAN_SPECIALTY_CHOICES]
        return Response({"roles": roles, "technician_specialties": specialties})


class ContactGroupViewSet(viewsets.ModelViewSet):
    serializer_class = ContactGroupSerializer
    permission_classes = [HasViewPermission]
    permission_code_map = {"read": "contacts.view", "write": "contacts.manage"}
    queryset = ContactGroup.objects.all().annotate(contact_count=Count("contacts"))

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))
        return qs


class ContactViewSet(viewsets.ModelViewSet):
    serializer_class = ContactSerializer
    permission_classes = [HasViewPermission]
    permission_code_map = {"read": "contacts.view", "write": "contacts.manage"}
    queryset = Contact.objects.prefetch_related("groups").all()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        group_id = self.request.query_params.get("group")
        if search:
            digits = "".join(ch for ch in search if ch.isdigit())
            search_filter = (
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(trade_name__icontains=search)
                | Q(email__icontains=search)
                | Q(phone_e164__icontains=search)
                | Q(secondary_phone_e164__icontains=search)
                | Q(document_number__icontains=search)
                | Q(city__icontains=search)
                | Q(state__icontains=search)
            )
            if digits:
                search_filter |= Q(document_number__icontains=digits) | Q(zip_code__icontains=digits)
            qs = qs.filter(search_filter)
        if group_id:
            qs = qs.filter(groups__id=group_id)
        return qs.distinct()


class MessageTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = MessageTemplateSerializer
    permission_classes = [HasViewPermission]
    permission_code = "messaging.manage"
    queryset = MessageTemplate.objects.all()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def get_queryset(self):
        qs = super().get_queryset()
        channel = self.request.query_params.get("channel")
        search = self.request.query_params.get("search")
        active = self.request.query_params.get("active")
        if channel:
            qs = qs.filter(channel=channel)
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))
        if active in {"true", "false"}:
            qs = qs.filter(is_active=(active == "true"))
        return qs

    @action(detail=True, methods=["post"])
    def preview(self, request, pk=None):
        template = self.get_object()
        serializer = PreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        contact = None
        recipient_user = None
        if data.get("contact_id"):
            contact = Contact.objects.filter(pk=data["contact_id"]).first()
        if data.get("user_id"):
            recipient_user = User.objects.filter(pk=data["user_id"]).first()
        rendered = render_message(
            template,
            actor=request.user,
            contact=contact,
            recipient_user=recipient_user,
            extra=data.get("context_overrides", {}),
        )
        return Response(rendered)

    @action(detail=False, methods=["get"])
    def variables(self, request):
        return Response(
            {
                "variables": [
                    "{{ nome_usuario }}",
                    "{{ email_usuario }}",
                    "{{ usuario.username }}",
                    "{{ usuario_logado.full_name }}",
                    "{{ remetente.email }}",
                    "{{ contato.first_name }}",
                    "{{ contato.last_name }}",
                    "{{ nome_contato }}",
                    "{{ contato.email }}",
                    "{{ contato.phone_e164 }}",
                    "{{ nome_destinatario }}",
                    "{{ email_destinatario }}",
                    "{{ telefone_destinatario }}",
                    "{{ destinatario.nome }}",
                    "{{ destinatario.telefone }}",
                    "{{ custom.plano }}",
                    "{{ numero_os }}",
                    "{{ status_os }}",
                    "{{ total_os }}",
                    "{{ saldo_os }}",
                    "{{ nome_cliente }}",
                    "{{ cliente.email }}",
                    "{{ telefone_cliente }}",
                    "{{ placa_veiculo }}",
                    "{{ modelo_veiculo }}",
                    "{{ veiculo.marca }}",
                    "{{ os.diagnostico }}",
                    "{{ os.previsao }}",
                    "{{ agora }}",
                ]
            }
        )


class AutomationViewSet(viewsets.ModelViewSet):
    serializer_class = AutomationSerializer
    permission_classes = [HasViewPermission]
    permission_code = "messaging.manage"
    queryset = Automation.objects.select_related("template", "contact", "group", "recipient_user").all()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def get_queryset(self):
        qs = super().get_queryset()
        channel = self.request.query_params.get("channel")
        active = self.request.query_params.get("active")
        search = self.request.query_params.get("search")
        if channel:
            qs = qs.filter(channel=channel)
        if active in {"true", "false"}:
            qs = qs.filter(is_active=(active == "true"))
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(template__name__icontains=search))
        return qs

    @action(detail=True, methods=["post"])
    def pause(self, request, pk=None):
        automation = self.get_object()
        automation.is_active = False
        automation.save(update_fields=["is_active", "updated_at"])
        return Response(AutomationSerializer(automation).data)

    @action(detail=True, methods=["post"])
    def resume(self, request, pk=None):
        automation = self.get_object()
        automation.is_active = True
        if not automation.next_run_at:
            automation.next_run_at = automation.run_at if automation.run_at > timezone.now() else timezone.now()
        automation.save(update_fields=["is_active", "next_run_at", "updated_at"])
        return Response(AutomationSerializer(automation).data)

    @action(detail=True, methods=["post"])
    def run_now(self, request, pk=None):
        automation = self.get_object()
        log_ids = process_automation(automation)
        return Response({"message_log_ids": log_ids})


class MessageLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MessageLogSerializer
    permission_classes = [HasViewPermission]
    permission_code = "messaging.manage"
    queryset = MessageLog.objects.select_related("template", "automation", "contact", "recipient_user", "actor").all()

    def get_queryset(self):
        qs = super().get_queryset()
        channel = self.request.query_params.get("channel")
        status_value = self.request.query_params.get("status")
        search = self.request.query_params.get("search")
        if channel:
            qs = qs.filter(channel=channel)
        if status_value:
            qs = qs.filter(status=status_value)
        if search:
            qs = qs.filter(
                Q(to_email__icontains=search)
                | Q(to_phone__icontains=search)
                | Q(recipient_name__icontains=search)
                | Q(rendered_subject__icontains=search)
            )
        return qs


class ChannelConfigurationView(APIView):
    permission_classes = [HasViewPermission]
    permission_code = "settings.manage"

    def get(self, request):
        return Response(ChannelConfigurationSerializer(ChannelConfiguration.load()).data)

    def put(self, request):
        config = ChannelConfiguration.load()
        serializer = ChannelConfigurationSerializer(config, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def patch(self, request):
        config = ChannelConfiguration.load()
        serializer = ChannelConfigurationSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ManualSendView(APIView):
    permission_classes = [HasViewPermission]
    permission_code = "messages.send"

    def post(self, request):
        serializer = ManualSendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        template = data["template_id"]
        channel = data["channel"]
        target_type = data["target_type"]
        extra = data.get("context_overrides", {})
        logs = []
        skipped = []

        def add_contact(contact):
            required = contact.email if channel == MessageTemplate.Channel.EMAIL else contact.phone_e164
            if not required:
                skipped.append({"type": "contact", "id": contact.id, "reason": "Sem email" if channel == "email" else "Sem telefone"})
                return
            logs.append(create_and_send(template=template, actor=request.user, contact=contact, extra=extra))

        def add_user(user):
            if channel == MessageTemplate.Channel.WHATSAPP:
                skipped.append({"type": "user", "id": user.id, "reason": "Usuario Django nao possui telefone. Use contatos."})
                return
            if not user.email:
                skipped.append({"type": "user", "id": user.id, "reason": "Sem email"})
                return
            logs.append(create_and_send(template=template, actor=request.user, recipient_user=user, extra=extra))

        if target_type == "contacts":
            for contact in Contact.objects.filter(id__in=data.get("contact_ids", []), is_active=True):
                add_contact(contact)
        elif target_type == "group":
            group = ContactGroup.objects.get(pk=data["group_id"])
            for contact in group.contacts.filter(is_active=True):
                add_contact(contact)
        elif target_type == "all_contacts":
            for contact in Contact.objects.filter(is_active=True):
                add_contact(contact)
        elif target_type == "users":
            for user in User.objects.filter(id__in=data.get("user_ids", []), is_active=True):
                add_user(user)
        elif target_type == "all_users":
            for user in User.objects.filter(is_active=True):
                add_user(user)
        elif target_type == "raw":
            if channel == MessageTemplate.Channel.EMAIL:
                for email in data.get("email_to", []):
                    logs.append(create_and_send(template=template, actor=request.user, raw_email=email, extra=extra))
            else:
                for phone in data.get("phone_to", []):
                    logs.append(create_and_send(template=template, actor=request.user, raw_phone=phone, extra=extra))

        return Response(
            {"sent": MessageLogSerializer(logs, many=True).data, "skipped": skipped},
            status=status.HTTP_201_CREATED,
        )
