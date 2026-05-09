import csv
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Q, Sum
from django.db.models.functions import Coalesce, TruncMonth
from django.http import HttpResponse
from django.utils import dateparse, timezone

from django.contrib.auth import get_user_model
from finance.models import AccountPayable, AccountPayablePayment, AccountReceivable, AccountReceivablePayment, FinancialLedgerEntry
from workshop.models import (
    Part,
    PartStockMovement,
    WorkOrder,
    WorkOrderCustomerApproval,
    WorkOrderPart,
    WorkOrderPayment,
    WorkOrderService,
)

ZERO = Decimal("0.00")
User = get_user_model()
MONEY_FIELD = DecimalField(max_digits=14, decimal_places=2)


def decimal_value(value):
    return value if value is not None else ZERO


def parse_date_param(request, name, default):
    raw = request.query_params.get(name)
    if not raw:
        return default
    parsed = dateparse.parse_date(raw)
    return parsed or default


def default_period(request):
    today = timezone.localdate()
    start_date = parse_date_param(request, "start_date", today.replace(day=1))
    end_date = parse_date_param(request, "end_date", today)
    if end_date < start_date:
        start_date, end_date = end_date, start_date
    return start_date, end_date


def queryset_date_range(qs, field, start_date, end_date):
    return qs.filter(**{f"{field}__date__gte": start_date, f"{field}__date__lte": end_date})


def queryset_plain_date_range(qs, field, start_date, end_date):
    return qs.filter(**{f"{field}__gte": start_date, f"{field}__lte": end_date})


def money_sum(qs, field):
    return decimal_value(qs.aggregate(total=Coalesce(Sum(field), ZERO, output_field=MONEY_FIELD))["total"])


def count_by_field(qs, field, label_map=None):
    label_map = label_map or {}
    rows = qs.values(field).annotate(count=Count("id")).order_by(field)
    return [
        {
            "key": row[field] or "",
            "label": label_map.get(row[field], row[field] or "Não informado"),
            "count": row["count"],
        }
        for row in rows
    ]


def user_label(user):
    if not user:
        return "Não atribuído"
    return user.get_full_name() or user.username


def build_period_meta(start_date, end_date):
    return {"start_date": start_date.isoformat(), "end_date": end_date.isoformat()}


def apply_work_order_filters(request, qs):
    status = request.query_params.get("status")
    customer = request.query_params.get("customer")
    technician = request.query_params.get("technician")
    service = request.query_params.get("service")
    search = (request.query_params.get("search") or "").strip()
    if status:
        qs = qs.filter(status=status)
    if customer:
        qs = qs.filter(customer_id=customer)
    if technician:
        qs = qs.filter(assigned_to_id=technician)
    if service:
        qs = qs.filter(services__service_id=service).distinct()
    if search:
        qs = qs.filter(
            Q(number__icontains=search)
            | Q(title__icontains=search)
            | Q(customer__first_name__icontains=search)
            | Q(customer__last_name__icontains=search)
            | Q(customer__trade_name__icontains=search)
            | Q(vehicle__plate__icontains=search)
            | Q(vehicle__make__icontains=search)
            | Q(vehicle__model__icontains=search)
        )
    return qs


def work_order_rows(qs, limit=100):
    rows = []
    for order in qs.select_related("customer", "vehicle", "assigned_to").order_by("-opened_at", "-id")[:limit]:
        rows.append(
            {
                "id": order.id,
                "number": order.number,
                "opened_at": timezone.localtime(order.opened_at).date().isoformat() if order.opened_at else "",
                "customer_name": order.customer.display_name if order.customer_id else "",
                "vehicle_display": order.vehicle.display_name if order.vehicle_id else "",
                "status": order.status,
                "status_label": order.status_label,
                "technician_name": user_label(order.assigned_to),
                "services_total": order.subtotal_services,
                "parts_total": order.subtotal_parts,
                "discount_total": order.discount_total,
                "grand_total": order.grand_total,
                "paid_total": order.paid_total,
                "balance_due": order.balance_due,
            }
        )
    return rows


