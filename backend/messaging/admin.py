from django.contrib import admin

from .models import Automation, ChannelConfiguration, Contact, ContactGroup, MessageLog, MessageTemplate


@admin.register(ChannelConfiguration)
class ChannelConfigurationAdmin(admin.ModelAdmin):
    fieldsets = (
        ("Email", {"fields": ("email_enabled", "default_from_email")}),
        ("WhatsApp", {"fields": ("whatsapp_enabled", "whatsapp_provider", "whatsapp_access_token", "whatsapp_phone_number_id", "whatsapp_api_version", "whatsapp_preview_url")}),
    )

    def has_add_permission(self, request):
        return not ChannelConfiguration.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(MessageTemplate)
class MessageTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "channel", "is_active", "updated_at")
    list_filter = ("channel", "is_active")
    search_fields = ("name", "slug", "description")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(MessageLog)
class MessageLogAdmin(admin.ModelAdmin):
    list_display = ("channel", "recipient_name", "to_email", "to_phone", "status", "sent_at", "created_at")
    list_filter = ("channel", "status")
    search_fields = ("recipient_name", "to_email", "to_phone", "rendered_subject", "error_message")
    readonly_fields = [field.name for field in MessageLog._meta.fields]


admin.site.register(Contact)
admin.site.register(ContactGroup)
admin.site.register(Automation)
