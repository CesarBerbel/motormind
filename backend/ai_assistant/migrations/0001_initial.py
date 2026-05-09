from django.db import migrations, models


def create_default_configs(apps, schema_editor):
    AIProviderConfiguration = apps.get_model('ai_assistant', 'AIProviderConfiguration')
    AIProviderConfiguration.objects.get_or_create(
        provider='openai',
        defaults={'display_name': 'OpenAI', 'model_name': 'gpt-4o-mini', 'is_enabled': False, 'is_default': True},
    )
    AIProviderConfiguration.objects.get_or_create(
        provider='gemini',
        defaults={'display_name': 'Gemini', 'model_name': 'gemini-1.5-flash', 'is_enabled': False, 'is_default': False},
    )


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name='AIProviderConfiguration',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('provider', models.CharField(choices=[('openai', 'OpenAI'), ('gemini', 'Gemini')], max_length=20, unique=True)),
                ('display_name', models.CharField(blank=True, max_length=120)),
                ('api_key', models.CharField(blank=True, max_length=500)),
                ('model_name', models.CharField(blank=True, max_length=120)),
                ('base_url', models.URLField(blank=True)),
                ('is_enabled', models.BooleanField(default=False)),
                ('is_default', models.BooleanField(default=False)),
                ('temperature', models.DecimalField(decimal_places=2, default=0.4, max_digits=3)),
                ('max_tokens', models.PositiveIntegerField(default=700)),
                ('system_prompt', models.TextField(blank=True, default='Voce e um assistente de oficina mecanica. Escreva textos claros, profissionais, objetivos e em portugues do Brasil. Nao invente diagnosticos, pecas ou valores que nao foram informados.')),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'verbose_name': 'Configuração de IA', 'verbose_name_plural': 'Configurações de IA', 'ordering': ['provider']},
        ),
        migrations.RunPython(create_default_configs, migrations.RunPython.noop),
    ]
