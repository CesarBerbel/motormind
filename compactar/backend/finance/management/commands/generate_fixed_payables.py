from datetime import datetime

from django.core.management.base import BaseCommand
from django.utils import timezone

from finance.models import AccountPayable
from finance.services import generate_next_fixed_payable


class Command(BaseCommand):
    help = "Gera as próximas competências das contas fixas mensais até uma data limite."

    def add_arguments(self, parser):
        parser.add_argument(
            "--until",
            default="",
            help="Data limite no formato YYYY-MM-DD. Se omitida, usa a data de hoje.",
        )

    def handle(self, *args, **options):
        until = datetime.strptime(options["until"], "%Y-%m-%d").date() if options["until"] else timezone.localdate()
        candidates = AccountPayable.objects.filter(
            recurrence_type=AccountPayable.RecurrenceType.FIXED_MONTHLY,
            next_generation_date__isnull=False,
            next_generation_date__lte=until,
        ).exclude(status=AccountPayable.Status.CANCELLED).order_by("next_generation_date", "id")
        created = 0
        skipped = 0
        for account in candidates:
            try:
                generate_next_fixed_payable(account)
                created += 1
            except Exception as exc:  # noqa: BLE001 - comando operacional precisa continuar nos demais registros
                skipped += 1
                self.stderr.write(f"Conta {account.number} ignorada: {exc}")
        self.stdout.write(self.style.SUCCESS(f"Competências fixas geradas: {created}. Ignoradas: {skipped}."))
