from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from messaging.models import Contact, ContactGroup
from purchasing.models import Supplier
from workshop.models import GeneralCategory, Part, ServicePackage, ServicePackageItem, Vehicle, WorkshopProfile, WorkshopService


D = Decimal


SERVICE_CATEGORIES = [
    ("Revisões", "SERV-REV"),
    ("Diagnóstico", "SERV-DIAG"),
    ("Freios", "SERV-FRE"),
    ("Suspensão e direção", "SERV-SUS"),
    ("Elétrica e eletrônica", "SERV-ELE"),
    ("Ar condicionado", "SERV-AR"),
    ("Motor e transmissão", "SERV-MOT"),
    ("Estética e conservação", "SERV-EST"),
]

PART_CATEGORIES = [
    ("Filtros", "PEC-FIL"),
    ("Lubrificantes", "PEC-LUB"),
    ("Freios", "PEC-FRE"),
    ("Suspensão", "PEC-SUS"),
    ("Ignição", "PEC-IGN"),
    ("Baterias", "PEC-BAT"),
    ("Arrefecimento", "PEC-ARR"),
    ("Correias", "PEC-COR"),
    ("Elétrica", "PEC-ELE"),
    ("Pneus e rodas", "PEC-PNE"),
]

CLIENTS = [
    {
        "seed_key": "cliente-mariana-souza",
        "person_type": Contact.PersonType.INDIVIDUAL,
        "first_name": "Mariana",
        "last_name": "Souza Almeida",
        "document_number": "123.456.789-09",
        "birth_date": "1988-04-12",
        "email": "mariana.souza.teste@example.com",
        "phone_e164": "+5511998765432",
        "secondary_phone_e164": "+5511987654321",
        "zip_code": "01310-100",
        "address_line": "Avenida Paulista",
        "address_number": "1578",
        "address_complement": "Apto 84",
        "district": "Bela Vista",
        "city": "São Paulo",
        "state": "SP",
        "notes": "Cliente de teste com histórico de revisão preventiva.",
        "vehicle": {"plate": "FKE3B21", "make": "Toyota", "model": "Corolla", "version": "XEi 2.0", "year": 2020, "color": "Prata", "odometer_km": 68420},
    },
    {
        "seed_key": "cliente-roberto-lima",
        "person_type": Contact.PersonType.INDIVIDUAL,
        "first_name": "Roberto",
        "last_name": "Lima Pereira",
        "document_number": "987.654.321-00",
        "birth_date": "1976-11-23",
        "email": "roberto.lima.teste@example.com",
        "phone_e164": "+5511976543210",
        "secondary_phone_e164": "",
        "zip_code": "04094-050",
        "address_line": "Rua dos Jacarandás",
        "address_number": "220",
        "address_complement": "Casa 2",
        "district": "Moema",
        "city": "São Paulo",
        "state": "SP",
        "notes": "Solicita orçamento por WhatsApp antes da aprovação.",
        "vehicle": {"plate": "QWX7J45", "make": "Honda", "model": "Civic", "version": "EXL 2.0", "year": 2019, "color": "Cinza", "odometer_km": 73200},
    },
    {
        "seed_key": "cliente-fernanda-costa",
        "person_type": Contact.PersonType.INDIVIDUAL,
        "first_name": "Fernanda",
        "last_name": "Costa Martins",
        "document_number": "321.654.987-20",
        "birth_date": "1992-02-07",
        "email": "fernanda.costa.teste@example.com",
        "phone_e164": "+5511912345678",
        "secondary_phone_e164": "+551132108765",
        "zip_code": "05001-000",
        "address_line": "Rua Turiassu",
        "address_number": "980",
        "address_complement": "Bloco B",
        "district": "Perdizes",
        "city": "São Paulo",
        "state": "SP",
        "notes": "Cliente usa o veículo diariamente para trabalho.",
        "vehicle": {"plate": "GHB9C12", "make": "Volkswagen", "model": "T-Cross", "version": "Comfortline 200 TSI", "year": 2022, "color": "Branco", "odometer_km": 41800},
    },
    {
        "seed_key": "cliente-carlos-mendes",
        "person_type": Contact.PersonType.INDIVIDUAL,
        "first_name": "Carlos",
        "last_name": "Mendes Rocha",
        "document_number": "456.789.123-66",
        "birth_date": "1981-08-19",
        "email": "carlos.mendes.teste@example.com",
        "phone_e164": "+5511945678901",
        "secondary_phone_e164": "",
        "zip_code": "09530-700",
        "address_line": "Rua Amazonas",
        "address_number": "455",
        "address_complement": "Sala 3",
        "district": "Centro",
        "city": "São Caetano do Sul",
        "state": "SP",
        "notes": "Prefere retirar o veículo no fim do expediente.",
        "vehicle": {"plate": "RTA4D88", "make": "Jeep", "model": "Renegade", "version": "Longitude 1.8", "year": 2021, "color": "Preto", "odometer_km": 52650},
    },
    {
        "seed_key": "cliente-padaria-estrela",
        "person_type": Contact.PersonType.COMPANY,
        "first_name": "Padaria Estrela do Bairro Ltda",
        "last_name": "",
        "trade_name": "Padaria Estrela",
        "document_number": "12.345.678/0001-90",
        "state_registration": "114.814.878.119",
        "municipal_registration": "3.455.998-7",
        "birth_date": "2011-06-15",
        "email": "manutencao.padaria.estrela@example.com",
        "phone_e164": "+551133334444",
        "secondary_phone_e164": "+551133334445",
        "zip_code": "03164-000",
        "address_line": "Rua Serra de Botucatu",
        "address_number": "1234",
        "address_complement": "Loja A",
        "district": "Tatuapé",
        "city": "São Paulo",
        "state": "SP",
        "notes": "Cliente PJ com veículo utilitário para entregas.",
        "vehicle": {"plate": "ECO2F35", "make": "Fiat", "model": "Fiorino", "version": "Endurance 1.4", "year": 2021, "color": "Branco", "odometer_km": 91500},
    },
    {
        "seed_key": "cliente-clinica-viva",
        "person_type": Contact.PersonType.COMPANY,
        "first_name": "Clínica Viva Saúde Integrada Ltda",
        "last_name": "",
        "trade_name": "Clínica Viva",
        "document_number": "27.845.391/0001-22",
        "state_registration": "Isento",
        "municipal_registration": "5.221.780-2",
        "birth_date": "2016-09-02",
        "email": "frota.clinicaviva@example.com",
        "phone_e164": "+551130303030",
        "secondary_phone_e164": "",
        "zip_code": "04547-130",
        "address_line": "Rua Gomes de Carvalho",
        "address_number": "1666",
        "address_complement": "12º andar",
        "district": "Vila Olímpia",
        "city": "São Paulo",
        "state": "SP",
        "notes": "Atendimento de frota leve com faturamento mensal.",
        "vehicle": {"plate": "BVM8A19", "make": "Chevrolet", "model": "Onix Plus", "version": "Premier 1.0 Turbo", "year": 2023, "color": "Azul", "odometer_km": 29800},
    },
]

