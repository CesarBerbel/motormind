"""Máquina de estados oficial da Ordem de Serviço.

Este módulo concentra as regras de transição para evitar que views,
serializers, Kanban, bancada técnica ou futuras integrações alterem a OS por
atalhos diferentes. A regra de ouro é: perfil nenhum pode mover uma OS para um
estado que não exista no grafo abaixo.
"""

from dataclasses import dataclass
from typing import Iterable

from django.core.exceptions import ValidationError

from accounts.roles import (
    ROLE_ADMINISTRATIVE,
    ROLE_ATTENDANT,
    ROLE_FINANCE,
    ROLE_OWNER,
    ROLE_STOCK,
    ROLE_TECHNICIAN,
)
from accounts.services import get_user_role, user_has_permission

from .models import WorkOrder


@dataclass(frozen=True)
class TransitionRule:
    target: str
    label: str
    description: str
    roles: frozenset[str]
    sources: frozenset[str]
    requires_note: bool = False


SOURCE_MANUAL = "manual"
SOURCE_TECHNICAL_START = "technical_start"
SOURCE_TECHNICAL_COMPLETE = "technical_complete"
SOURCE_QUALITY_REWORK = "quality_rework"
SOURCE_SYSTEM = "system"

ADMINISTRATIVE_ROLES = frozenset({ROLE_OWNER, ROLE_ADMINISTRATIVE})
ATTENDANCE_ROLES = frozenset({ROLE_OWNER, ROLE_ADMINISTRATIVE, ROLE_ATTENDANT})
TECHNICAL_ROLES = frozenset({ROLE_OWNER, ROLE_ADMINISTRATIVE, ROLE_TECHNICIAN})
FINISHING_ROLES = frozenset({ROLE_OWNER, ROLE_ADMINISTRATIVE, ROLE_ATTENDANT, ROLE_FINANCE})
CANCELLATION_ROLES = frozenset({ROLE_OWNER, ROLE_ADMINISTRATIVE, ROLE_ATTENDANT})
QUALITY_ROLES = frozenset({ROLE_OWNER, ROLE_ADMINISTRATIVE})
SYSTEM_ROLES = frozenset({ROLE_OWNER, ROLE_ADMINISTRATIVE, ROLE_ATTENDANT, ROLE_TECHNICIAN, ROLE_FINANCE, ROLE_STOCK})

