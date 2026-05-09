from django.db import models


class AIProviderConfiguration(models.Model):
    class Provider(models.TextChoices):
        OPENAI = 'openai', 'OpenAI'
        GEMINI = 'gemini', 'Gemini'

    provider = models.CharField(max_length=20, choices=Provider.choices, unique=True)
    display_name = models.CharField(max_length=120, blank=True)
    api_key = models.CharField(max_length=500, blank=True)
    model_name = models.CharField(max_length=120, blank=True)
    base_url = models.URLField(blank=True)
    is_enabled = models.BooleanField(default=False)
    is_default = models.BooleanField(default=False)
    temperature = models.DecimalField(max_digits=3, decimal_places=2, default=0.40)
    max_tokens = models.PositiveIntegerField(
        default=2500,
        help_text='Limite maximo de tokens da resposta. Use valores maiores para textos longos de diagnostico, servico e templates.',
    )
    system_prompt = models.TextField(
        blank=True,
        default='Voce e um assistente de oficina mecanica. Escreva textos claros, profissionais, objetivos e em portugues do Brasil. Nao invente diagnosticos, pecas ou valores que nao foram informados.',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Configuração de IA'
        verbose_name_plural = 'Configurações de IA'
        ordering = ['provider']

    def save(self, *args, **kwargs):
        if self.is_default:
            AIProviderConfiguration.objects.exclude(pk=self.pk).update(is_default=False)
        if not self.display_name:
            self.display_name = self.get_provider_display()
        if not self.model_name:
            self.model_name = 'gpt-4o-mini' if self.provider == self.Provider.OPENAI else 'gemini-1.5-flash'
        super().save(*args, **kwargs)

    def __str__(self):
        suffix = ' - padrão' if self.is_default else ''
        status = 'ativo' if self.is_enabled else 'inativo'
        return f'{self.get_provider_display()} ({status}){suffix}'


class AIPrompt(models.Model):
    class Task(models.TextChoices):
        CUSTOMER_REPORT = 'customer_report', 'Relato do cliente'
        DIAGNOSIS = 'diagnosis', 'Diagnóstico técnico'
        SERVICE_DONE = 'service_done', 'Serviço realizado'
        EMAIL = 'email', 'Texto de email'
        WHATSAPP = 'whatsapp', 'Texto de WhatsApp'
        TEMPLATE_EMAIL = 'template_email', 'Template de email'
        TEMPLATE_WHATSAPP = 'template_whatsapp', 'Template de WhatsApp'
        GENERAL = 'general', 'Geral'

    name = models.CharField(max_length=120)
    task = models.CharField(max_length=30, choices=Task.choices, default=Task.GENERAL)
    description = models.CharField(max_length=255, blank=True)
    prompt = models.TextField(help_text='Instrucao que sera combinada com o texto base e contexto enviados pela tela.')
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Prompt de IA'
        verbose_name_plural = 'Prompts de IA'
        ordering = ['task', 'name']
        indexes = [models.Index(fields=['task', 'is_active'])]

    def save(self, *args, **kwargs):
        if self.is_default:
            AIPrompt.objects.filter(task=self.task).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)

    def __str__(self):
        status = 'ativo' if self.is_active else 'inativo'
        default = ' - padrão' if self.is_default else ''
        return f'{self.name} ({self.get_task_display()}, {status}){default}'