SUPPLIERS = [
    {
        "name": "Auto Peças Paulista Ltda",
        "trade_name": "Paulista Auto Peças",
        "document": "48.253.110/0001-51",
        "state_registration": "142.756.330.118",
        "municipal_registration": "6.874.230-1",
        "birth_date": "2008-03-17",
        "email": "vendas@paulista-autopecas.example.com",
        "phone": "+551131112222",
        "secondary_phone": "+551131112223",
        "contact_person": "Tatiane Nogueira",
        "zip_code": "01137-000",
        "address_line": "Avenida Rio Branco",
        "address_number": "840",
        "address_complement": "Galpão 4",
        "district": "Campos Elíseos",
        "city": "São Paulo",
        "state": "SP",
        "notes": "Fornecedor principal de filtros, pastilhas e itens de giro rápido.",
    },
    {
        "name": "Distribuidora Técnica Bosch Car Service Ltda",
        "trade_name": "Bosch Técnica Distribuidora",
        "document": "61.430.920/0001-04",
        "state_registration": "117.443.002.119",
        "municipal_registration": "4.875.982-0",
        "birth_date": "2014-10-06",
        "email": "comercial@bosch-tecnica.example.com",
        "phone": "+551135556666",
        "secondary_phone": "",
        "contact_person": "Eduardo Ferraz",
        "zip_code": "06460-010",
        "address_line": "Alameda Araguaia",
        "address_number": "2104",
        "address_complement": "Conj. 52",
        "district": "Alphaville Industrial",
        "city": "Barueri",
        "state": "SP",
        "notes": "Linha elétrica, sensores e equipamentos de diagnóstico.",
    },
    {
        "name": "Lubrificantes Rota Sul Ltda",
        "trade_name": "Rota Sul Lubrificantes",
        "document": "30.911.742/0001-83",
        "state_registration": "224.917.302.110",
        "municipal_registration": "9.117.654-4",
        "birth_date": "2010-01-25",
        "email": "pedidos@rotasul-lubrificantes.example.com",
        "phone": "+551141414141",
        "secondary_phone": "+551141414142",
        "contact_person": "Sandro Pires",
        "zip_code": "09931-400",
        "address_line": "Avenida Fagundes de Oliveira",
        "address_number": "620",
        "address_complement": "Depósito 2",
        "district": "Piraporinha",
        "city": "Diadema",
        "state": "SP",
        "notes": "Óleos, fluidos e aditivos com entrega D+1.",
    },
    {
        "name": "Freios e Suspensão ABC Ltda",
        "trade_name": "ABC Freios",
        "document": "05.774.318/0001-76",
        "state_registration": "286.110.754.115",
        "municipal_registration": "2.901.332-8",
        "birth_date": "2005-07-28",
        "email": "compras@abcfreios.example.com",
        "phone": "+551142424242",
        "secondary_phone": "",
        "contact_person": "Patrícia Monteiro",
        "zip_code": "09015-320",
        "address_line": "Rua Catequese",
        "address_number": "318",
        "address_complement": "",
        "district": "Jardim",
        "city": "Santo André",
        "state": "SP",
        "notes": "Especializado em pastilhas, discos, amortecedores e buchas.",
    },
]