WORK_ORDER_STATE_GRAPH: dict[str, tuple[TransitionRule, ...]] = {
    WorkOrder.Status.DRAFT: (
        TransitionRule(
            target=WorkOrder.Status.OPEN,
            label="Abrir OS",
            description="Transforma um rascunho em OS aberta para atendimento.",
            roles=ATTENDANCE_ROLES,
            sources=frozenset({SOURCE_MANUAL, SOURCE_SYSTEM}),
        ),
        TransitionRule(
            target=WorkOrder.Status.CANCELLED,
            label="Cancelar rascunho",
            description="Cancela uma OS ainda em rascunho.",
            roles=CANCELLATION_ROLES,
            sources=frozenset({SOURCE_MANUAL, SOURCE_SYSTEM}),
            requires_note=True,
        ),
    ),
    WorkOrder.Status.OPEN: (
        TransitionRule(
            target=WorkOrder.Status.DIAGNOSIS,
            label="Enviar para diagnóstico",
            description="Coloca a OS na etapa técnica inicial de diagnóstico.",
            roles=ATTENDANCE_ROLES,
            sources=frozenset({SOURCE_MANUAL, SOURCE_SYSTEM}),
        ),
        TransitionRule(
            target=WorkOrder.Status.AWAITING_APPROVAL,
            label="Enviar orçamento para aprovação",
            description="Marca a OS como aguardando aprovação do cliente.",
            roles=ATTENDANCE_ROLES,
            sources=frozenset({SOURCE_MANUAL, SOURCE_SYSTEM}),
        ),
        TransitionRule(
            target=WorkOrder.Status.CANCELLED,
            label="Cancelar OS aberta",
            description="Cancela uma OS antes da aprovação/execução.",
            roles=CANCELLATION_ROLES,
            sources=frozenset({SOURCE_MANUAL, SOURCE_SYSTEM}),
            requires_note=True,
        ),
    ),
    WorkOrder.Status.DIAGNOSIS: (
        TransitionRule(
            target=WorkOrder.Status.AWAITING_APPROVAL,
            label="Enviar orçamento para aprovação",
            description="Finaliza o diagnóstico e envia o orçamento para o cliente aprovar.",
            roles=ATTENDANCE_ROLES,
            sources=frozenset({SOURCE_MANUAL, SOURCE_SYSTEM}),
        ),
        TransitionRule(
            target=WorkOrder.Status.APPROVED,
            label="Aprovar sem orçamento formal",
            description="Aprova a OS diretamente quando o cliente já autorizou o serviço.",
            roles=ATTENDANCE_ROLES,
            sources=frozenset({SOURCE_MANUAL, SOURCE_SYSTEM}),
        ),
        TransitionRule(
            target=WorkOrder.Status.CANCELLED,
            label="Cancelar em diagnóstico",
            description="Cancela a OS durante diagnóstico.",
            roles=CANCELLATION_ROLES,
            sources=frozenset({SOURCE_MANUAL, SOURCE_SYSTEM}),
            requires_note=True,
        ),
    ),
    WorkOrder.Status.AWAITING_APPROVAL: (
        TransitionRule(
            target=WorkOrder.Status.DIAGNOSIS,
            label="Revisar diagnóstico/orçamento",
            description="Volta somente enquanto o orçamento ainda não foi aprovado.",
            roles=ATTENDANCE_ROLES,
            sources=frozenset({SOURCE_MANUAL, SOURCE_SYSTEM}),
            requires_note=True,
        ),
        TransitionRule(
            target=WorkOrder.Status.APPROVED,
            label="Registrar aprovação do cliente",
            description="Registra que o cliente aprovou o orçamento.",
            roles=ATTENDANCE_ROLES,
            sources=frozenset({SOURCE_MANUAL, SOURCE_SYSTEM}),
        ),
        TransitionRule(
            target=WorkOrder.Status.CANCELLED,
            label="Cancelar por reprovação/desistência",
            description="Cancela a OS porque o cliente não aprovou ou desistiu.",
            roles=CANCELLATION_ROLES,
            sources=frozenset({SOURCE_MANUAL, SOURCE_SYSTEM}),
            requires_note=True,
        ),
    ),
    WorkOrder.Status.APPROVED: (
        TransitionRule(
            target=WorkOrder.Status.IN_PROGRESS,
            label="Iniciar execução",
            description="Libera a OS aprovada para execução técnica.",
            roles=TECHNICAL_ROLES,
            sources=frozenset({SOURCE_MANUAL, SOURCE_TECHNICAL_START, SOURCE_SYSTEM}),
        ),
        TransitionRule(
            target=WorkOrder.Status.CANCELLED,
            label="Cancelar antes da execução",
            description="Cancela uma OS aprovada antes de iniciar a execução.",
            roles=ADMINISTRATIVE_ROLES,
            sources=frozenset({SOURCE_MANUAL, SOURCE_SYSTEM}),
            requires_note=True,
        ),
    ),
    WorkOrder.Status.IN_PROGRESS: (
        TransitionRule(
            target=WorkOrder.Status.QUALITY_CHECK,
            label="Enviar para conferência",
            description="Envia a OS executada para conferência de qualidade.",
            roles=TECHNICAL_ROLES,
            sources=frozenset({SOURCE_MANUAL, SOURCE_TECHNICAL_COMPLETE, SOURCE_SYSTEM}),
        ),
        TransitionRule(
            target=WorkOrder.Status.CANCELLED,
            label="Cancelar em execução",
            description="Cancela uma OS que já entrou em execução. Use somente para exceções operacionais.",
            roles=ADMINISTRATIVE_ROLES,
            sources=frozenset({SOURCE_MANUAL, SOURCE_SYSTEM}),
            requires_note=True,
        ),
    ),
    WorkOrder.Status.QUALITY_CHECK: (
        TransitionRule(
            target=WorkOrder.Status.IN_PROGRESS,
            label="Reprovar conferência e devolver ao técnico",
            description="Permite retrabalho depois de uma reprovação de conferência, sem voltar para diagnóstico/orçamento.",
            roles=QUALITY_ROLES,
            sources=frozenset({SOURCE_MANUAL, SOURCE_QUALITY_REWORK, SOURCE_SYSTEM}),
            requires_note=True,
        ),
        TransitionRule(
            target=WorkOrder.Status.READY,
            label="Aprovar conferência",
            description="Marca a OS como pronta para entrega.",
            roles=QUALITY_ROLES,
            sources=frozenset({SOURCE_MANUAL, SOURCE_SYSTEM}),
        ),
        TransitionRule(
            target=WorkOrder.Status.CANCELLED,
            label="Cancelar na conferência",
            description="Cancela uma OS na fase de conferência. Use somente para exceções operacionais.",
            roles=ADMINISTRATIVE_ROLES,
            sources=frozenset({SOURCE_MANUAL, SOURCE_SYSTEM}),
            requires_note=True,
        ),
    ),
    WorkOrder.Status.READY: (
        TransitionRule(
            target=WorkOrder.Status.DELIVERED,
            label="Entregar ao cliente",
            description="Finaliza a OS e gera os efeitos financeiros configurados.",
            roles=FINISHING_ROLES,
            sources=frozenset({SOURCE_MANUAL, SOURCE_SYSTEM}),
        ),
        TransitionRule(
            target=WorkOrder.Status.QUALITY_CHECK,
            label="Reabrir conferência",
            description="Retorna para conferência caso a OS pronta precise de ajuste antes da entrega.",
            roles=QUALITY_ROLES,
            sources=frozenset({SOURCE_MANUAL, SOURCE_SYSTEM}),
            requires_note=True,
        ),
    ),
    WorkOrder.Status.DELIVERED: (),
    WorkOrder.Status.CANCELLED: (),
}

