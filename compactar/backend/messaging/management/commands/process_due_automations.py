from django.core.management.base import BaseCommand

from messaging.services import process_due_automations


class Command(BaseCommand):
    help = "Processa automacoes de mensagem que estao vencidas."

    def handle(self, *args, **options):
        processed = process_due_automations()
        self.stdout.write(self.style.SUCCESS(f"Automacoes processadas: {len(processed)}"))
