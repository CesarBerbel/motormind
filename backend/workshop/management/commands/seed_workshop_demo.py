from decimal import Decimal

from django.core.management.base import BaseCommand

from messaging.models import Contact, MessageTemplate
from workshop.models import GeneralCategory, Part, ServicePackage, ServicePackageItem, Vehicle, WorkOrderNotificationRule, WorkshopService


class Command(BaseCommand):
    help = "Cria dados iniciais de oficina, templates e regras de notificacao de OS."

    def handle(self, *args, **options):
        customer, _ = Contact.objects.get_or_create(
            email="cliente.demo@example.com",
            defaults={"first_name": "Cliente", "last_name": "Demo", "phone_e164": "+5511999999999", "custom_data": {"origem": "demo"}, "is_active": True},
        )
        Vehicle.objects.get_or_create(plate="AA-00-AA", defaults={"customer": customer, "make": "Toyota", "model": "Corolla", "year": 2018, "color": "Prata", "odometer_km": 83000})
        cat_manutencao, _ = GeneralCategory.objects.get_or_create(type=GeneralCategory.CategoryType.SERVICE, name="Manutencao", defaults={"code": "SERV-MAN", "is_active": True})
        cat_diagnostico, _ = GeneralCategory.objects.get_or_create(type=GeneralCategory.CategoryType.SERVICE, name="Diagnostico", defaults={"code": "SERV-DIAG", "is_active": True})
        cat_lubrificantes, _ = GeneralCategory.objects.get_or_create(type=GeneralCategory.CategoryType.PART, name="Lubrificantes", defaults={"code": "PEC-LUB", "is_active": True})
        cat_filtros, _ = GeneralCategory.objects.get_or_create(type=GeneralCategory.CategoryType.PART, name="Filtros", defaults={"code": "PEC-FIL", "is_active": True})
        revisao, _ = WorkshopService.objects.get_or_create(code="REVISAO", defaults={"name": "Revisao geral", "category": cat_manutencao, "legacy_category_name": "Manutencao", "default_unit_price": Decimal("75.00"), "estimated_hours": Decimal("1.50")})
        diagnostico, _ = WorkshopService.objects.get_or_create(code="DIAG", defaults={"name": "Diagnostico eletronico", "category": cat_diagnostico, "legacy_category_name": "Diagnostico", "default_unit_price": Decimal("45.00"), "estimated_hours": Decimal("1.00")})
        pacote, _ = ServicePackage.objects.get_or_create(code="PKG-REV-BASICA", defaults={"name": "Pacote revisao basica", "description": "Combo demo com revisao geral e diagnostico eletronico.", "is_active": True})
        ServicePackageItem.objects.get_or_create(service_package=pacote, service=revisao, defaults={"description": revisao.name, "quantity": Decimal("1.00"), "unit_price": revisao.default_unit_price, "position": 1})
        ServicePackageItem.objects.get_or_create(service_package=pacote, service=diagnostico, defaults={"description": diagnostico.name, "quantity": Decimal("1.00"), "unit_price": diagnostico.default_unit_price, "position": 2})
        Part.objects.get_or_create(sku="OIL-5W30", defaults={"name": "Oleo motor 5W30", "category": cat_lubrificantes, "brand": "Generic", "unit": "L", "cost_price": Decimal("6.50"), "sale_price": Decimal("11.50"), "stock_quantity": Decimal("40.00"), "minimum_stock": Decimal("10.00")})
        Part.objects.get_or_create(sku="FILT-OLEO-001", defaults={"name": "Filtro de oleo", "category": cat_filtros, "brand": "Generic", "unit": "un", "cost_price": Decimal("8.00"), "sale_price": Decimal("15.00"), "stock_quantity": Decimal("12.00"), "minimum_stock": Decimal("5.00")})
        email_ready, _ = MessageTemplate.objects.get_or_create(
            slug="os-pronta-email",
            defaults={
                "name": "OS pronta - Email",
                "channel": MessageTemplate.Channel.EMAIL,
                "description": "Aviso por email quando a ordem de servico fica pronta.",
                "email_subject": "Sua ordem de servico {{ numero_os }} esta pronta",
                "email_html_body": "<h2>Olá {{ nome_cliente }},</h2><p>A sua ordem de serviço <strong>{{ numero_os }}</strong> do veículo <strong>{{ placa_veiculo }} - {{ modelo_veiculo }}</strong> está pronta para entrega.</p><p>Status: {{ status_os }}<br>Total: {{ total_os }}<br>Saldo: {{ saldo_os }}</p><p>Obrigado,<br>{{ nome_usuario }}</p>",
                "email_text_body": "Olá {{ nome_cliente }}, a OS {{ numero_os }} do veículo {{ placa_veiculo }} está pronta. Total: {{ total_os }}. Saldo: {{ saldo_os }}.",
                "is_active": True,
            },
        )
        whatsapp_ready, _ = MessageTemplate.objects.get_or_create(
            slug="os-pronta-whatsapp",
            defaults={"name": "OS pronta - WhatsApp", "channel": MessageTemplate.Channel.WHATSAPP, "description": "Aviso por WhatsApp quando a ordem de servico fica pronta.", "whatsapp_body": "Olá {{ nome_cliente }}! A sua OS {{ numero_os }} do veículo {{ placa_veiculo }} - {{ modelo_veiculo }} está pronta. Total: {{ total_os }}. Saldo: {{ saldo_os }}.", "is_active": True},
        )
        WorkOrderNotificationRule.objects.get_or_create(name="Avisar por email quando OS estiver pronta", trigger_status="ready", channel=MessageTemplate.Channel.EMAIL, defaults={"template": email_ready, "is_active": True, "send_once_per_status": True})
        WorkOrderNotificationRule.objects.get_or_create(name="Avisar por WhatsApp quando OS estiver pronta", trigger_status="ready", channel=MessageTemplate.Channel.WHATSAPP, defaults={"template": whatsapp_ready, "is_active": False, "send_once_per_status": True})
        self.stdout.write(self.style.SUCCESS("Dados demo de oficina criados/atualizados."))