TERMINAL_STATUSES = frozenset({WorkOrder.Status.DELIVERED, WorkOrder.Status.CANCELLED})


STATE_ORDER = {
    WorkOrder.Status.DRAFT: 10,
    WorkOrder.Status.OPEN: 20,
    WorkOrder.Status.DIAGNOSIS: 30,
    WorkOrder.Status.AWAITING_APPROVAL: 40,
    WorkOrder.Status.APPROVED: 50,
    WorkOrder.Status.IN_PROGRESS: 60,
    WorkOrder.Status.QUALITY_CHECK: 70,
    WorkOrder.Status.READY: 80,
    WorkOrder.Status.DELIVERED: 90,
    WorkOrder.Status.CANCELLED: 100,
}


INVALID_REGRESSION_HINTS = {
    (WorkOrder.Status.APPROVED, WorkOrder.Status.DIAGNOSIS): "OS com orçamento aprovado não pode voltar para diagnóstico. Use retrabalho técnico a partir de Conferência quando for o caso.",
    (WorkOrder.Status.IN_PROGRESS, WorkOrder.Status.DIAGNOSIS): "OS em execução não pode voltar para diagnóstico. Registre complemento técnico nos serviços ou use Conferência/Reprovação.",
    (WorkOrder.Status.QUALITY_CHECK, WorkOrder.Status.DIAGNOSIS): "OS em conferência não pode voltar para diagnóstico. A devolução válida é para Em execução.",
    (WorkOrder.Status.READY, WorkOrder.Status.DIAGNOSIS): "OS pronta não pode voltar para diagnóstico. Reabra a conferência antes da entrega, se necessário.",
    (WorkOrder.Status.DELIVERED, WorkOrder.Status.DIAGNOSIS): "OS entregue é estado final e não pode voltar para diagnóstico.",
}


class WorkOrderTransitionError(ValidationError):
    """Erro de transição de estado da OS."""


def _status_label(status: str) -> str:
    return dict(WorkOrder.Status.choices).get(status, status)


def _rules_from(status: str) -> tuple[TransitionRule, ...]:
    return WORK_ORDER_STATE_GRAPH.get(status, ())