def executive_summary(request):
    start_date, end_date = default_period(request)
    work_orders_period = queryset_date_range(WorkOrder.objects.all(), "opened_at", start_date, end_date)
    receivables = AccountReceivable.objects.all()
    payables = AccountPayable.objects.all()
    ledger_period = queryset_date_range(FinancialLedgerEntry.objects.all(), "occurred_at", start_date, end_date)
    received_period = money_sum(ledger_period.filter(entry_type=FinancialLedgerEntry.EntryType.CREDIT), "amount")
    paid_period = money_sum(ledger_period.filter(entry_type=FinancialLedgerEntry.EntryType.DEBIT), "amount")

    receivable_open = money_sum(receivables.exclude(status__in=[AccountReceivable.Status.PAID, AccountReceivable.Status.CANCELLED]), "balance_amount")
    payable_open = money_sum(payables.exclude(status__in=[AccountPayable.Status.PAID, AccountPayable.Status.CANCELLED]), "balance_amount")
    os_total = money_sum(work_orders_period.exclude(status=WorkOrder.Status.CANCELLED), "grand_total")
    os_count = work_orders_period.exclude(status=WorkOrder.Status.CANCELLED).count()
    delivered_count = work_orders_period.filter(status=WorkOrder.Status.DELIVERED).count()
    pending_approvals = WorkOrderCustomerApproval.objects.filter(status=WorkOrderCustomerApproval.Status.PENDING, is_active=True).count()
    low_stock = Part.objects.filter(is_active=True, stock_quantity__lte=F("minimum_stock")).count()

    return {
        "period": build_period_meta(start_date, end_date),
        "cards": {
            "revenue_period": received_period,
            "expenses_period": paid_period,
            "net_period": received_period - paid_period,
            "work_order_total_period": os_total,
            "work_order_count_period": os_count,
            "ticket_average": (os_total / os_count) if os_count else ZERO,
            "receivable_open": receivable_open,
            "payable_open": payable_open,
            "projected_balance": receivable_open - payable_open,
            "open_work_orders": WorkOrder.objects.exclude(status__in=[WorkOrder.Status.DELIVERED, WorkOrder.Status.CANCELLED]).count(),
            "delivered_work_orders_period": delivered_count,
            "pending_approvals": pending_approvals,
            "low_stock_parts": low_stock,
        },
        "work_order_status": count_by_field(work_orders_period, "status", dict(WorkOrder.Status.choices)),
        "finance_flow": month_series_from_ledger(start_date, end_date),
        "top_services": top_services(start_date, end_date, limit=5),
        "top_parts": top_parts(start_date, end_date, limit=5),
        "recent_work_orders": work_order_rows(WorkOrder.objects.all(), limit=8),
        "low_stock_parts": inventory_rows(Part.objects.filter(is_active=True, stock_quantity__lte=F("minimum_stock")).order_by("stock_quantity", "name"), limit=8),
    }


def month_series_from_ledger(start_date, end_date):
    entries = FinancialLedgerEntry.objects.filter(occurred_at__date__gte=start_date, occurred_at__date__lte=end_date)
    rows = entries.annotate(month=TruncMonth("occurred_at")).values("month", "entry_type").annotate(total=Coalesce(Sum("amount"), ZERO, output_field=MONEY_FIELD)).order_by("month")
    grouped = {}
    for row in rows:
        key = row["month"].date().isoformat() if row["month"] else ""
        grouped.setdefault(key, {"month": key, "credits": ZERO, "debits": ZERO, "net": ZERO})
        if row["entry_type"] == FinancialLedgerEntry.EntryType.CREDIT:
            grouped[key]["credits"] += row["total"] or ZERO
        elif row["entry_type"] == FinancialLedgerEntry.EntryType.DEBIT:
            grouped[key]["debits"] += row["total"] or ZERO
    for item in grouped.values():
        item["net"] = item["credits"] - item["debits"]
    return list(grouped.values())


