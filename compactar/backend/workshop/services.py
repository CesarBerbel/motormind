from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from messaging.models import MessageTemplate
from messaging.services import create_and_send

from .models import Part, PartStockMovement, WorkshopProfile, WorkOrder, WorkOrderEvent, WorkOrderMessage, WorkOrderNotificationRule, WorkOrderService
from .state_machine import SOURCE_MANUAL, SOURCE_QUALITY_REWORK, SOURCE_TECHNICAL_COMPLETE, SOURCE_TECHNICAL_START, validate_work_order_transition

ZERO = Decimal("0.00")


def money(value):
    value = value or ZERO
    return f"{value:.2f}"


def contact_context(contact):
    if not contact:
        return {}
    return {
        "id": contact.id,
        "nome": contact.full_name,
        "full_name": contact.full_name,
        "first_name": contact.first_name,
        "last_name": contact.last_name,
        "email": contact.email,
        "telefone": contact.phone_e164,
        "phone_e164": contact.phone_e164,
        "custom_data": contact.custom_data or {},
    }


def vehicle_context(vehicle):
    if not vehicle:
        return {}
    return {
        "id": vehicle.id,
        "placa": vehicle.plate,
        "marca": vehicle.make,
        "modelo": vehicle.model,
        "versao": vehicle.version,
        "ano": vehicle.year,
        "cor": vehicle.color,
        "vin": vehicle.vin,
        "km": vehicle.odometer_km,
        "display": vehicle.display_name,
    }


def work_order_context(work_order):
    order = {
        "id": work_order.id,
        "numero": work_order.number,
        "number": work_order.number,
        "titulo": work_order.title,
        "title": work_order.title,
        "status": work_order.status,
        "status_label": work_order.status_label,
        "prioridade": work_order.priority,
        "priority": work_order.priority,
        "priority_label": work_order.priority_label,
        "reclamacao": work_order.complaint,
        "complaint": work_order.complaint,
        "diagnostico": work_order.diagnosis,
        "diagnosis": work_order.diagnosis,
        "solucao": work_order.solution,
        "solution": work_order.solution,
        "km_entrada": work_order.mileage_in,
        "mileage_in": work_order.mileage_in,
        "previsao": work_order.promised_at,
        "promised_at": work_order.promised_at,
        "total_servicos": money(work_order.subtotal_services),
        "total_pecas": money(work_order.subtotal_parts),
        "desconto_total": money(work_order.discount_total),
        "total": money(work_order.grand_total),
        "pago": money(work_order.paid_total),
        "saldo": money(work_order.balance_due),
        "created_at": work_order.created_at,
        "updated_at": work_order.updated_at,
    }
    vehicle = vehicle_context(work_order.vehicle)
    customer = contact_context(work_order.customer)
    return {
        "ordem": order,
        "os": order,
        "work_order": order,
        "numero_os": work_order.number,
        "status_os": work_order.status_label,
        "total_os": money(work_order.grand_total),
        "saldo_os": money(work_order.balance_due),
        "cliente": customer,
        "customer": customer,
        "nome_cliente": customer.get("nome", ""),
        "email_cliente": customer.get("email", ""),
        "telefone_cliente": customer.get("telefone", ""),
        "veiculo": vehicle,
        "vehicle": vehicle,
        "placa_veiculo": vehicle.get("placa", ""),
        "modelo_veiculo": vehicle.get("modelo", ""),
    }


def record_event(work_order, event_type, actor=None, description="", old_status="", new_status="", data=None):
    return WorkOrderEvent.objects.create(
        work_order=work_order,
        event_type=event_type,
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        description=description,
        old_status=old_status or "",
        new_status=new_status or "",
        data=data or {},
    )


def apply_status_timestamps(work_order):
    now = timezone.now()
    if work_order.status == WorkOrder.Status.APPROVED and not work_order.approved_at:
        work_order.approved_at = now
    if work_order.status == WorkOrder.Status.IN_PROGRESS and not work_order.started_at:
        work_order.started_at = now
    if work_order.status in {WorkOrder.Status.QUALITY_CHECK, WorkOrder.Status.READY} and not work_order.completed_at:
        work_order.completed_at = now
    if work_order.status == WorkOrder.Status.DELIVERED:
        if not work_order.delivered_at:
            work_order.delivered_at = now
        if not work_order.completed_at:
            work_order.completed_at = now
    if work_order.status == WorkOrder.Status.CANCELLED and not work_order.cancelled_at:
        work_order.cancelled_at = now


