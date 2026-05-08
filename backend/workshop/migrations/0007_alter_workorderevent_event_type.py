# Generated manually to register technical event type choices in migrations.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workshop", "0006_technical_workshop_execution"),
    ]

    operations = [
        migrations.AlterField(
            model_name="workorderevent",
            name="event_type",
            field=models.CharField(choices=[("created", "Criada"), ("updated", "Atualizada"), ("status_changed", "Status alterado"), ("message_sent", "Mensagem enviada"), ("payment_added", "Pagamento registrado"), ("inventory_consumed", "Estoque consumido"), ("service_started", "Servico iniciado"), ("service_finished", "Servico concluido"), ("service_quality_checked", "Servico conferido"), ("note", "Nota"), ("error", "Erro")], max_length=40),
        ),
    ]
