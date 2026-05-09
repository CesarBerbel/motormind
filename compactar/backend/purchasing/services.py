from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from workshop.models import Part, PartStockMovement, WorkOrder, WorkOrderEvent, WorkOrderPart
from workshop.services import adjust_part_stock, record_event

from .models import PurchaseOrder, PurchaseOrderItem

ZERO = Decimal("0.00")
OPEN_PURCHASE_STATUSES = [
    PurchaseOrder.Status.DRAFT,
    PurchaseOrder.Status.REQUESTED,
    PurchaseOrder.Status.APPROVED,
    PurchaseOrder.Status.ORDERED,
    PurchaseOrder.Status.PARTIALLY_RECEIVED,
]


def shortage_for_work_order_part(line):
    if not line.part_id or not line.consume_inventory:
        return ZERO
    part = Part.objects.get(pk=line.part_id)
    required = line.quantity or ZERO
    available = part.stock_quantity or ZERO
    shortage = required - available
    return shortage if shortage > ZERO else ZERO


@transaction.atomic
def ensure_purchase_for_work_order_part(line, actor=None):
    locked_line = WorkOrderPart.objects.select_for_update().select_related("part", "work_order").get(pk=line.pk)
    if not locked_line.part_id or not locked_line.consume_inventory:
        return None
    part = Part.objects.select_for_update().get(pk=locked_line.part_id)
    shortage = (locked_line.quantity or ZERO) - (part.stock_quantity or ZERO)
    existing_items = PurchaseOrderItem.objects.select_for_update().filter(
        work_order_part=locked_line,
        is_auto_generated=True,
        purchase_order__status__in=OPEN_PURCHASE_STATUSES,
    ).select_related("purchase_order")
    existing_item = existing_items.first()

    if shortage <= ZERO:
        for item in existing_items:
            if (item.received_quantity or ZERO) == ZERO:
                order = item.purchase_order
                item.delete()
                if not order.items.exists() and order.origin == PurchaseOrder.Origin.AUTOMATIC:
                    order.delete()
        return None

    purchase_order = existing_item.purchase_order if existing_item else None
    if purchase_order is None:
        purchase_order = PurchaseOrder.objects.create(
            origin=PurchaseOrder.Origin.AUTOMATIC,
            status=PurchaseOrder.Status.DRAFT,
            work_order=locked_line.work_order,
            notes=f"Pedido automático gerado por falta de estoque na {locked_line.work_order.number}.",
            created_by=actor if getattr(actor, "is_authenticated", False) else None,
            updated_by=actor if getattr(actor, "is_authenticated", False) else None,
        )

    if existing_item:
        existing_item.quantity = shortage
        existing_item.part = part
        existing_item.work_order = locked_line.work_order
        existing_item.description = locked_line.description or part.name
        existing_item.unit_cost = locked_line.cost_price or part.cost_price
        existing_item.notes = f"Déficit automático da {locked_line.work_order.number}: necessário {locked_line.quantity}, estoque {part.stock_quantity}."
        existing_item.save()
        item = existing_item
    else:
        item = PurchaseOrderItem.objects.create(
            purchase_order=purchase_order,
            part=part,
            work_order=locked_line.work_order,
            work_order_part=locked_line,
            description=locked_line.description or part.name,
            quantity=shortage,
            unit_cost=locked_line.cost_price or part.cost_price,
            is_auto_generated=True,
            notes=f"Déficit automático da {locked_line.work_order.number}: necessário {locked_line.quantity}, estoque {part.stock_quantity}.",
        )
    purchase_order.recalculate_totals()
    record_event(
        locked_line.work_order,
        WorkOrderEvent.EventType.INVENTORY_CONSUMED,
        actor=actor,
        description=f"Pedido de compra automático {purchase_order.number} criado/atualizado para {part.name}.",
        data={"purchase_order_id": purchase_order.id, "purchase_order_number": purchase_order.number, "purchase_order_item_id": item.id, "shortage": str(shortage)},
    )
    return purchase_order


@transaction.atomic
def receive_purchase_order_items(purchase_order, items, actor=None):
    movements = []
    locked_order = PurchaseOrder.objects.select_for_update().get(pk=purchase_order.pk)
    if locked_order.status == PurchaseOrder.Status.CANCELLED:
        raise ValidationError("Pedido cancelado não pode receber itens.")
    for item_data in items:
        item_id = item_data.get("item_id")
        quantity = Decimal(str(item_data.get("quantity", "0")))
        unit_cost = Decimal(str(item_data.get("unit_cost", "0"))) if item_data.get("unit_cost") not in {None, ""} else None
        if quantity <= ZERO:
            raise ValidationError("Quantidade recebida precisa ser maior que zero.")
        item = PurchaseOrderItem.objects.select_for_update().select_related("part").get(pk=item_id, purchase_order=locked_order)
        if not item.part_id:
            raise ValidationError(f"O item {item.description} não possui peça vinculada para entrada no estoque.")
        pending = item.pending_quantity
        if quantity > pending:
            raise ValidationError(f"Quantidade recebida de {item.description} maior que o saldo pendente.")
        movement = adjust_part_stock(
            item.part,
            quantity=quantity,
            movement_type=PartStockMovement.MovementType.PURCHASE,
            actor=actor,
            notes=f"Entrada do pedido de compra {locked_order.number}",
            unit_cost=unit_cost or item.unit_cost or item.part.cost_price,
        )
        item.received_quantity = (item.received_quantity or ZERO) + quantity
        if unit_cost is not None:
            item.unit_cost = unit_cost
        item.save()
        movements.append(movement)
    locked_order.refresh_from_db()
    locked_order.recalculate_totals()
    locked_order.refresh_status_from_receipts()
    if locked_order.status in {PurchaseOrder.Status.PARTIALLY_RECEIVED, PurchaseOrder.Status.RECEIVED}:
        locked_order.received_at = locked_order.received_at or timezone.now()
        locked_order.save(update_fields=["received_at", "updated_at"])
    if locked_order.work_order_id:
        record_event(
            locked_order.work_order,
            WorkOrderEvent.EventType.INVENTORY_CONSUMED,
            actor=actor,
            description=f"Itens recebidos no pedido de compra {locked_order.number}.",
            data={"purchase_order_id": locked_order.id, "stock_movement_ids": [movement.id for movement in movements]},
        )
    return locked_order, movements