def top_services(start_date, end_date, limit=10):
    qs = (
        WorkOrderService.objects
        .filter(work_order__opened_at__date__gte=start_date, work_order__opened_at__date__lte=end_date)
        .exclude(status=WorkOrderService.Status.CANCELLED)
        .select_related("service")
    )
    grouped = {}
    for line in qs:
        key = line.service_id or f"custom-{line.description}"
        item = grouped.setdefault(key, {"service_id": line.service_id, "description": line.description, "count": 0, "quantity": ZERO, "total": ZERO})
        item["count"] += 1
        item["quantity"] += line.quantity or ZERO
        item["total"] += line.total_amount or ZERO
    return sorted(grouped.values(), key=lambda row: (-row["count"], -row["total"], row["description"]))[:limit]


def top_parts(start_date, end_date, limit=10):
    qs = (
        WorkOrderPart.objects
        .filter(work_order__opened_at__date__gte=start_date, work_order__opened_at__date__lte=end_date)
        .select_related("part")
    )
    grouped = {}
    for line in qs:
        key = line.part_id or f"custom-{line.description}"
        item = grouped.setdefault(key, {"part_id": line.part_id, "description": line.description, "count": 0, "quantity": ZERO, "total": ZERO})
        item["count"] += 1
        item["quantity"] += line.quantity or ZERO
        item["total"] += line.total_amount or ZERO
    return sorted(grouped.values(), key=lambda row: (-row["quantity"], -row["total"], row["description"]))[:limit]


def work_orders_report(request):
    start_date, end_date = default_period(request)
    qs = queryset_date_range(WorkOrder.objects.all(), "opened_at", start_date, end_date)
    qs = apply_work_order_filters(request, qs)
    active_qs = qs.exclude(status=WorkOrder.Status.CANCELLED)
    total_amount = money_sum(active_qs, "grand_total")
    count = active_qs.count()
    delivered = active_qs.filter(status=WorkOrder.Status.DELIVERED)
    completed_durations = []
    for order in delivered.exclude(delivered_at__isnull=True).exclude(opened_at__isnull=True).only("opened_at", "delivered_at"):
        completed_durations.append((order.delivered_at - order.opened_at).total_seconds() / 3600)
    avg_hours = sum(completed_durations) / len(completed_durations) if completed_durations else 0

    technician_rows = []
    for row in active_qs.values("assigned_to").annotate(count=Count("id"), total=Coalesce(Sum("grand_total"), ZERO, output_field=MONEY_FIELD)).order_by("-count"):
        user = User.objects.filter(pk=row["assigned_to"]).first() if row["assigned_to"] else None
        technician_rows.append({"technician_id": row["assigned_to"], "technician_name": user_label(user), "count": row["count"], "total": row["total"]})

    return {
        "period": build_period_meta(start_date, end_date),
        "summary": {
            "count": count,
            "cancelled_count": qs.filter(status=WorkOrder.Status.CANCELLED).count(),
            "delivered_count": delivered.count(),
            "total_amount": total_amount,
            "ticket_average": (total_amount / count) if count else ZERO,
            "average_delivery_hours": round(avg_hours, 2),
            "pending_approval_count": active_qs.filter(status=WorkOrder.Status.AWAITING_APPROVAL).count(),
        },
        "status_breakdown": count_by_field(qs, "status", dict(WorkOrder.Status.choices)),
        "technician_breakdown": technician_rows,
        "top_services": top_services(start_date, end_date, limit=10),
        "top_parts": top_parts(start_date, end_date, limit=10),
        "rows": work_order_rows(active_qs, limit=200),
    }


