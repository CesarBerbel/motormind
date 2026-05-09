from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from messaging.models import MessageTemplate
from messaging.services import create_and_send

from accounts.roles import ROLE_TECHNICIAN
from accounts.services import get_user_role, user_has_permission

from .models import Part, PartStockMovement, WorkshopProfile, WorkOrder, WorkOrderCustomerApproval, WorkOrderEvent, WorkOrderMessage, WorkOrderNotificationRule, WorkOrderService
from .state_machine import SOURCE_MANUAL, SOURCE_QUALITY_REWORK, SOURCE_TECHNICAL_COMPLETE, SOURCE_TECHNICAL_START, SOURCE_TECHNICAL_WAITING_PARTS, validate_work_order_transition

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



def workshop_context(profile):
    if not profile:
        return {}
    return {
        "id": profile.id,
        "nome": profile.display_name,
        "display_name": profile.display_name,
        "legal_name": profile.legal_name,
        "trade_name": profile.trade_name,
        "documento": profile.document_number,
        "document_number": profile.document_number,
        "email": profile.email,
        "telefone": profile.phone_e164,
        "phone_e164": profile.phone_e164,
        "endereco": profile.address_display,
        "address_display": profile.address_display,
    }

def work_order_context(work_order, actor=None, include_approval=False):
    approval_url = ""
    approval = None
    if include_approval or work_order.status == WorkOrder.Status.AWAITING_APPROVAL:
        approval = ensure_pending_customer_approval(work_order, actor=actor)
        approval_url = build_customer_approval_url(approval)
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
    workshop = workshop_context(WorkshopProfile.get_solo())
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
        "oficina": workshop,
        "workshop": workshop,
        "nome_oficina": workshop.get("nome", ""),
        "email_oficina": workshop.get("email", ""),
        "telefone_oficina": workshop.get("telefone", ""),
        "nome_cliente": customer.get("nome", ""),
        "email_cliente": customer.get("email", ""),
        "telefone_cliente": customer.get("telefone", ""),
        "veiculo": vehicle,
        "vehicle": vehicle,
        "placa_veiculo": vehicle.get("placa", ""),
        "modelo_veiculo": vehicle.get("modelo", ""),
        "approval_url": approval_url,
        "aprovacao_url": approval_url,
        "approval": approval,
        "aprovacao": approval,
    }



def build_customer_approval_url(approval):
    base_url = getattr(settings, "FRONTEND_BASE_URL", "") or "http://localhost:5173"
    return f"{str(base_url).rstrip('/')}{approval.public_url_path}"


def ensure_pending_customer_approval(work_order, actor=None, expires_days=7):
    approval = (
        WorkOrderCustomerApproval.objects
        .filter(
            work_order=work_order,
            document_type=WorkOrderCustomerApproval.DocumentType.ESTIMATE,
            status=WorkOrderCustomerApproval.Status.PENDING,
            is_active=True,
        )
        .order_by("-requested_at", "-id")
        .first()
    )
    if approval:
        return approval
    return WorkOrderCustomerApproval.objects.create(
        work_order=work_order,
        document_type=WorkOrderCustomerApproval.DocumentType.ESTIMATE,
        requested_by=actor if getattr(actor, "is_authenticated", False) else None,
        expires_at=timezone.now() + timezone.timedelta(days=expires_days),
    )

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
        start_target = TECHNICAL_START_TARGETS.get(order.status)
        if start_target and order.status != start_target:
            description = "OS colocada em diagnóstico pelo início do serviço técnico." if start_target == WorkOrder.Status.DIAGNOSIS else "OS colocada em execução pelo início de um serviço técnico."
            _set_work_order_status(order, start_target, actor=actor, note=description, source=SOURCE_TECHNICAL_START, save=True)
            record_event(order, WorkOrderEvent.EventType.STATUS_CHANGED, actor=actor, description=description, old_status=previous_status, new_status=order.status)
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
        if mark_order_quality_check and _all_active_services_done(order) and order.status not in {WorkOrder.Status.AWAITING_APPROVAL, WorkOrder.Status.QUALITY_CHECK, WorkOrder.Status.READY, WorkOrder.Status.DELIVERED, WorkOrder.Status.CANCELLED}:
            old_status = order.status
            complete_target = TECHNICAL_COMPLETE_TARGETS.get(order.status)
            if complete_target:
                description = "Diagnóstico concluído. OS enviada para aprovação do cliente." if complete_target == WorkOrder.Status.AWAITING_APPROVAL else "Todos os serviços técnicos foram concluídos. OS enviada para conferência."
                _set_work_order_status(order, complete_target, actor=actor, note=description, source=SOURCE_TECHNICAL_COMPLETE, save=True)
                record_event(order, WorkOrderEvent.EventType.STATUS_CHANGED, actor=actor, description=description, old_status=old_status, new_status=order.status)
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

