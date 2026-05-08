from decimal import Decimal
from io import BytesIO

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .models import WorkshopProfile, WorkOrder, WorkOrderCustomerApproval

ZERO = Decimal("0.00")
DOCUMENT_TITLES = {
    WorkOrderCustomerApproval.DocumentType.ESTIMATE: "ORÇAMENTO",
    WorkOrderCustomerApproval.DocumentType.WORK_ORDER: "ORDEM DE SERVIÇO",
    WorkOrderCustomerApproval.DocumentType.RECEIPT: "RECIBO",
    "delivery_receipt": "COMPROVANTE DE ENTREGA",
}


def format_money(value):
    value = Decimal(value or ZERO)
    return f"R$ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def format_date(value):
    if not value:
        return "-"
    if hasattr(value, "astimezone"):
        value = timezone.localtime(value)
        return value.strftime("%d/%m/%Y %H:%M")
    return value.strftime("%d/%m/%Y")


def safe_text(value):
    return str(value or "").replace("\n", "<br/>")


def _doc_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="DocTitle", parent=styles["Title"], alignment=TA_CENTER, fontSize=16, leading=20, spaceAfter=8))
    styles.add(ParagraphStyle(name="SectionTitle", parent=styles["Heading2"], fontSize=11, leading=14, spaceBefore=8, spaceAfter=6, textColor=colors.HexColor("#1f2937")))
    styles.add(ParagraphStyle(name="Small", parent=styles["BodyText"], fontSize=8, leading=10))
    styles.add(ParagraphStyle(name="SmallRight", parent=styles["Small"], alignment=TA_RIGHT))
    styles.add(ParagraphStyle(name="CenterSmall", parent=styles["Small"], alignment=TA_CENTER))
    return styles


