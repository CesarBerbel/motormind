from django.db import migrations, models


def create_default_prompts(apps, schema_editor):
    AIPrompt = apps.get_model('ai_assistant', 'AIPrompt')
    defaults = [
        ('customer_report', 'Melhorar relato do cliente', 'Organize o relato do cliente em texto claro, mantendo os sintomas informados, ordem cronológica quando possível e sem criar fatos novos.'),
        ('diagnosis', 'Diagnóstico técnico completo', 'Redija um diagnóstico técnico claro, com problema identificado, evidências observadas, testes/inspeções mencionados no texto base e recomendação. Não invente medições, peças ou defeitos.'),
        ('service_done', 'Descrição do serviço realizado', 'Redija a descrição do serviço executado de forma profissional, objetiva e compreensível para o cliente, destacando o que foi feito e cuidados/recomendações quando houver base para isso.'),
        ('template_email', 'Template de email para cliente', 'Crie ou melhore um texto de email cordial e profissional. Preserve todas as variáveis entre chaves duplas, como {{ nome_cliente }}, {{ numero_os }} e {{ approval_url }}.'),
        ('template_whatsapp', 'Template de WhatsApp para cliente', 'Crie ou melhore uma mensagem curta de WhatsApp, cordial e direta. Preserve todas as variáveis entre chaves duplas.'),
        ('general', 'Texto profissional de oficina', 'Melhore o texto para ficar claro, profissional e objetivo, sem alterar fatos ou inventar informações.'),
    ]
    for task, name, prompt in defaults:
        AIPrompt.objects.get_or_create(
            task=task,
            name=name,
            defaults={'prompt': prompt, 'is_active': True, 'is_default': True},
        )


class Migration(migrations.Migration):
    dependencies = [('ai_assistant', '0001_initial')]

    operations = [
        migrations.AlterField(
            model_name='aiproviderconfiguration',
            name='max_tokens',
            field=models.PositiveIntegerField(default=2500, help_text='Limite maximo de tokens da resposta. Use valores maiores para textos longos de diagnostico, servico e templates.'),
        ),
        migrations.CreateModel(
            name='AIPrompt',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120)),
                ('task', models.CharField(choices=[('customer_report', 'Relato do cliente'), ('diagnosis', 'Diagnóstico técnico'), ('service_done', 'Serviço realizado'), ('email', 'Texto de email'), ('whatsapp', 'Texto de WhatsApp'), ('template_email', 'Template de email'), ('template_whatsapp', 'Template de WhatsApp'), ('general', 'Geral')], default='general', max_length=30)),
                ('description', models.CharField(blank=True, max_length=255)),
                ('prompt', models.TextField(help_text='Instrucao que sera combinada com o texto base e contexto enviados pela tela.')),
                ('is_active', models.BooleanField(default=True)),
                ('is_default', models.BooleanField(default=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'Prompt de IA',
                'verbose_name_plural': 'Prompts de IA',
                'ordering': ['task', 'name'],
            },
        ),
        migrations.AddIndex(model_name='aiprompt', index=models.Index(fields=['task', 'is_active'], name='ai_assista_task_6af6d4_idx')),
        migrations.RunPython(create_default_prompts, migrations.RunPython.noop),
    ]