def _notification_targets(rule):
    target = getattr(rule, "recipient_target", WorkOrderNotificationRule.RecipientTarget.CUSTOMER) if rule else WorkOrderNotificationRule.RecipientTarget.CUSTOMER
    if target == WorkOrderNotificationRule.RecipientTarget.BOTH:
        return [WorkOrderNotificationRule.RecipientTarget.CUSTOMER, WorkOrderNotificationRule.RecipientTarget.WORKSHOP]
    return [target]


def _recipient_kwargs_for_work_order(work_order, template, target):
    if target == WorkOrderNotificationRule.RecipientTarget.WORKSHOP:
        profile = WorkshopProfile.get_solo()
        if template.channel == MessageTemplate.Channel.EMAIL:
            if not profile.email:
                raise ValidationError({"oficina": "Oficina sem e-mail cadastrado no admin."})
            return {"contact": None, "raw_email": profile.email, "raw_phone": ""}
        if not profile.phone_e164:
            raise ValidationError({"oficina": "Oficina sem WhatsApp cadastrado no admin."})
        return {"contact": None, "raw_email": "", "raw_phone": profile.phone_e164}

    if template.channel == MessageTemplate.Channel.EMAIL:
        if not work_order.customer.email:
            raise ValidationError({"cliente": "Cliente sem email cadastrado."})
        return {"contact": work_order.customer, "raw_email": "", "raw_phone": ""}
    if not work_order.customer.phone_e164:
        raise ValidationError({"cliente": "Cliente sem WhatsApp em formato E.164."})
    return {"contact": work_order.customer, "raw_email": "", "raw_phone": ""}


def send_work_order_message(work_order, template, actor=None, trigger_type=WorkOrderMessage.TriggerType.MANUAL, notification_rule=None, recipient_target=None):
    targets = [recipient_target] if recipient_target else _notification_targets(notification_rule)
    created_relations = []
    for target in targets:
        kwargs = _recipient_kwargs_for_work_order(work_order, template, target)
        log = create_and_send(
            template=template,
            actor=actor,
            extra=work_order_context(work_order, actor=actor, include_approval=(work_order.status == WorkOrder.Status.AWAITING_APPROVAL)),
            send_now=True,
            **kwargs,
        )
        relation = WorkOrderMessage.objects.create(
            work_order=work_order,
            trigger_type=trigger_type,
            trigger_status=work_order.status if trigger_type == WorkOrderMessage.TriggerType.STATUS_AUTO else "",
            channel=template.channel,
            recipient_target=target or "",
            template=template,
            notification_rule=notification_rule,
            message_log=log,
            status=log.status,
            error_message=log.error_message,
            created_by=actor if getattr(actor, "is_authenticated", False) else None,
        )
        event_type = WorkOrderEvent.EventType.MESSAGE_SENT if log.status == "sent" else WorkOrderEvent.EventType.ERROR
        status_label = "enviada" if log.status == "sent" else ("simulada/ignorada" if log.status == "skipped" else "falhou")
        record_event(
            work_order,
            event_type,
            actor=actor,
            description=(
                f"Mensagem {template.channel} {status_label} pelo template {template.name} "
                f"para {dict(WorkOrderNotificationRule.RecipientTarget.choices).get(target, target)}."
                + (f" Detalhe: {log.error_message}" if log.error_message else "")
            ),
            data={"message_log_id": log.id, "work_order_message_id": relation.id, "status": log.status, "recipient_target": target, "error_message": log.error_message},
        )
        created_relations.append(relation)
    return created_relations[0] if len(created_relations) == 1 else created_relations


def _create_failed_work_order_message(work_order, rule, actor, error_message):
    """Registra falha de notificacao automatica na tabela de mensagens e no historico da OS."""
    relation = WorkOrderMessage.objects.create(
        work_order=work_order,
        trigger_type=WorkOrderMessage.TriggerType.STATUS_AUTO,
        trigger_status=work_order.status,
        channel=getattr(rule, "channel", "") or getattr(getattr(rule, "template", None), "channel", ""),
        recipient_target=getattr(rule, "recipient_target", "") or "",
        template=getattr(rule, "template", None),
        notification_rule=rule,
        status="failed",
        error_message=str(error_message),
        created_by=actor if getattr(actor, "is_authenticated", False) else None,
    )
    record_event(
        work_order,
        WorkOrderEvent.EventType.ERROR,
        actor=actor,
        description=f"Notificacao automatica {getattr(rule, 'name', '')} falhou: {error_message}",
        data={"work_order_message_id": relation.id, "status": "failed", "error_message": str(error_message)},
    )
    return relation


