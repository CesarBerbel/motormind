from django.contrib import admin

from .models import AccountPayable, AccountPayablePayment, AccountReceivable, AccountReceivablePayment, FinancialLedgerEntry


class AccountReceivablePaymentInline(admin.TabularInline):
    model = AccountReceivablePayment
    extra = 0
    readonly_fields = ("created_at", "updated_at")


@admin.register(AccountReceivable)
class AccountReceivableAdmin(admin.ModelAdmin):
    list_display = ("number", "customer", "work_order", "due_date", "amount", "paid_amount", "balance_amount", "status")
    list_filter = ("status", "origin", "due_date")
    search_fields = ("number", "description", "customer__first_name", "customer__last_name", "work_order__number")
    readonly_fields = ("number", "paid_amount", "balance_amount", "created_at", "updated_at")
    inlines = [AccountReceivablePaymentInline]


class AccountPayablePaymentInline(admin.TabularInline):
    model = AccountPayablePayment
    extra = 0
    readonly_fields = ("created_at", "updated_at")


@admin.register(AccountPayable)
class AccountPayableAdmin(admin.ModelAdmin):
    list_display = ("number", "description", "supplier", "origin", "recurrence_type", "due_date", "amount", "paid_amount", "balance_amount", "status")
    list_filter = ("status", "origin", "recurrence_type", "due_date", "category")
    search_fields = ("number", "description", "supplier__name", "purchase_order__number", "category")
    readonly_fields = ("number", "paid_amount", "balance_amount", "recurrence_group", "created_at", "updated_at")
    inlines = [AccountPayablePaymentInline]



@admin.register(FinancialLedgerEntry)
class FinancialLedgerEntryAdmin(admin.ModelAdmin):
    list_display = ("occurred_at", "entry_type", "origin", "description", "amount", "payment_method", "created_by")
    list_filter = ("entry_type", "origin", "payment_method", "competence_date", "occurred_at")
    search_fields = ("description", "reference", "origin_id", "created_by__username")
    readonly_fields = ("created_at", "updated_at")