def _make_table(rows, widths=None, header=True):
    table = Table(rows, colWidths=widths, hAlign="LEFT", repeatRows=1 if header else 0)
    style = [
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d1d5db")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold" if header else "Helvetica"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6") if header else colors.white),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    table.setStyle(TableStyle(style))
    return table


def _header(story, work_order, document_type, styles):
    profile = WorkshopProfile.get_solo()
    title = DOCUMENT_TITLES.get(document_type, "DOCUMENTO")
    story.append(Paragraph(title, styles["DocTitle"]))
    header_rows = [
        [Paragraph(f"<b>{safe_text(profile.display_name)}</b><br/>{safe_text(profile.legal_name)}", styles["BodyText"]), Paragraph(f"<b>Número:</b> {work_order.number}<br/><b>Emitido em:</b> {format_date(timezone.now())}", styles["SmallRight"])],
        [Paragraph(f"<b>Documento:</b> {safe_text(profile.document_number) or '-'}<br/><b>Contato:</b> {safe_text(profile.phone_e164) or '-'} | {safe_text(profile.email) or '-'}", styles["Small"]), Paragraph(f"<b>Endereço:</b><br/>{safe_text(profile.address_display) or '-'}", styles["SmallRight"])],
    ]
    story.append(_make_table(header_rows, [110 * mm, 70 * mm], header=False))
    if profile.print_header_text:
        story.append(Spacer(1, 3 * mm))
        story.append(Paragraph(safe_text(profile.print_header_text), styles["Small"]))
    story.append(Spacer(1, 5 * mm))


def _customer_vehicle_section(story, work_order, styles):
    customer = work_order.customer
    vehicle = work_order.vehicle
    rows = [
        [Paragraph("<b>Cliente</b>", styles["Small"]), Paragraph("<b>Veículo</b>", styles["Small"])],
        [
            Paragraph(f"{safe_text(customer.display_name)}<br/>CPF/CNPJ: {safe_text(customer.document_number) or '-'}<br/>Email: {safe_text(customer.email) or '-'}<br/>Telefone: {safe_text(customer.phone_e164) or '-'}<br/>Endereço: {safe_text(customer.address_display) or '-'}", styles["Small"]),
            Paragraph((f"{safe_text(vehicle.display_name)}<br/>Placa: {safe_text(vehicle.plate) or '-'}<br/>Ano: {safe_text(vehicle.year) or '-'}<br/>Cor: {safe_text(vehicle.color) or '-'}<br/>KM entrada: {work_order.mileage_in or 0}" if vehicle else "Sem veículo vinculado"), styles["Small"]),
        ],
    ]
    story.append(_make_table(rows, [90 * mm, 90 * mm], header=True))


def _order_notes(story, work_order, styles):
    story.append(Paragraph("Dados da OS", styles["SectionTitle"]))
    rows = [
        ["Status", work_order.status_label, "Prioridade", work_order.priority_label],
        ["Abertura", format_date(work_order.opened_at), "Previsão", format_date(work_order.promised_at)],
        ["Relato", Paragraph(safe_text(work_order.complaint) or "-", styles["Small"]), "Diagnóstico", Paragraph(safe_text(work_order.diagnosis) or "-", styles["Small"])],
        ["Solução", Paragraph(safe_text(work_order.solution) or "-", styles["Small"]), "Observações ao cliente", Paragraph(safe_text(work_order.customer_notes) or "-", styles["Small"])],
    ]
    story.append(_make_table(rows, [25 * mm, 65 * mm, 30 * mm, 60 * mm], header=False))


def _services(story, work_order, styles):
    story.append(Paragraph("Serviços", styles["SectionTitle"]))
    rows = [["Descrição", "Qtd.", "Unitário", "Desc.", "Total"]]
    for line in work_order.services.all():
        rows.append([Paragraph(safe_text(line.description), styles["Small"]), str(line.quantity), format_money(line.unit_price), format_money(line.discount_amount), format_money(line.total_amount)])
    if len(rows) == 1:
        rows.append(["Nenhum serviço lançado", "", "", "", ""])
    story.append(_make_table(rows, [92 * mm, 18 * mm, 25 * mm, 20 * mm, 25 * mm], header=True))


def _parts(story, work_order, styles):
    story.append(Paragraph("Peças", styles["SectionTitle"]))
    rows = [["Código", "Descrição", "Qtd.", "Unitário", "Desc.", "Total"]]
    for line in work_order.parts.all():
        rows.append([line.part.sku if line.part else "-", Paragraph(safe_text(line.description), styles["Small"]), str(line.quantity), format_money(line.unit_price), format_money(line.discount_amount), format_money(line.total_amount)])
    if len(rows) == 1:
        rows.append(["-", "Nenhuma peça lançada", "", "", "", ""])
    story.append(_make_table(rows, [25 * mm, 72 * mm, 16 * mm, 25 * mm, 20 * mm, 22 * mm], header=True))


def _checklist(story, work_order, styles):
    items = work_order.technical_checklist_items.select_related("work_order_service", "completed_by").all()
    if not items:
        return
    story.append(Paragraph("Checklist técnico", styles["SectionTitle"]))
    rows = [["Serviço", "Item", "Obrig.", "Concluído", "Observação"]]
    for item in items:
        rows.append([
            Paragraph(safe_text(item.work_order_service.description), styles["Small"]),
            Paragraph(safe_text(item.description), styles["Small"]),
            "Sim" if item.is_required else "Não",
            format_date(item.completed_at) if item.is_completed else "Pendente",
            Paragraph(safe_text(item.note) or "-", styles["Small"]),
        ])
    story.append(_make_table(rows, [45 * mm, 58 * mm, 15 * mm, 30 * mm, 32 * mm], header=True))


def _delivery_signature(story, work_order, styles):
    signature = getattr(work_order, "delivery_signature", None)
    if not signature:
        return
    story.append(Paragraph("Assinatura digital de entrega", styles["SectionTitle"]))
    rows = [
        ["Recebido por", safe_text(signature.recipient_name), "Documento", safe_text(signature.recipient_document) or "-"],
        ["Assinado em", format_date(signature.signed_at), "Registrado por", safe_text(signature.signed_by_name) or "Sistema"],
        ["Observações", Paragraph(safe_text(signature.notes) or "-", styles["Small"]), "IP", safe_text(signature.signed_ip) or "-"],
    ]
    story.append(_make_table(rows, [30 * mm, 70 * mm, 30 * mm, 50 * mm], header=False))
    try:
        story.append(Spacer(1, 4 * mm))
        img = Image(signature.signature_image.path, width=70 * mm, height=28 * mm, kind="proportional")
        story.append(img)
    except Exception:
        story.append(Paragraph("Imagem da assinatura indisponível para impressão.", styles["Small"]))


def _payments(story, work_order, styles):
    story.append(Paragraph("Pagamentos", styles["SectionTitle"]))
    rows = [["Data", "Forma", "Referência", "Valor"]]
    for payment in work_order.payments.all():
        rows.append([format_date(payment.paid_at), payment.get_method_display(), safe_text(payment.reference) or "-", format_money(payment.amount)])
    if len(rows) == 1:
        rows.append(["-", "Nenhum pagamento registrado", "", ""])
    story.append(_make_table(rows, [35 * mm, 45 * mm, 70 * mm, 30 * mm], header=True))


def _totals(story, work_order, styles):
    rows = [
        ["Subtotal serviços", format_money(work_order.subtotal_services)],
        ["Subtotal peças", format_money(work_order.subtotal_parts)],
        ["Descontos", format_money(work_order.discount_total)],
        ["Total", format_money(work_order.grand_total)],
        ["Pago", format_money(work_order.paid_total)],
        ["Saldo", format_money(work_order.balance_due)],
    ]
    table = _make_table(rows, [130 * mm, 50 * mm], header=False)
    table.setStyle(TableStyle([("ALIGN", (1, 0), (1, -1), "RIGHT"), ("FONTNAME", (0, 3), (-1, 3), "Helvetica-Bold"), ("BACKGROUND", (0, 3), (-1, 3), colors.HexColor("#f9fafb"))]))
    story.append(Paragraph("Resumo financeiro", styles["SectionTitle"]))
    story.append(table)


def _terms(story, document_type, styles):
    profile = WorkshopProfile.get_solo()
    terms = profile.estimate_terms if document_type == WorkOrderCustomerApproval.DocumentType.ESTIMATE else profile.work_order_terms
    if document_type == WorkOrderCustomerApproval.DocumentType.RECEIPT:
        terms = profile.print_footer_text or profile.work_order_terms
    if terms:
        story.append(Paragraph("Condições", styles["SectionTitle"]))
        story.append(Paragraph(safe_text(terms), styles["Small"]))
    if profile.bank_info or profile.pix_key:
        story.append(Paragraph("Dados de pagamento", styles["SectionTitle"]))
        story.append(Paragraph(f"{safe_text(profile.bank_info)}<br/><b>Pix:</b> {safe_text(profile.pix_key) or '-'}", styles["Small"]))


def _signatures(story, work_order, styles):
    story.append(Spacer(1, 12 * mm))
    rows = [
        ["________________________________________", "________________________________________"],
        ["Assinatura do cliente", "Assinatura da oficina/técnico"],
        [work_order.customer.full_name, WorkshopProfile.get_solo().responsible_name or WorkshopProfile.get_solo().display_name],
    ]
    story.append(_make_table(rows, [90 * mm, 90 * mm], header=False))


def generate_work_order_pdf(work_order: WorkOrder, document_type="work_order") -> bytes:
    allowed_types = set(dict(WorkOrderCustomerApproval.DocumentType.choices)) | {"delivery_receipt"}
    if document_type not in allowed_types:
        document_type = WorkOrderCustomerApproval.DocumentType.WORK_ORDER
    work_order.recalculate_totals(save=False)
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=15 * mm, leftMargin=15 * mm, topMargin=12 * mm, bottomMargin=12 * mm, title=f"{DOCUMENT_TITLES.get(document_type)} {work_order.number}")
    styles = _doc_styles()
    story = []
    _header(story, work_order, document_type, styles)
    _customer_vehicle_section(story, work_order, styles)
    _order_notes(story, work_order, styles)
    _services(story, work_order, styles)
    _parts(story, work_order, styles)
    if document_type in {WorkOrderCustomerApproval.DocumentType.WORK_ORDER, "delivery_receipt"}:
        _checklist(story, work_order, styles)
    if document_type in {WorkOrderCustomerApproval.DocumentType.RECEIPT, "delivery_receipt"}:
        _payments(story, work_order, styles)
    _totals(story, work_order, styles)
    _terms(story, document_type, styles)
    if document_type == "delivery_receipt":
        _delivery_signature(story, work_order, styles)
    _signatures(story, work_order, styles)
    doc.build(story)
    return buffer.getvalue()