def trigger_status_notifications(work_order, actor=None):
    """Dispara as notificacoes automaticas do status atual da OS.

    Esta funcao imprime e registra cada etapa. Se uma regra for encontrada, ela
    sempre gera um WorkOrderMessage: sent/failed. Assim a tela de historico de
    mensagens mostra exatamente por que nao saiu email/WhatsApp.
    """
    sent = []
    print(
        "\n"
        "================ MENSAGERIA - GATILHO AUTOMATICO DE OS ================\n"
        f"OS: {work_order.number} | ID: {work_order.pk}\n"
        f"Status atual: {work_order.status_label} ({work_order.status})\n"
        "Buscando regras ativas para este status...\n"
        "======================================================================\n",
        flush=True,
    )
    rules = list(
        WorkOrderNotificationRule.objects.select_related("template").filter(
            is_active=True,
            trigger_status=work_order.status,
        )
    )
    print(f"[MENSAGERIA AUTO] Regras encontradas para {work_order.status}: {len(rules)}", flush=True)
    if not rules:
        detail = f"Nenhuma notificacao automatica ativa configurada para o status {work_order.status_label} ({work_order.status})."
        print(f"[MENSAGERIA AUTO] {detail}", flush=True)
        record_event(work_order, WorkOrderEvent.EventType.ERROR, actor=actor, description=detail)
        return sent

    for rule in rules:
        template = getattr(rule, "template", None)
        print(
            f"[MENSAGERIA AUTO] Regra ID={rule.id} | nome='{rule.name}' | ativa={rule.is_active} | "
            f"status={rule.trigger_status} | canal_regra={rule.channel} | "
            f"template_id={getattr(template, 'id', None)} | template='{getattr(template, 'name', '')}' | "
            f"canal_template={getattr(template, 'channel', '')} | template_ativo={getattr(template, 'is_active', None)} | "
            f"destinatario={getattr(rule, 'recipient_target', '')} | enviar_uma_vez={rule.send_once_per_status}",
            flush=True,
        )
        if not template:
            relation = _create_failed_work_order_message(work_order, rule, actor, "Template removido ou nao encontrado.")
            sent.append(relation.id)
            print(f"[MENSAGERIA AUTO] Regra '{rule.name}' falhou: template ausente.", flush=True)
            continue
        if not template.is_active:
            relation = _create_failed_work_order_message(work_order, rule, actor, "Template inativo.")
            sent.append(relation.id)
            print(f"[MENSAGERIA AUTO] Regra '{rule.name}' falhou: template inativo.", flush=True)
            continue
        if template.channel != rule.channel:
            # Antes esta divergencia ignorava a regra. Na pratica isso escondia o erro e impedia o envio.
            # Agora o envio segue pelo canal do template e o ajuste fica registrado para auditoria.
            warning = (
                f"Regra {rule.name} tem canal {rule.channel}, mas o template {template.name} e do canal {template.channel}. "
                f"O envio automatico seguira pelo canal do template."
            )
            print(f"[MENSAGERIA AUTO] AVISO: {warning}", flush=True)
            record_event(work_order, WorkOrderEvent.EventType.UPDATED, actor=actor, description=warning)
        if rule.send_once_per_status:
            already_sent = WorkOrderMessage.objects.filter(
                work_order=work_order,
                notification_rule=rule,
                trigger_status=work_order.status,
                message_log__status="sent",
            ).exists()
            if already_sent:
                detail = f"Regra {rule.name} nao reenviada: ja existe envio automatico com sucesso para este status."
                print(f"[MENSAGERIA AUTO] {detail}", flush=True)
                record_event(work_order, WorkOrderEvent.EventType.UPDATED, actor=actor, description=detail)
                continue
        try:
            print(
                f"[MENSAGERIA AUTO] Executando regra '{rule.name}' | canal_template={template.channel} | "
                f"destinatario={getattr(rule, 'recipient_target', '')}",
                flush=True,
            )
            relation = send_work_order_message(
                work_order,
                template,
                actor=actor,
                trigger_type=WorkOrderMessage.TriggerType.STATUS_AUTO,
                notification_rule=rule,
            )
            relations = relation if isinstance(relation, list) else [relation]
            sent.extend(item.id for item in relations)
            print(
                f"[MENSAGERIA AUTO] Regra '{rule.name}' gerou WorkOrderMessage IDs/status: "
                f"{[(item.id, item.status, item.error_message) for item in relations]}",
                flush=True,
            )
        except Exception as exc:
            relation = _create_failed_work_order_message(work_order, rule, actor, exc)
            sent.append(relation.id)
            print(f"[MENSAGERIA AUTO] ERRO na regra '{rule.name}': {exc}", flush=True)
    return sent


