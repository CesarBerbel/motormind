import re
from pathlib import Path

from django.core.management.base import BaseCommand

from workshop.models import GeneralCategory, Part, PartBrand

DEFAULT_CATEGORY_NAMES = [
    "Motor",
    "Lubrificação",
    "Arrefecimento",
    "Freios",
    "Suspensão",
    "Direção",
    "Transmissão",
    "Embreagem",
    "Ignição",
    "Injeção eletrônica",
    "Elétrica",
    "Iluminação",
    "Escapamento",
    "Filtros",
    "Pneus e rodas",
    "Fluidos e químicos",
    "Acessórios",
    "Serviços/consumíveis",
]


def normalize_lookup_name(value):
    return re.sub(r"\s+", "", (value or "").strip()).lower()


class Command(BaseCommand):
    help = "Cria/atualiza categorias padrão e marcas iniciais do autocomplete de peças."

    def add_arguments(self, parser):
        parser.add_argument(
            "--skip-brands",
            action="store_true",
            help="Não importa a lista inicial de marcas de peças.",
        )

    def handle(self, *args, **options):
        categories_created = 0
        categories_reactivated = 0
        for category_type in (GeneralCategory.CategoryType.PART, GeneralCategory.CategoryType.SERVICE):
            for name in DEFAULT_CATEGORY_NAMES:
                category, created = GeneralCategory.objects.get_or_create(
                    type=category_type,
                    name=name,
                    defaults={
                        "code": "",
                        "description": "Categoria padrão criada automaticamente pelo sistema.",
                        "is_active": True,
                    },
                )
                if created:
                    categories_created += 1
                elif not category.is_active:
                    category.is_active = True
                    category.save(update_fields=["is_active", "updated_at"])
                    categories_reactivated += 1

        brands_created = 0
        if not options["skip_brands"]:
            data_path = Path(__file__).resolve().parents[2] / "data" / "part_brands_1000.txt"
            for name in [line.strip() for line in data_path.read_text(encoding="utf-8").splitlines() if line.strip()]:
                brand, created = PartBrand.get_or_create_from_name(name, source=PartBrand.Source.SEED)
                if created:
                    brand.notes = "Marca inicial do autocomplete de peças."
                    brand.save(update_fields=["notes", "updated_at"])
                    brands_created += 1

        existing_created = 0
        for name in Part.objects.exclude(brand="").values_list("brand", flat=True).distinct():
            _, created = PartBrand.get_or_create_from_name(name, source=PartBrand.Source.MANUAL)
            if created:
                existing_created += 1

        self.stdout.write(self.style.SUCCESS(
            f"Categorias criadas: {categories_created}; categorias reativadas: {categories_reactivated}; "
            f"marcas criadas da carga inicial: {brands_created}; marcas criadas a partir de peças existentes: {existing_created}."
        ))
