from django.db import migrations, models
import django.db.models.deletion


def migrate_service_categories(apps, schema_editor):
    GeneralCategory = apps.get_model("workshop", "GeneralCategory")
    WorkshopService = apps.get_model("workshop", "WorkshopService")

    for service in WorkshopService.objects.exclude(legacy_category_name=""):
        name = (service.legacy_category_name or "").strip()
        if not name:
            continue
        category, _ = GeneralCategory.objects.get_or_create(
            type="service",
            name=name,
            defaults={"code": "", "description": "Migrada automaticamente do campo texto do serviço.", "is_active": True},
        )
        service.category_id = category.id
        service.save(update_fields=["category"])


def reverse_service_categories(apps, schema_editor):
    WorkshopService = apps.get_model("workshop", "WorkshopService")
    for service in WorkshopService.objects.select_related("category").all():
        if service.category_id and not service.legacy_category_name:
            service.legacy_category_name = service.category.name
            service.save(update_fields=["legacy_category_name"])


class Migration(migrations.Migration):

    dependencies = [
        ("workshop", "0004_servicepackage_workorder_manual_discount_amount_and_more"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="part",
            options={"ordering": ["category__name", "name", "sku"]},
        ),
        migrations.AlterModelOptions(
            name="workshopservice",
            options={"ordering": ["category__name", "name"]},
        ),
        migrations.RenameField(
            model_name="workshopservice",
            old_name="category",
            new_name="legacy_category_name",
        ),
        migrations.AddField(
            model_name="workshopservice",
            name="category",
            field=models.ForeignKey(
                blank=True,
                limit_choices_to={"type": "service"},
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="workshop_services",
                to="workshop.generalcategory",
            ),
        ),
        migrations.AddField(
            model_name="part",
            name="category",
            field=models.ForeignKey(
                blank=True,
                limit_choices_to={"type": "part"},
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="parts",
                to="workshop.generalcategory",
            ),
        ),
        migrations.RunPython(migrate_service_categories, reverse_service_categories),
    ]
