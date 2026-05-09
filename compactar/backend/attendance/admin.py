from django.contrib import admin

from .models import CounterSale, CounterSaleItem, CounterSalePayment, Estimate, EstimatePartItem, EstimateServiceItem


class CounterSaleItemInline(admin.TabularInline):
    model = CounterSaleItem
    extra = 0


class CounterSalePaymentInline(admin.TabularInline):
    model = CounterSalePayment
    extra = 0
    readonly_fields = ["created_at", "updated_at"]


@admin.register(CounterSale)
class CounterSaleAdmin(admin.ModelAdmin):
    list_display = ["number", "effective_customer_name", "status", "total_amount", "paid_amount", "balance_amount", "sold_at"]
    list_filter = ["status", "sold_at"]
    search_fields = ["number", "customer__first_name", "customer__last_name", "customer_name"]
    inlines = [CounterSaleItemInline, CounterSalePaymentInline]
    readonly_fields = ["number", "subtotal_amount", "total_amount", "paid_amount", "balance_amount", "created_at", "updated_at"]


class EstimateServiceItemInline(admin.TabularInline):
    model = EstimateServiceItem
    extra = 0


class EstimatePartItemInline(admin.TabularInline):
    model = EstimatePartItem
    extra = 0


@admin.register(Estimate)
class EstimateAdmin(admin.ModelAdmin):
    list_display = ["number", "customer", "vehicle", "status", "total_amount", "valid_until", "converted_work_order"]
    list_filter = ["status", "valid_until"]
    search_fields = ["number", "title", "customer__first_name", "customer__last_name", "vehicle__plate"]
    inlines = [EstimateServiceItemInline, EstimatePartItemInline]
    readonly_fields = ["number", "subtotal_services", "subtotal_parts", "total_amount", "created_at", "updated_at"]
