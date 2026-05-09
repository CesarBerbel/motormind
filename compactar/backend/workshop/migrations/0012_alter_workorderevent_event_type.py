# Generated manually after adding WorkOrderEvent PHOTO_ADDED.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workshop", "0011_part_photo_workorderphoto"),
    ]

    operations = [
        migrations.AlterField(
            model_name="workorderevent",
            name="event_type",
            field=models.CharField(choices=[("created", "Criada"), ("updated", "Atualizada"), ("status_changed", "Status alterado"), ("message_sent", "Mensagem enviada"), ("payment_added", "Pagamento registrado"), ("inventory_consumed", "Estoque consumido"), ("photo_added", "Foto adicionada"), ("service_started", "Servico iniciado"), ("service_finished", "Servico concluido"), ("service_quality_checked", "Servico conferido"), ("note", "Nota"), ("error", "Erro")], max_length=40),
        ),
    ]