def _set_work_order_status(locked_order, new_status, actor=None, note="", source=SOURCE_MANUAL, save=True):
    old_status = locked_order.status
    if old_status == new_status:
        return old_status, None
    rule = validate_work_order_transition(locked_order, new_status, actor=actor, note=note, source=source)
    locked_order.status = new_status
    locked_order.updated_by = actor if getattr(actor, "is_authenticated", False) else None
    apply_status_timestamps(locked_order)
    if save:
        locked_order.save()
    return old_status, rule


def adjust_part_stock(part, quantity, movement_type=PartStockMovement.MovementType.ADJUSTMENT, actor=None, notes="", work_order=None, unit_cost=None):
    quantity = Decimal(str(quantity))
    unit_cost = part.cost_price if unit_cost is None else Decimal(str(unit_cost))
    with transaction.atomic():
        locked = Part.objects.select_for_update().get(pk=part.pk)
        locked.stock_quantity = (locked.stock_quantity or ZERO) + quantity
        locked.save(update_fields=["stock_quantity", "updated_at"])
        movement = PartStockMovement.objects.create(
            part=locked,
            movement_type=movement_type,
            quantity=quantity,
            unit_cost=unit_cost,
            work_order=work_order,
            notes=notes,
            actor=actor if getattr(actor, "is_authenticated", False) else None,
        )
    return movement


def consume_parts_inventory(work_order, actor=None):
    consumed = []
    now = timezone.now()
    with transaction.atomic():
        locked_order = WorkOrder.objects.select_for_update().get(pk=work_order.pk)
        if locked_order.inventory_consumed_at:
            return consumed
        lines = locked_order.parts.select_related("part").filter(part__isnull=False, consume_inventory=True, stock_consumed_at__isnull=True)
        for line in lines:
            part = Part.objects.select_for_update().get(pk=line.part_id)
            quantity = line.quantity or ZERO
            if part.stock_quantity < quantity:
                raise ValidationError({"estoque": f"Estoque insuficiente para {part.name}. Disponivel: {part.stock_quantity}, necessario: {quantity}."})
            part.stock_quantity = part.stock_quantity - quantity
            part.save(update_fields=["stock_quantity", "updated_at"])
            movement = PartStockMovement.objects.create(
                part=part,
                movement_type=PartStockMovement.MovementType.CONSUMPTION,
                quantity=-quantity,
                unit_cost=line.cost_price or part.cost_price,
                work_order=locked_order,
                notes=f"Consumo automatico na {locked_order.number}",
                actor=actor if getattr(actor, "is_authenticated", False) else None,
            )
            line.stock_consumed_at = now
            line.stock_movement = movement
            line.save(update_fields=["stock_consumed_at", "stock_movement", "updated_at"])
            consumed.append(movement.id)
        locked_order.inventory_consumed_at = now
        locked_order.save(update_fields=["inventory_consumed_at", "updated_at"])
    record_event(work_order, WorkOrderEvent.EventType.INVENTORY_CONSUMED, actor=actor, description="Baixa automatica de pecas da ordem de servico.", data={"stock_movement_ids": consumed})
    return consumed



