import re
from pathlib import Path

from django.db import migrations, models


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


def load_seed_brands():
    path = Path(__file__).resolve().parent.parent / "data" / "part_brands_1000.txt"
    return [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def seed_categories_and_brands(apps, schema_editor):
    GeneralCategory = apps.get_model("workshop", "GeneralCategory")
    PartBrand = apps.get_model("workshop", "PartBrand")
    Part = apps.get_model("workshop", "Part")

    for category_type in ("part", "service"):
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
            if not created and not category.is_active:
                category.is_active = True
                category.save(update_fields=["is_active", "updated_at"])

    for name in load_seed_brands():
        normalized = normalize_lookup_name(name)
        if not normalized:
            continue
        brand, created = PartBrand.objects.get_or_create(
            normalized_name=normalized,
            defaults={"name": name, "source": "seed", "is_active": True, "notes": "Marca inicial do autocomplete de peças."},
        )
        if not created and not brand.is_active:
            brand.is_active = True
            brand.save(update_fields=["is_active", "updated_at"])

    existing_brand_names = (
        Part.objects.exclude(brand="")
        .values_list("brand", flat=True)
        .distinct()
    )
    for name in existing_brand_names:
        clean_name = (name or "").strip()
        normalized = normalize_lookup_name(clean_name)
        if not normalized:
            continue
        PartBrand.objects.get_or_create(
            normalized_name=normalized,
            defaults={"name": clean_name, "source": "manual", "is_active": True, "notes": "Criada automaticamente a partir de peças já cadastradas."},
        )


def unseed_categories_and_brands(apps, schema_editor):
    PartBrand = apps.get_model("workshop", "PartBrand")
    PartBrand.objects.filter(source="seed").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("workshop", "0007_alter_workorderevent_event_type"),
    ]

    operations = [
        migrations.CreateModel(
            name="PartBrand",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=120)),
                ("normalized_name", models.CharField(db_index=True, editable=False, max_length=120, unique=True)),
                ("source", models.CharField(choices=[("seed", "Carga inicial"), ("manual", "Cadastro manual")], default="manual", max_length=20)),
                ("is_active", models.BooleanField(default=True)),
                ("notes", models.TextField(blank=True)),
            ],
            options={
                "verbose_name": "marca de peça",
                "verbose_name_plural": "marcas de peças",
                "ordering": ["name"],
            },
        ),
        migrations.RunPython(seed_categories_and_brands, unseed_categories_and_brands),
    ]
