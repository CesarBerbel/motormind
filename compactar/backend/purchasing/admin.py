from django.contrib import admin

from .models import PurchaseOrder, PurchaseOrderItem, Supplier


class PurchaseOrderItemInline(admin.TabularInline):
    model = PurchaseOrderItem
    extra = 0


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ("name", "document", "email", "phone", "is_active")
    search_fields = ("name", "document", "email", "phone")
    list_filter = ("is_active",)


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ("number", "supplier", "origin", "status", "work_order", "total_amount", "created_at")
    list_filter = ("origin", "status")
    search_fields = ("number", "supplier__name", "work_order__number")
    inlines = [PurchaseOrderItemInline]