def finance_report(request):
    start_date, end_date = default_period(request)
    receivables = queryset_plain_date_range(AccountReceivable.objects.select_related("customer"), "due_date", start_date, end_date)
    payables = queryset_plain_date_range(AccountPayable.objects.select_related("supplier"), "due_date", start_date, end_date)
    ledger = queryset_date_range(FinancialLedgerEntry.objects.all(), "occurred_at", start_date, end_date)
    received = money_sum(ledger.filter(entry_type=FinancialLedgerEntry.EntryType.CREDIT), "amount")
    paid = money_sum(ledger.filter(entry_type=FinancialLedgerEntry.EntryType.DEBIT), "amount")
    receivable_open_qs = receivables.exclude(status__in=[AccountReceivable.Status.PAID, AccountReceivable.Status.CANCELLED])
    payable_open_qs = payables.exclude(status__in=[AccountPayable.Status.PAID, AccountPayable.Status.CANCELLED])

    receivable_rows = [
        {
            "id": item.id,
            "number": item.number,
            "type": "receivable",
            "type_label": "A receber",
            "description": item.description,
            "party_name": item.customer.display_name if item.customer_id else "",
            "due_date": item.due_date.isoformat() if item.due_date else "",
            "amount": item.amount,
            "paid_amount": item.paid_amount,
            "balance_amount": item.balance_amount,
            "status": item.status,
            "status_label": item.status_label,
        }
        for item in receivables.order_by("due_date", "number")[:150]
    ]
    payable_rows = [
        {
            "id": item.id,
            "number": item.number,
            "type": "payable",
            "type_label": "A pagar",
            "description": item.description,
            "party_name": item.supplier_name,
            "due_date": item.due_date.isoformat() if item.due_date else "",
            "amount": item.amount,
            "paid_amount": item.paid_amount,
            "balance_amount": item.balance_amount,
            "status": item.status,
            "status_label": item.status_label,
        }
        for item in payables.order_by("due_date", "number")[:150]
    ]

    return {
        "period": build_period_meta(start_date, end_date),
        "summary": {
            "received_period": received,
            "paid_period": paid,
            "net_period": received - paid,
            "receivable_total": money_sum(receivables, "amount"),
            "receivable_open": money_sum(receivable_open_qs, "balance_amount"),
            "payable_total": money_sum(payables, "amount"),
            "payable_open": money_sum(payable_open_qs, "balance_amount"),
            "overdue_receivables": receivables.filter(status=AccountReceivable.Status.OVERDUE).count(),
            "overdue_payables": payables.filter(status=AccountPayable.Status.OVERDUE).count(),
        },
        "receivable_status_breakdown": count_by_field(receivables, "status", dict(AccountReceivable.Status.choices)),
        "payable_status_breakdown": count_by_field(payables, "status", dict(AccountPayable.Status.choices)),
        "flow_by_month": month_series_from_ledger(start_date, end_date),
        "rows": receivable_rows + payable_rows,
    }


def inventory_rows(qs, limit=200):
    rows = []
    for part in qs[:limit]:
        rows.append(
            {
                "id": part.id,
                "sku": part.sku,
                "name": part.name,
                "category_name": part.category_name,
                "brand": part.brand,
                "unit": part.unit,
                "stock_quantity": part.stock_quantity,
                "minimum_stock": part.minimum_stock,
                "cost_price": part.cost_price,
                "sale_price": part.sale_price,
                "stock_value": part.stock_value,
                "is_low_stock": part.is_low_stock,
            }
        )
    return rows


