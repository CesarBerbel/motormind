from django.contrib import admin

from .models import (
    GeneralCategory,
    WorkshopProfile,
    PartBrand,
    Part,
    PartStockMovement,
    ServicePackage,
    ServicePackageItem,
    Vehicle,
    WorkOrder,
    WorkOrderPhoto,
    WorkOrderEvent,
    WorkOrderCustomerApproval,
    WorkOrderDeliverySignature,
    WorkOrderMessage,
    WorkOrderNotificationRule,
    WorkOrderPart,
    WorkOrderPayment,
    WorkOrderService,
    WorkOrderServiceChecklistItem,
    WorkshopService,
    WorkshopServiceChecklistTemplate,
)


@admin.register(WorkshopProfile)
class WorkshopProfileAdmin(admin.ModelAdmin):
    list_display = ("display_name", "document_number", "phone_e164", "email", "city", "state", "updated_at")
    search_fields = ("legal_name", "trade_name", "document_number", "email", "phone_e164", "city")
    readonly_fields = ("created_at", "updated_at")
    fieldsets = (
        ("Identificação", {"fields": ("legal_name", "trade_name", "document_number", "state_registration", "municipal_registration", "logo", "is_active")}),
        ("Contato", {"fields": ("email", "phone_e164", "secondary_phone_e164", "website")}),
        ("Endereço", {"fields": ("zip_code", "address_line", "address_number", "address_complement", "district", "city", "state", "country")}),
        ("Impressões", {"fields": ("responsible_name", "print_header_text", "print_footer_text", "estimate_terms", "work_order_terms", "purchase_order_terms", "bank_info", "pix_key")}),
        ("Operação", {"fields": ("technical_checklist_enabled", "delivery_signature_enabled")}),
        ("Landing page pública", {"fields": ("landing_enabled", "landing_headline", "landing_subheadline", "landing_cta_label", "landing_highlight_text")}),
        ("Auditoria", {"fields": ("created_at", "updated_at")}),
    )

    def has_add_permission(self, request):
        if WorkshopProfile.objects.exists():
            return False
        return super().has_add_permission(request)


@admin.register(GeneralCategory)
class GeneralCategoryAdmin(admin.ModelAdmin):
    list_display = ("type", "code", "name", "is_active")
    search_fields = ("code", "name", "description")
    list_filter = ("type", "is_active")


@admin.register(PartBrand)
class PartBrandAdmin(admin.ModelAdmin):
    list_display = ("name", "normalized_name", "source", "is_active", "updated_at")
    search_fields = ("name", "normalized_name", "notes")
    list_filter = ("source", "is_active")
    readonly_fields = ("normalized_name", "created_at", "updated_at")


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = ("plate", "customer", "make", "model", "year", "has_fipe_link", "is_active")
    search_fields = (
        "plate",
        "make",
        "model",
        "version",
        "fipe_brand_code",
        "fipe_model_code",
        "fipe_year_code",
        "customer__first_name",
        "customer__last_name",
        "customer__email",
    )
    list_filter = ("is_active",)


class WorkshopServiceChecklistTemplateInline(admin.TabularInline):
    model = WorkshopServiceChecklistTemplate
    extra = 1
    fields = ("sort_order", "description", "is_required", "requires_photo", "requires_note", "is_active")


@admin.register(WorkshopService)
class WorkshopServiceAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "category", "legacy_category_name", "has_photo", "default_unit_price", "is_featured", "is_active")
    search_fields = ("code", "name", "category__name", "legacy_category_name")
    list_filter = ("category", "is_featured", "is_active")
    list_editable = ("is_featured", "is_active")
    readonly_fields = ("created_at", "updated_at")
    inlines = [WorkshopServiceChecklistTemplateInline]

    def has_photo(self, obj):
        return bool(obj.photo)
    has_photo.boolean = True
    has_photo.short_description = "Foto"




class ServicePackageItemInline(admin.TabularInline):
    model = ServicePackageItem
    extra = 1


@admin.register(ServicePackage)
class ServicePackageAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "is_active")
    search_fields = ("code", "name", "description")
    list_filter = ("is_active",)
    inlines = [ServicePackageItemInline]


@admin.register(Part)
class PartAdmin(admin.ModelAdmin):
    list_display = ("sku", "name", "category", "brand", "has_photo", "unit", "stock_quantity", "minimum_stock", "sale_price", "is_featured", "is_active")
    search_fields = ("sku", "name", "category__name", "brand")
    list_filter = ("category", "unit", "is_featured", "is_active")
    list_editable = ("is_featured", "is_active")
    readonly_fields = ("created_at", "updated_at")

    def has_photo(self, obj):
        return bool(obj.photo)
    has_photo.boolean = True
    has_photo.short_description = "Foto"


class WorkOrderPhotoInline(admin.TabularInline):
    model = WorkOrderPhoto
    extra = 0
    readonly_fields = ("original_filename", "file_size", "sha256", "uploaded_by", "created_at", "updated_at")


@admin.register(WorkOrder)
class WorkOrderAdmin(admin.ModelAdmin):
    list_display = ("number", "customer", "vehicle", "order_type", "status", "priority", "grand_total", "balance_due", "created_at")
    search_fields = ("number", "customer__first_name", "customer__last_name", "vehicle__plate", "title", "reference_work_order__number")
    list_filter = ("order_type", "status", "priority")
    inlines = [WorkOrderPhotoInline]


@admin.register(WorkOrderPhoto)
class WorkOrderPhotoAdmin(admin.ModelAdmin):
    list_display = ("work_order", "photo_type", "caption", "uploaded_by", "file_size", "created_at")
    search_fields = ("work_order__number", "caption", "original_filename", "sha256")
    list_filter = ("photo_type", "is_customer_visible", "created_at")
    readonly_fields = ("original_filename", "content_type", "file_size", "sha256", "created_at", "updated_at")


admin.site.register(WorkOrderService)
admin.site.register(WorkOrderServiceChecklistItem)
admin.site.register(WorkOrderPart)
admin.site.register(WorkOrderPayment)
admin.site.register(PartStockMovement)
admin.site.register(WorkOrderEvent)


@admin.register(WorkOrderCustomerApproval)
class WorkOrderCustomerApprovalAdmin(admin.ModelAdmin):
    list_display = ("work_order", "document_type", "status", "customer_name_snapshot", "requested_by", "requested_at", "expires_at", "decided_at")
    search_fields = ("work_order__number", "customer_name_snapshot", "customer_email_snapshot", "decision_name", "decision_document")
    list_filter = ("document_type", "status", "is_active", "requested_at", "decided_at")
    readonly_fields = ("token", "requested_at", "decided_at", "decision_ip", "decision_user_agent", "created_at", "updated_at")


admin.site.register(WorkOrderNotificationRule)
admin.site.register(WorkOrderMessage)


@admin.register(WorkOrderDeliverySignature)
class WorkOrderDeliverySignatureAdmin(admin.ModelAdmin):
    list_display = ("work_order", "recipient_name", "recipient_document", "signed_at", "signed_by_user")
    search_fields = ("work_order__number", "recipient_name", "recipient_document")
    readonly_fields = ("signed_at", "signed_ip", "signed_user_agent", "created_at", "updated_at")