def _service_duration_minutes(service_line, finished_at):
    if not service_line.started_at:
        return service_line.actual_minutes or 0
    seconds = max((finished_at - service_line.started_at).total_seconds(), 0)
    return int(seconds // 60)


def _all_active_services_done(work_order):
    return not work_order.services.exclude(status__in=[WorkOrderService.Status.DONE, WorkOrderService.Status.CANCELLED]).exists()


def _technical_actor_allowed(service_line, actor):
    if not getattr(actor, "is_authenticated", False):
        return False
    from accounts.roles import ROLE_TECHNICIAN
    from accounts.services import get_user_role, user_has_permission

    if user_has_permission(actor, "*"):
        return True
    if user_has_permission(actor, "technical.execute") and get_user_role(actor) != ROLE_TECHNICIAN:
        return True
    if get_user_role(actor) != ROLE_TECHNICIAN:
        return False
    return service_line.technician_id in {None, actor.id} or service_line.work_order.assigned_to_id == actor.id


def start_work_order_service(service_line, actor=None, note=""):
    if not _technical_actor_allowed(service_line, actor):
        raise ValidationError({"permissao": "Você só pode iniciar serviços atribuídos a você ou à OS sob sua responsabilidade."})
    if service_line.status in {WorkOrderService.Status.DONE, WorkOrderService.Status.CANCELLED}:
        raise ValidationError({"status": "Serviço concluído ou cancelado não pode ser iniciado."})
    now = timezone.now()
    with transaction.atomic():
        locked = WorkOrderService.objects.select_for_update().select_related("work_order", "technician").get(pk=service_line.pk)
        if not locked.technician_id and getattr(actor, "is_authenticated", False):
            locked.technician = actor
        if not locked.started_at:
            locked.started_at = now
        locked.status = WorkOrderService.Status.IN_PROGRESS
        if note:
            locked.notes = f"{locked.notes}\n{note}".strip() if locked.notes else note
        locked.save(update_fields=["technician", "started_at", "status", "notes", "updated_at"])
        order = locked.work_order
        previous_status = order.status
        if order.status != WorkOrder.Status.IN_PROGRESS:
            _set_work_order_status(order, WorkOrder.Status.IN_PROGRESS, actor=actor, note="OS colocada em execução pelo início de um serviço técnico.", source=SOURCE_TECHNICAL_START, save=True)
            record_event(order, WorkOrderEvent.EventType.STATUS_CHANGED, actor=actor, description="OS colocada em execução pelo início de um serviço técnico.", old_status=previous_status, new_status=order.status)
        record_event(order, WorkOrderEvent.EventType.SERVICE_STARTED, actor=actor, description=f"Serviço iniciado: {locked.description}.", data={"work_order_service_id": locked.id, "note": note})
    locked.refresh_from_db()
    return locked


def complete_work_order_service(service_line, actor=None, technical_diagnosis="", execution_notes="", checklist=None, mark_order_quality_check=True):
    if not _technical_actor_allowed(service_line, actor):
        raise ValidationError({"permissao": "Você só pode concluir serviços atribuídos a você ou à OS sob sua responsabilidade."})
    if service_line.status == WorkOrderService.Status.CANCELLED:
        raise ValidationError({"status": "Serviço cancelado não pode ser concluído."})
    if not execution_notes:
        raise ValidationError({"execution_notes": "Informe o que foi executado antes de concluir o serviço."})
    now = timezone.now()
    checklist = checklist or {}
    with transaction.atomic():
        locked = WorkOrderService.objects.select_for_update().select_related("work_order", "technician").get(pk=service_line.pk)
        if not locked.technician_id and getattr(actor, "is_authenticated", False):
            locked.technician = actor
        if not locked.started_at:
            locked.started_at = now
        profile = WorkshopProfile.get_solo()
        if profile.technical_checklist_enabled:
            if not locked.checklist_items.exists():
                locked.create_checklist_from_template()
            pending_items = [item.description for item in locked.checklist_items.all() if item.is_blocking_pending]
            if pending_items:
                raise ValidationError({"checklist": "Conclua todos os itens obrigatórios do checklist técnico antes de finalizar o serviço: " + "; ".join(pending_items)})
        locked.finished_at = now
        locked.status = WorkOrderService.Status.DONE
        locked.technical_diagnosis = technical_diagnosis or locked.technical_diagnosis
        locked.execution_notes = execution_notes
        locked.checklist = checklist
        locked.actual_minutes = _service_duration_minutes(locked, now)
        locked.save(update_fields=["technician", "started_at", "finished_at", "status", "technical_diagnosis", "execution_notes", "checklist", "actual_minutes", "updated_at"])
        order = locked.work_order
        record_event(order, WorkOrderEvent.EventType.SERVICE_FINISHED, actor=actor, description=f"Serviço concluído: {locked.description}.", data={"work_order_service_id": locked.id, "actual_minutes": locked.actual_minutes, "checklist": checklist})
        if mark_order_quality_check and _all_active_services_done(order) and order.status not in {WorkOrder.Status.READY, WorkOrder.Status.DELIVERED, WorkOrder.Status.CANCELLED}:
            old_status = order.status
            _set_work_order_status(order, WorkOrder.Status.QUALITY_CHECK, actor=actor, note="Todos os serviços técnicos foram concluídos. OS enviada para conferência.", source=SOURCE_TECHNICAL_COMPLETE, save=True)
            record_event(order, WorkOrderEvent.EventType.STATUS_CHANGED, actor=actor, description="Todos os serviços técnicos foram concluídos. OS enviada para conferência.", old_status=old_status, new_status=order.status)
    locked.refresh_from_db()
    return locked


def quality_check_work_order_service(service_line, actor=None, approved=True, notes=""):
    from accounts.services import user_has_permission

    if not user_has_permission(actor, ["work_orders.edit", "technical.quality_check"]):
        raise ValidationError({"permissao": "Você não tem permissão para conferir serviços técnicos."})
    now = timezone.now()
    with transaction.atomic():
        locked = WorkOrderService.objects.select_for_update().select_related("work_order").get(pk=service_line.pk)
        if approved:
            locked.quality_checked_at = now
            locked.quality_checked_by = actor if getattr(actor, "is_authenticated", False) else None
            locked.quality_check_notes = notes
            locked.save(update_fields=["quality_checked_at", "quality_checked_by", "quality_check_notes", "updated_at"])
            description = f"Serviço conferido e aprovado: {locked.description}."
        else:
            locked.status = WorkOrderService.Status.IN_PROGRESS
            locked.finished_at = None
            locked.quality_checked_at = None
            locked.quality_checked_by = None
            locked.quality_check_notes = notes
            locked.save(update_fields=["status", "finished_at", "quality_checked_at", "quality_checked_by", "quality_check_notes", "updated_at"])
            description = f"Serviço reprovado na conferência e devolvido ao técnico: {locked.description}."
            order = locked.work_order
            if order.status == WorkOrder.Status.QUALITY_CHECK:
                old_status = order.status
                _set_work_order_status(order, WorkOrder.Status.IN_PROGRESS, actor=actor, note=notes or "Serviço reprovado na conferência e devolvido ao técnico.", source=SOURCE_QUALITY_REWORK, save=True)
                record_event(order, WorkOrderEvent.EventType.STATUS_CHANGED, actor=actor, description="OS devolvida para execução por reprovação na conferência.", old_status=old_status, new_status=order.status)
        record_event(locked.work_order, WorkOrderEvent.EventType.SERVICE_QUALITY_CHECKED, actor=actor, description=description, data={"work_order_service_id": locked.id, "approved": approved, "notes": notes})
    locked.refresh_from_db()
    return locked

def send_work_order_message(work_order, template, actor=None, trigger_type=WorkOrderMessage.TriggerType.MANUAL, notification_rule=None):
    if template.channel == MessageTemplate.Channel.EMAIL and not work_order.customer.email:
        raise ValidationError({"cliente": "Cliente sem email cadastrado."})
    if template.channel == MessageTemplate.Channel.WHATSAPP and not work_order.customer.phone_e164:
        raise ValidationError({"cliente": "Cliente sem WhatsApp em formato E.164."})
    log = create_and_send(template=template, actor=actor, contact=work_order.customer, extra=work_order_context(work_order), send_now=True)
    relation = WorkOrderMessage.objects.create(
        work_order=work_order,
        trigger_type=trigger_type,
        trigger_status=work_order.status if trigger_type == WorkOrderMessage.TriggerType.STATUS_AUTO else "",
        channel=template.channel,
        template=template,
        notification_rule=notification_rule,
        message_log=log,
        status=log.status,
        error_message=log.error_message,
        created_by=actor if getattr(actor, "is_authenticated", False) else None,
    )
    record_event(work_order, WorkOrderEvent.EventType.MESSAGE_SENT, actor=actor, description=f"Mensagem {template.channel} enviada pelo template {template.name}.", data={"message_log_id": log.id, "work_order_message_id": relation.id, "status": log.status})
    return relation


def trigger_status_notifications(work_order, actor=None):
    sent = []
    rules = WorkOrderNotificationRule.objects.select_related("template").filter(is_active=True, trigger_status=work_order.status)
    for rule in rules:
        if rule.template.channel != rule.channel:
            record_event(work_order, WorkOrderEvent.EventType.ERROR, actor=actor, description=f"Regra {rule.name} ignorada: canal da regra diferente do canal do template.")
            continue
        if rule.send_once_per_status and WorkOrderMessage.objects.filter(work_order=work_order, notification_rule=rule, trigger_status=work_order.status).exists():
            continue
        try:
            relation = send_work_order_message(work_order, rule.template, actor=actor, trigger_type=WorkOrderMessage.TriggerType.STATUS_AUTO, notification_rule=rule)
            sent.append(relation.id)
        except Exception as exc:
            record_event(work_order, WorkOrderEvent.EventType.ERROR, actor=actor, description=f"Erro ao enviar notificacao automatica {rule.name}: {exc}")
    return sent


def change_work_order_status(work_order, new_status, actor=None, note="", send_notifications=True, source=SOURCE_MANUAL):
    old_status = work_order.status
    if old_status == new_status:
        return work_order, []
    with transaction.atomic():
        locked = WorkOrder.objects.select_for_update().get(pk=work_order.pk)
        old_status = locked.status
        _set_work_order_status(locked, new_status, actor=actor, note=note, source=source, save=True)
        if locked.status in {WorkOrder.Status.APPROVED, WorkOrder.Status.IN_PROGRESS, WorkOrder.Status.DELIVERED}:
            consume_parts_inventory(locked, actor=actor)
        record_event(locked, WorkOrderEvent.EventType.STATUS_CHANGED, actor=actor, description=note or f"Status alterado para {locked.status_label}.", old_status=old_status, new_status=locked.status)
    locked.refresh_from_db()
    if locked.status == WorkOrder.Status.DELIVERED:
        from finance.services import ensure_receivable_for_work_order

        ensure_receivable_for_work_order(locked, actor=actor)
        locked.refresh_from_db()
    sent = trigger_status_notifications(locked, actor=actor) if send_notifications else []
    return locked, sent
