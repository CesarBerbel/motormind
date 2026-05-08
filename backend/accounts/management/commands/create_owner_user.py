from getpass import getpass

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from accounts.roles import ROLE_OWNER
from accounts.services import apply_role_to_user, setup_role_groups

User = get_user_model()


class Command(BaseCommand):
    help = "Cria ou atualiza o usuário Dono. O Dono é superuser/staff e deve ser criado somente por comando."

    def add_arguments(self, parser):
        parser.add_argument("--username", required=True, help="Login do usuário Dono.")
        parser.add_argument("--email", default="", help="Email do usuário Dono.")
        parser.add_argument("--password", default="", help="Senha inicial. Se omitida, será solicitada no terminal.")
        parser.add_argument("--first-name", default="Dono", help="Primeiro nome.")
        parser.add_argument("--last-name", default="", help="Sobrenome.")

    def handle(self, *args, **options):
        password = options["password"]
        if not password:
            password = getpass("Senha do Dono: ")
            confirmation = getpass("Confirme a senha do Dono: ")
            if password != confirmation:
                raise CommandError("As senhas informadas não conferem.")
        if not password:
            raise CommandError("A senha é obrigatória.")
        setup_role_groups()
        user, created = User.objects.get_or_create(username=options["username"])
        user.email = options["email"]
        user.first_name = options["first_name"]
        user.last_name = options["last_name"]
        user.is_active = True
        user.set_password(password)
        user.save()
        apply_role_to_user(user, ROLE_OWNER)
        action = "criado" if created else "atualizado"
        self.stdout.write(self.style.SUCCESS(f"Usuário Dono {action}: {user.username}"))