SERVICES = [
    ("SRV-REV-001", "Revisão preventiva básica", "Revisões", "Troca de óleo, filtros e inspeção visual de segurança.", "189.90", "1.50", True),
    ("SRV-REV-002", "Revisão preventiva completa", "Revisões", "Checklist completo com inspeção de freios, suspensão, fluidos e scanner.", "349.90", "3.00", True),
    ("SRV-DIAG-001", "Diagnóstico eletrônico com scanner", "Diagnóstico", "Leitura de falhas, análise de parâmetros e relatório técnico.", "129.90", "1.00", True),
    ("SRV-DIAG-002", "Diagnóstico de ruído e vibração", "Diagnóstico", "Teste de rodagem e inspeção dirigida para localizar ruídos.", "159.90", "1.50", False),
    ("SRV-FRE-001", "Substituição de pastilhas dianteiras", "Freios", "Troca das pastilhas dianteiras com limpeza e teste.", "149.90", "1.20", True),
    ("SRV-FRE-002", "Sangria e troca do fluido de freio", "Freios", "Renovação do fluido de freio e sangria do sistema.", "119.90", "1.00", False),
    ("SRV-SUS-001", "Substituição de amortecedores dianteiros", "Suspensão e direção", "Remoção e instalação do par de amortecedores dianteiros.", "299.90", "2.50", False),
    ("SRV-SUS-002", "Alinhamento e balanceamento", "Suspensão e direção", "Alinhamento computadorizado e balanceamento das quatro rodas.", "159.90", "1.20", True),
    ("SRV-ELE-001", "Teste de bateria e alternador", "Elétrica e eletrônica", "Medição de carga, partida e sistema de alternador.", "59.90", "0.50", True),
    ("SRV-ELE-002", "Reparo de chicote elétrico", "Elétrica e eletrônica", "Diagnóstico e correção de mau contato em chicote.", "229.90", "2.00", False),
    ("SRV-AR-001", "Higienização do ar condicionado", "Ar condicionado", "Limpeza do sistema e aplicação de produto bactericida.", "139.90", "1.00", True),
    ("SRV-AR-002", "Carga de gás do ar condicionado", "Ar condicionado", "Teste de estanqueidade e recarga do sistema.", "249.90", "1.50", False),
    ("SRV-MOT-001", "Troca de correia dentada", "Motor e transmissão", "Substituição do kit de correia dentada e conferência de sincronismo.", "499.90", "4.00", False),
    ("SRV-MOT-002", "Limpeza de corpo de borboleta", "Motor e transmissão", "Remoção de carbonização e reaprendizado quando aplicável.", "189.90", "1.20", False),
    ("SRV-EST-001", "Lavagem técnica externa", "Estética e conservação", "Lavagem detalhada com remoção de contaminantes leves.", "89.90", "1.00", False),
    ("SRV-EST-002", "Cristalização de para-brisa", "Estética e conservação", "Aplicação de repelente de água no para-brisa.", "79.90", "0.50", False),
]

