from django.contrib import admin
from .models import AIProviderConfiguration, AIPrompt


@admin.register(AIProviderConfiguration)
class AIProviderConfigurationAdmin(admin.ModelAdmin):
    list_display = ('provider', 'display_name', 'model_name', 'is_enabled', 'is_default', 'max_tokens', 'updated_at')
    list_filter = ('provider', 'is_enabled', 'is_default')
    search_fields = ('display_name', 'model_name')
    fieldsets = (
        ('Provedor', {'fields': ('provider', 'display_name', 'is_enabled', 'is_default')}),
        ('Credenciais e modelo', {'fields': ('api_key', 'model_name', 'base_url')}),
        ('Comportamento', {'fields': ('temperature', 'max_tokens', 'system_prompt')}),
    )


@admin.register(AIPrompt)
class AIPromptAdmin(admin.ModelAdmin):
    list_display = ('name', 'task', 'is_active', 'is_default', 'updated_at')
    list_filter = ('task', 'is_active', 'is_default')
    search_fields = ('name', 'description', 'prompt')
    fieldsets = (
        ('Identificação', {'fields': ('name', 'task', 'description', 'is_active', 'is_default')}),
        ('Prompt', {'fields': ('prompt',)}),
    )
