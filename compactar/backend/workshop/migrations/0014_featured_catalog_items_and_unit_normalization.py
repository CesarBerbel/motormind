# Generated manually to support preferred OS catalog items and controlled part units.

from django.db import migrations, models


UNIT_ALIASES = {
    "": "un", "und": "un", "unid": "un", "unidade": "un", "unidades": "un", "unit": "un", "units": "un",
    "peca": "pc", "pecas": "pc", "peça": "pc", "peças": "pc", "pcs": "pc", "pç": "pc", "pçs": "pc",
    "caixa": "cx", "caixas": "cx", "pacote": "pct", "pacotes": "pct",
    "quilo": "kg", "quilograma": "kg", "quilogramas": "kg",
    "metro": "m", "metros": "m", "centimetro": "cm", "centímetros": "cm", "centimetros": "cm",
    "litro": "l", "litros": "l",
}
ALLOWED_UNITS = {"un", "pc", "kit", "par", "jogo", "cx", "pct", "m", "cm", "l", "ml", "kg", "g"}


def normalize_unit(value):
    compact = "".join(str(value or "").strip().lower().split())
    normalized = UNIT_ALIASES.get(compact, compact or "un")
    return normalized if normalized in ALLOWED_UNITS else "un"


def normalize_existing_part_units(apps, schema_editor):
    Part = apps.get_model("workshop", "Part")
    for part in Part.objects.all().only("id", "unit"):
        normalized = normalize_unit(part.unit)
        if part.unit != normalized:
            part.unit = normalized
            part.save(update_fields=["unit"])


class Migration(migrations.Migration):

    dependencies = [("workshop", "0013_workshopservice_photo")]

    operations = [
        migrations.AddField(
            model_name="workshopservice",
            name="is_featured",
            field=models.BooleanField(db_index=True, default=False, verbose_name="Mais usado/preferido na OS"),
        ),
        migrations.AddField(
            model_name="part",
            name="is_featured",
            field=models.BooleanField(db_index=True, default=False, verbose_name="Mais usada/preferida na OS"),
        ),
        migrations.AlterField(
            model_name="part",
            name="unit",
            field=models.CharField(default="un", max_length=20, verbose_name="Unidade de medida"),
        ),
        migrations.RunPython(normalize_existing_part_units, migrations.RunPython.noop),
    ]