def _find_rule(current_status: str, target_status: str) -> TransitionRule | None:
    for rule in _rules_from(current_status):
        if rule.target == target_status:
            return rule
    return None


def _actor_role(actor) -> str | None:
    return get_user_role(actor) if getattr(actor, "is_authenticated", False) else None


def _actor_can_use_rule(actor, rule: TransitionRule) -> bool:
    role = _actor_role(actor)
    if role in rule.roles:
        return True
    if role in ADMINISTRATIVE_ROLES and user_has_permission(actor, "*"):
        return True
    return False


def _normalize_source(source: str | None) -> str:
    return source or SOURCE_MANUAL


def _transition_data(current_status: str, rule: TransitionRule) -> dict:
    return {
        "status": rule.target,
        "status_label": _status_label(rule.target),
        "from_status": current_status,
        "from_status_label": _status_label(current_status),
        "label": rule.label,
        "description": rule.description,
        "requires_note": rule.requires_note,
        "is_forward": STATE_ORDER.get(rule.target, 0) >= STATE_ORDER.get(current_status, 0),
    }


def all_state_machine_transitions() -> list[dict]:
    transitions = []
    for current_status, rules in WORK_ORDER_STATE_GRAPH.items():
        for rule in rules:
            transitions.append(_transition_data(current_status, rule))
    return transitions


def available_status_transitions(work_order: WorkOrder, actor=None, source: str | None = SOURCE_MANUAL) -> list[dict]:
    source = _normalize_source(source)
    if not work_order or not work_order.status:
        return []
    transitions = []
    for rule in _rules_from(work_order.status):
        if source not in rule.sources and SOURCE_SYSTEM not in rule.sources:
            continue
        if actor is not None and not _actor_can_use_rule(actor, rule):
            continue
        transitions.append(_transition_data(work_order.status, rule))
    return transitions


def validate_work_order_transition(work_order: WorkOrder, new_status: str, actor=None, note: str = "", source: str | None = SOURCE_MANUAL) -> TransitionRule | None:
    source = _normalize_source(source)
    current_status = work_order.status
    valid_statuses = {value for value, _label in WorkOrder.Status.choices}

    if new_status not in valid_statuses:
        raise WorkOrderTransitionError({"status": f"Status inválido: {new_status}."})

    if current_status == new_status:
        return None

    if current_status in TERMINAL_STATUSES:
        raise WorkOrderTransitionError({
            "status": f"A OS está em estado final ({_status_label(current_status)}) e não pode mudar de status pelo fluxo operacional.",
            "current_status": current_status,
            "target_status": new_status,
        })

    rule = _find_rule(current_status, new_status)
    if not rule:
        hint = INVALID_REGRESSION_HINTS.get((current_status, new_status))
        if not hint:
            hint = f"Transição não permitida pela máquina de estados: {_status_label(current_status)} → {_status_label(new_status)}."
        raise WorkOrderTransitionError({
            "status": hint,
            "current_status": current_status,
            "target_status": new_status,
            "allowed_targets": [_transition_data(current_status, allowed) for allowed in _rules_from(current_status)],
        })

    if source not in rule.sources:
        raise WorkOrderTransitionError({
            "status": f"A origem '{source}' não pode executar a transição {_status_label(current_status)} → {_status_label(new_status)}.",
            "current_status": current_status,
            "target_status": new_status,
        })

    if actor is not None and not _actor_can_use_rule(actor, rule):
        role = _actor_role(actor) or "sem perfil"
        raise WorkOrderTransitionError({
            "permissao": f"Seu perfil ({role}) não tem permissão para mover a OS de {_status_label(current_status)} para {_status_label(new_status)}.",
            "current_status": current_status,
            "target_status": new_status,
        })

    if rule.requires_note and not (note or "").strip():
        raise WorkOrderTransitionError({
            "note": f"Informe uma observação para a transição {_status_label(current_status)} → {_status_label(new_status)}.",
            "current_status": current_status,
            "target_status": new_status,
        })

    return rule


def allowed_target_values(work_order: WorkOrder, actor=None, source: str | None = SOURCE_MANUAL) -> set[str]:
    return {item["status"] for item in available_status_transitions(work_order, actor=actor, source=source)}