PARTS = [
    ("FIL-OLE-001", "Filtro de óleo blindado", "Filtros", "Mann", "un", "24.90", "49.90", "34", "8", "A1-01"),
    ("FIL-AR-001", "Filtro de ar do motor", "Filtros", "Tecfil", "un", "32.50", "64.90", "22", "6", "A1-02"),
    ("FIL-CAB-001", "Filtro de cabine com carvão ativado", "Filtros", "Wega", "un", "38.70", "79.90", "18", "5", "A1-03"),
    ("OLE-5W30-001", "Óleo sintético 5W30 API SP", "Lubrificantes", "Mobil", "l", "31.90", "59.90", "96", "24", "B2-01"),
    ("OLE-0W20-001", "Óleo sintético 0W20 API SP", "Lubrificantes", "Shell", "l", "36.90", "69.90", "60", "18", "B2-02"),
    ("FLU-FRE-001", "Fluido de freio DOT 4 500ml", "Lubrificantes", "Varga", "un", "18.90", "39.90", "28", "8", "B2-03"),
    ("PAS-FRE-001", "Jogo de pastilhas dianteiras", "Freios", "Fras-le", "jogo", "92.00", "189.90", "12", "4", "C3-01"),
    ("DIS-FRE-001", "Disco de freio ventilado dianteiro", "Freios", "Fremax", "par", "184.00", "359.90", "7", "2", "C3-02"),
    ("AMO-DIA-001", "Amortecedor dianteiro pressurizado", "Suspensão", "Cofap", "un", "238.00", "429.90", "6", "2", "D4-01"),
    ("BIE-SUS-001", "Bieleta da suspensão dianteira", "Suspensão", "Nakata", "un", "44.90", "89.90", "16", "4", "D4-02"),
    ("VEL-IGN-001", "Jogo de velas de ignição", "Ignição", "NGK", "jogo", "118.00", "229.90", "14", "4", "E5-01"),
    ("BOB-IGN-001", "Bobina de ignição individual", "Ignição", "Bosch", "un", "156.00", "289.90", "9", "3", "E5-02"),
    ("BAT-60AH-001", "Bateria automotiva 60Ah", "Baterias", "Moura", "un", "318.00", "589.90", "5", "2", "F6-01"),
    ("BAT-70AH-001", "Bateria automotiva 70Ah", "Baterias", "Heliar", "un", "382.00", "689.90", "4", "2", "F6-02"),
    ("RAD-ADI-001", "Aditivo para radiador orgânico 1L", "Arrefecimento", "Radiex", "l", "21.50", "44.90", "24", "8", "G7-01"),
    ("MAN-RAD-001", "Mangueira superior do radiador", "Arrefecimento", "Jamaica", "un", "55.00", "119.90", "8", "3", "G7-02"),
    ("COR-DEN-001", "Kit correia dentada com tensor", "Correias", "Gates", "kit", "245.00", "489.90", "7", "2", "H8-01"),
    ("COR-ALT-001", "Correia do alternador", "Correias", "Dayco", "un", "48.00", "99.90", "11", "3", "H8-02"),
    ("LAM-H7-001", "Lâmpada halógena H7 55W", "Elétrica", "Osram", "un", "29.90", "59.90", "20", "6", "I9-01"),
    ("SEN-OXI-001", "Sensor de oxigênio pré-catalisador", "Elétrica", "Bosch", "un", "196.00", "379.90", "6", "2", "I9-02"),
    ("PNE-195-55R16", "Pneu 195/55 R16 87V", "Pneus e rodas", "Pirelli", "un", "322.00", "579.90", "10", "4", "J10-01"),
    ("PNE-205-60R16", "Pneu 205/60 R16 92H", "Pneus e rodas", "Goodyear", "un", "368.00", "659.90", "8", "4", "J10-02"),
]

