from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from workshop.models import WorkOrderPayment

from .services import refresh_receivable_for_work_order


@receiver(post_save, sender=WorkOrderPayment)
def update_receivable_after_payment_save(sender, instance, **kwargs):
    refresh_receivable_for_work_order(instance.work_order)


@receiver(post_delete, sender=WorkOrderPayment)
def update_receivable_after_payment_delete(sender, instance, **kwargs):
    refresh_receivable_for_work_order(instance.work_order)