TECHNICAL_START_TARGETS = {
    WorkOrder.Status.OPEN: WorkOrder.Status.DIAGNOSIS,
    WorkOrder.Status.APPROVED: WorkOrder.Status.IN_PROGRESS,
    WorkOrder.Status.WAITING_PARTS: WorkOrder.Status.IN_PROGRESS,
}

TECHNICAL_COMPLETE_TARGETS = {
    WorkOrder.Status.DIAGNOSIS: WorkOrder.Status.AWAITING_APPROVAL,
    WorkOrder.Status.IN_PROGRESS: WorkOrder.Status.QUALITY_CHECK,
}


def _technical_order_actor_allowed(work_order, actor):
    if not getattr(actor, "is_authenticated", False):
        return False
    if user_has_permission(actor, "work_orders.edit") or user_has_permission(actor, "technical.execute") and get_user_role(actor) != ROLE_TECHNICIAN:
        return True
    if work_order.assigned_to_id == actor.id:
        return True
    return work_order.services.filter(technician=actor).exists()


def technical_move_work_order(work_order, action, actor=None, note="", send_notifications=True, diagnosis_description=""):
    """Executa atalhos operacionais da Bancada Técnica no nível da OS."""
    action = (action or "").strip()
    if action not in {"start", "complete", "wait_parts"}:
        raise ValidationError({"action": "Ação técnica inválida."})
    if not _technical_order_actor_allowed(work_order, actor):
        raise ValidationError({"permissao": "Você só pode movimentar OS atribuídas a você ou a serviços sob sua responsabilidade."})

    current = work_order.status
    diagnosis_description = (diagnosis_description or "").strip()
    if action == "start":
        target = TECHNICAL_START_TARGETS.get(current)
        if not target:
            raise ValidationError({"status": "Esta OS não pode ser iniciada pela Bancada Técnica a partir do status atual."})
        default_note = "OS iniciada pela Bancada Técnica."
        source = SOURCE_TECHNICAL_START
    elif action == "complete":
        target = TECHNICAL_COMPLETE_TARGETS.get(current)
        if not target:
            raise ValidationError({"status": "Esta OS não pode ser concluída pela Bancada Técnica a partir do status atual."})
        if current == WorkOrder.Status.DIAGNOSIS:
            resulting_diagnosis = diagnosis_description or (work_order.diagnosis or "").strip()
            if not resulting_diagnosis:
                raise ValidationError({"diagnosis_description": "Informe a descrição do diagnóstico antes de enviar a OS para aprovação."})
        default_note = "OS concluída pela Bancada Técnica."
        source = SOURCE_TECHNICAL_COMPLETE
    else:
        if current not in {WorkOrder.Status.OPEN, WorkOrder.Status.DIAGNOSIS, WorkOrder.Status.APPROVED, WorkOrder.Status.IN_PROGRESS}:
            raise ValidationError({"status": "Somente OS aberta, em diagnóstico, aprovada ou em execução pode ir para Aguardando peça."})
        target = WorkOrder.Status.WAITING_PARTS
        default_note = "OS movida para Aguardando peça pela Bancada Técnica."
        source = SOURCE_TECHNICAL_WAITING_PARTS

    if action == "complete" and current == WorkOrder.Status.DIAGNOSIS and diagnosis_description:
        with transaction.atomic():
            WorkOrder.objects.filter(pk=work_order.pk).update(diagnosis=diagnosis_description, updated_by=actor if getattr(actor, "is_authenticated", False) else None, updated_at=timezone.now())
            work_order.refresh_from_db(fields=["diagnosis", "updated_by", "updated_at"])
            updated, message_ids = change_work_order_status(
                work_order,
                target,
                actor=actor,
                note=note or default_note,
                send_notifications=send_notifications,
                source=source,
            )
        return updated, message_ids

    updated, message_ids = change_work_order_status(
        work_order,
        target,
        actor=actor,
        note=note or default_note,
        send_notifications=send_notifications,
        source=source,
    )
    return updated, message_ids


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
    sent = []
    if send_notifications:
        fresh = WorkOrder.objects.select_related("customer", "vehicle", "assigned_to").get(pk=locked.pk)
        sent = trigger_status_notifications(fresh, actor=actor)
    return locked, sent