PACKAGES = [
    {
        "code": "PCT-REV-BASICA",
        "name": "Revisão básica até 10.000 km",
        "description": "Pacote de revisão rápida para veículos em uso urbano, com troca de óleo, filtros e inspeção visual.",
        "discount_amount": "40.00",
        "items": [("SRV-REV-001", "1.00"), ("SRV-ELE-001", "1.00")],
    },
    {
        "code": "PCT-REV-COMPLETA",
        "name": "Revisão completa com diagnóstico",
        "description": "Revisão preventiva completa com scanner, checklist de segurança, freios, suspensão e fluidos.",
        "discount_amount": "75.00",
        "items": [("SRV-REV-002", "1.00"), ("SRV-DIAG-001", "1.00"), ("SRV-ELE-001", "1.00")],
    },
    {
        "code": "PCT-FREIOS-SEG",
        "name": "Pacote segurança de freios",
        "description": "Serviços essenciais para manutenção preventiva do sistema de freios.",
        "discount_amount": "35.00",
        "items": [("SRV-FRE-001", "1.00"), ("SRV-FRE-002", "1.00")],
    },
    {
        "code": "PCT-SUSP-RODAGEM",
        "name": "Pacote rodagem estável",
        "description": "Correção de estabilidade com inspeção dirigida, alinhamento e balanceamento.",
        "discount_amount": "50.00",
        "items": [("SRV-DIAG-002", "1.00"), ("SRV-SUS-002", "1.00")],
    },
    {
        "code": "PCT-AR-CONFORTO",
        "name": "Pacote conforto ar condicionado",
        "description": "Higienização e recarga do sistema de ar condicionado para uso diário.",
        "discount_amount": "45.00",
        "items": [("SRV-AR-001", "1.00"), ("SRV-AR-002", "1.00")],
    },
    {
        "code": "PCT-PRE-VENDA",
        "name": "Pacote pré-venda do veículo",
        "description": "Preparação do veículo para venda: diagnóstico, lavagem técnica e cristalização do para-brisa.",
        "discount_amount": "30.00",
        "items": [("SRV-DIAG-001", "1.00"), ("SRV-EST-001", "1.00"), ("SRV-EST-002", "1.00")],
    },
]


def merge_custom_data(instance, **extra):
    data = dict(instance.custom_data or {}) if hasattr(instance, "custom_data") else {}
    data.update(extra)
    return data