def inventory_report(request):
    start_date, end_date = default_period(request)
    search = (request.query_params.get("search") or "").strip()
    category = request.query_params.get("category")
    only_low_stock = request.query_params.get("low_stock") in ["1", "true", "True", "yes"]
    parts = Part.objects.select_related("category").filter(is_active=True).order_by("name", "sku")
    if search:
        parts = parts.filter(Q(sku__icontains=search) | Q(name__icontains=search) | Q(brand__icontains=search))
    if category:
        parts = parts.filter(category_id=category)
    if only_low_stock:
        parts = parts.filter(stock_quantity__lte=F("minimum_stock"))

    movements_period = PartStockMovement.objects.filter(created_at__date__gte=start_date, created_at__date__lte=end_date)
    consumption = movements_period.filter(movement_type=PartStockMovement.MovementType.CONSUMPTION)
    purchases = movements_period.filter(movement_type=PartStockMovement.MovementType.PURCHASE)
    stock_value = parts.aggregate(total=Coalesce(Sum(ExpressionWrapper(F("stock_quantity") * F("cost_price"), output_field=MONEY_FIELD)), ZERO, output_field=MONEY_FIELD))["total"] or ZERO

    top_consumed_map = {}
    for movement in consumption.select_related("part"):
        key = movement.part_id
        item = top_consumed_map.setdefault(key, {"part_id": key, "part__sku": movement.part.sku if movement.part_id else "", "part__name": movement.part.name if movement.part_id else "", "quantity": ZERO, "total_cost": ZERO})
        item["quantity"] += movement.quantity or ZERO
        item["total_cost"] += abs((movement.quantity or ZERO) * (movement.unit_cost or ZERO))
    top_consumed = sorted(top_consumed_map.values(), key=lambda row: (row["quantity"], row["part__name"]))[:10]

    return {
        "period": build_period_meta(start_date, end_date),
        "summary": {
            "active_parts": parts.count(),
            "low_stock_parts": parts.filter(stock_quantity__lte=F("minimum_stock")).count(),
            "out_of_stock_parts": parts.filter(stock_quantity__lte=0).count(),
            "stock_value": stock_value,
            "purchase_movements": purchases.count(),
            "consumption_movements": consumption.count(),
            "consumed_quantity": abs(decimal_value(consumption.aggregate(total=Coalesce(Sum("quantity"), ZERO, output_field=MONEY_FIELD))["total"])),
        },
        "top_consumed_parts": top_consumed,
        "low_stock_parts": inventory_rows(parts.filter(stock_quantity__lte=F("minimum_stock")).order_by("stock_quantity", "name"), limit=25),
        "rows": inventory_rows(parts, limit=250),
    }


def make_csv_response(filename, headers, rows):
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response.write("\ufeff")
    writer = csv.writer(response, delimiter=";")
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    return response


def export_work_orders_csv(request):
    start_date, end_date = default_period(request)
    qs = queryset_date_range(WorkOrder.objects.all(), "opened_at", start_date, end_date)
    qs = apply_work_order_filters(request, qs).exclude(status=WorkOrder.Status.CANCELLED)
    rows = [
        [
            row["number"], row["opened_at"], row["customer_name"], row["vehicle_display"], row["status_label"], row["technician_name"],
            row["services_total"], row["parts_total"], row["discount_total"], row["grand_total"], row["paid_total"], row["balance_due"],
        ]
        for row in work_order_rows(qs, limit=5000)
    ]
    return make_csv_response("relatorio-ordens-servico.csv", ["Número", "Abertura", "Cliente", "Veículo", "Status", "Técnico", "Serviços", "Peças", "Descontos", "Total", "Pago", "Saldo"], rows)


def export_finance_csv(request):
    data = finance_report(request)
    rows = [
        [item["type_label"], item["number"], item["description"], item["party_name"], item["due_date"], item["amount"], item["paid_amount"], item["balance_amount"], item["status_label"]]
        for item in data["rows"]
    ]
    return make_csv_response("relatorio-financeiro.csv", ["Tipo", "Número", "Descrição", "Cliente/Fornecedor", "Vencimento", "Valor", "Pago", "Saldo", "Status"], rows)


def export_inventory_csv(request):
    data = inventory_report(request)
    rows = [
        [item["sku"], item["name"], item["category_name"], item["brand"], item["unit"], item["stock_quantity"], item["minimum_stock"], item["cost_price"], item["sale_price"], item["stock_value"], "Sim" if item["is_low_stock"] else "Não"]
        for item in data["rows"]
    ]
    return make_csv_response("relatorio-estoque.csv", ["SKU", "Peça", "Categoria", "Marca", "Unidade", "Estoque", "Mínimo", "Custo", "Venda", "Valor estoque", "Baixo estoque"], rows)
