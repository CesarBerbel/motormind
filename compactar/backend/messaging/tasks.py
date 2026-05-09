from celery import shared_task

from .models import MessageLog
from .services import process_due_automations, send_message_log


@shared_task(name="messaging.tasks.send_message_log_task")
def send_message_log_task(log_id):
    log = MessageLog.objects.get(pk=log_id)
    send_message_log(log)
    return log.status


@shared_task(name="messaging.tasks.process_due_automations_task")
def process_due_automations_task():
    return process_due_automations()