class Command(BaseCommand):
    help = "Cria uma massa de dados realística para testes: clientes, fornecedores, peças, serviços e pacotes."

    def add_arguments(self, parser):
        parser.add_argument(
            "--skip-profile",
            action="store_true",
            help="Não cria/atualiza o cadastro da oficina de demonstração.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        counters = {
            "categories": 0,
            "clients": 0,
            "vehicles": 0,
            "suppliers": 0,
            "services": 0,
            "parts": 0,
            "packages": 0,
            "package_items": 0,
        }

        if not options["skip_profile"]:
            self.seed_workshop_profile()

        client_group, _ = ContactGroup.objects.get_or_create(
            name="Clientes seed - Oficina",
            defaults={"description": "Clientes de demonstração criados pelo comando seed_test_data."},
        )

        service_categories = self.seed_categories(GeneralCategory.CategoryType.SERVICE, SERVICE_CATEGORIES, counters)
        part_categories = self.seed_categories(GeneralCategory.CategoryType.PART, PART_CATEGORIES, counters)
        clients = self.seed_clients(client_group, counters)
        self.seed_suppliers(counters)
        services = self.seed_services(service_categories, counters)
        self.seed_parts(part_categories, counters)
        self.seed_packages(services, counters)

        self.stdout.write(self.style.SUCCESS("Seed de testes criado/atualizado com sucesso."))
        self.stdout.write(
            "Resumo: "
            f"{counters['clients']} clientes, "
            f"{counters['vehicles']} veículos, "
            f"{counters['suppliers']} fornecedores, "
            f"{counters['parts']} peças, "
            f"{counters['services']} serviços, "
            f"{counters['packages']} pacotes e "
            f"{counters['package_items']} itens de pacote processados."
        )
        self.stdout.write(
            "Clientes de teste: " + ", ".join(contact.display_name for contact in clients)
        )

    def seed_workshop_profile(self):
        profile = WorkshopProfile.get_solo()
        profile.legal_name = "Oficina Modelo Prime Ltda"
        profile.trade_name = "Oficina Prime"
        profile.document_number = "45.987.123/0001-76"
        profile.state_registration = "118.221.430.117"
        profile.municipal_registration = "4.778.921-3"
        profile.email = "atendimento@oficinaprime.example.com"
        profile.phone_e164 = "+551132323232"
        profile.secondary_phone_e164 = "+551132323233"
        profile.website = "https://oficinaprime.example.com"
        profile.zip_code = "04266-000"
        profile.address_line = "Rua Vergueiro"
        profile.address_number = "4820"
        profile.address_complement = "Galpão 2"
        profile.district = "Ipiranga"
        profile.city = "São Paulo"
        profile.state = "SP"
        profile.country = "Brasil"
        profile.responsible_name = "André Nascimento"
        profile.print_header_text = "Oficina Prime - manutenção automotiva com transparência"
        profile.print_footer_text = "Dados fictícios para ambiente de testes. Não utilizar em produção."
        profile.estimate_terms = "Orçamento válido por 7 dias. Valores sujeitos à disponibilidade de peças."
        profile.work_order_terms = "Serviços executados mediante aprovação do cliente. Peças substituídas podem ser devolvidas mediante solicitação."
        profile.purchase_order_terms = "Favor confirmar disponibilidade, prazo de entrega e condição de pagamento antes do faturamento."
        profile.bank_info = "Banco 000 - Agência 0001 - Conta 12345-6"
        profile.pix_key = "financeiro@oficinaprime.example.com"
        profile.technical_checklist_enabled = True
        profile.delivery_signature_enabled = True
        profile.landing_headline = "Manutenção automotiva ágil e confiável"
        profile.landing_subheadline = "Agende revisões, diagnósticos e serviços corretivos com acompanhamento por ordem de serviço."
        profile.landing_cta_label = "Solicitar orçamento"
        profile.landing_highlight_text = "Seed demonstrativo para testes do sistema"
        profile.is_active = True
        profile.save()

    def seed_categories(self, category_type, category_specs, counters):
        categories = {}
        for name, code in category_specs:
            category, created = GeneralCategory.objects.update_or_create(
                type=category_type,
                name=name,
                defaults={
                    "code": code,
                    "description": "Categoria criada pela massa de testes realística.",
                    "is_active": True,
                },
            )
            counters["categories"] += int(created)
            categories[name] = category
        return categories

    def seed_clients(self, client_group, counters):
        clients = []
        for data in CLIENTS:
            seed_key = data["seed_key"]
            email = data["email"]
            contact = Contact.objects.filter(custom_data__seed_key=seed_key).first()
            created = False
            if contact is None:
                contact = Contact.objects.filter(email=email).first()
            if contact is None:
                contact = Contact(email=email)
                created = True

            for field in (
                "person_type",
                "first_name",
                "last_name",
                "trade_name",
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
                "notes",
            ):
                setattr(contact, field, data.get(field, ""))
            contact.country = "Brasil"
            contact.is_active = True
            contact.custom_data = merge_custom_data(contact, origem="seed_test_data", seed_key=seed_key, perfil="cliente_demo")
            contact.save()
            contact.groups.add(client_group)
            counters["clients"] += 1
            clients.append(contact)

            vehicle_data = dict(data["vehicle"])
            vehicle_plate = vehicle_data.pop("plate")
            _, vehicle_created = Vehicle.objects.update_or_create(
                plate=vehicle_plate,
                defaults={"customer": contact, "is_active": True, **vehicle_data},
            )
            counters["vehicles"] += 1 if created or vehicle_created else 1

        return clients

    def seed_suppliers(self, counters):
        for data in SUPPLIERS:
            supplier, _created = Supplier.objects.update_or_create(
                name=data["name"],
                defaults={
                    "person_type": Supplier.PersonType.COMPANY,
                    "last_name": "",
                    "country": "Brasil",
                    "address": "",
                    "is_active": True,
                    "custom_data": {"origem": "seed_test_data", "perfil": "fornecedor_demo"},
                    **data,
                },
            )
            supplier.save()
            counters["suppliers"] += 1

    def seed_services(self, categories, counters):
        services = {}
        for code, name, category_name, description, price, hours, is_featured in SERVICES:
            service, _created = WorkshopService.objects.update_or_create(
                code=code,
                defaults={
                    "name": name,
                    "category": categories[category_name],
                    "legacy_category_name": category_name,
                    "description": description,
                    "default_unit_price": D(price),
                    "estimated_hours": D(hours),
                    "is_featured": is_featured,
                    "is_active": True,
                },
            )
            counters["services"] += 1
            services[code] = service
        return services

    def seed_parts(self, categories, counters):
        for sku, name, category_name, brand, unit, cost_price, sale_price, stock_quantity, minimum_stock, location in PARTS:
            Part.objects.update_or_create(
                sku=sku,
                defaults={
                    "name": name,
                    "category": categories[category_name],
                    "brand": brand,
                    "unit": unit,
                    "cost_price": D(cost_price),
                    "sale_price": D(sale_price),
                    "stock_quantity": D(stock_quantity),
                    "minimum_stock": D(minimum_stock),
                    "location": location,
                    "is_featured": sku in {"FIL-OLE-001", "OLE-5W30-001", "PAS-FRE-001", "BAT-60AH-001"},
                    "is_active": True,
                    "notes": "Peça criada pela massa de testes realística.",
                },
            )
            counters["parts"] += 1

    def seed_packages(self, services, counters):
        for package_data in PACKAGES:
            package, _created = ServicePackage.objects.update_or_create(
                code=package_data["code"],
                defaults={
                    "name": package_data["name"],
                    "description": package_data["description"],
                    "discount_amount": D(package_data["discount_amount"]),
                    "is_active": True,
                },
            )
            counters["packages"] += 1

            expected_service_ids = []
            for position, (service_code, quantity) in enumerate(package_data["items"], start=1):
                service = services[service_code]
                expected_service_ids.append(service.id)
                ServicePackageItem.objects.update_or_create(
                    service_package=package,
                    service=service,
                    defaults={
                        "description": service.name,
                        "quantity": D(quantity),
                        "unit_price": service.default_unit_price,
                        "discount_amount": D("0.00"),
                        "position": position,
                    },
                )
                counters["package_items"] += 1

            package.items.exclude(service_id__in=expected_service_ids).delete()
