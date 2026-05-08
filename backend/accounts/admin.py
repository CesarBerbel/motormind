from django.contrib import admin

from .models import UserProfile


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ["user", "role", "technician_specialty", "person_type", "document_number", "phone_e164", "city", "state", "has_photo"]
    list_filter = ["role", "technician_specialty", "person_type", "state"]
    search_fields = ["user__username", "user__first_name", "user__last_name", "user__email", "document_number", "phone_e164", "city"]
    readonly_fields = ["created_at", "updated_at"]
    fieldsets = (
        ("Acesso", {"fields": ("user", "role", "technician_specialty")}),
        ("Identificação", {"fields": ("person_type", "document_number", "trade_name", "state_registration", "municipal_registration", "birth_date", "photo_3x4")}),
        ("Contato", {"fields": ("phone_e164", "secondary_phone_e164")}),
        ("Endereço", {"fields": ("zip_code", "address_line", "address_number", "address_complement", "district", "city", "state", "country")}),
        ("Complementares", {"fields": ("notes", "custom_data", "created_at", "updated_at")}),
    )

    def has_photo(self, obj):
        return bool(obj.photo_3x4)
    has_photo.boolean = True
    has_photo.short_description = "Foto 3x4"

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ["created_at", "action", "user", "app_label", "model_name", "object_id", "description"]
    list_filter = ["action", "app_label", "model_name", "created_at"]
    search_fields = ["object_repr", "object_id", "description", "user__username", "user__email"]
    readonly_fields = ["created_at", "action", "app_label", "model_name", "object_id", "object_repr", "user", "description", "before", "after", "metadata", "ip_address", "user_agent"]
