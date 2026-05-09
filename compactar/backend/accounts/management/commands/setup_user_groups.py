from django.core.management.base import BaseCommand

from accounts.roles import ROLE_GROUP_NAMES
from accounts.services import setup_role_groups


class Command(BaseCommand):
    help = "Cria/atualiza os grupos de usuários e suas permissões padrão."

    def handle(self, *args, **options):
        setup_role_groups()
        for group_name in ROLE_GROUP_NAMES.values():
            self.stdout.write(self.style.SUCCESS(f"Grupo atualizado: {group_name}"))
