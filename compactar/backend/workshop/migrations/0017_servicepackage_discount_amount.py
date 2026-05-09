# Generated manually for package-level service package discount.

from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import migrations, models


def move_item_discounts_to_package(apps, schema_editor):
    ServicePackage = apps.get_model("workshop", "ServicePackage")
    ServicePackageItem = apps.get_model("workshop", "ServicePackageItem")
    for package in ServicePackage.objects.all():
        total_discount = Decimal("0.00")
        for item in ServicePackageItem.objects.filter(service_package=package):
            total_discount += item.discount_amount or Decimal("0.00")
        if total_discount:
            package.discount_amount = total_discount
            package.save(update_fields=["discount_amount"])
            ServicePackageItem.objects.filter(service_package=package).update(discount_amount=Decimal("0.00"))


def restore_package_discounts_to_first_item(apps, schema_editor):
    ServicePackage = apps.get_model("workshop", "ServicePackage")
    ServicePackageItem = apps.get_model("workshop", "ServicePackageItem")
    for package in ServicePackage.objects.all():
        if package.discount_amount:
            first_item = ServicePackageItem.objects.filter(service_package=package).order_by("position", "id").first()
            if first_item:
                first_item.discount_amount = package.discount_amount
                first_item.save(update_fields=["discount_amount"])


class Migration(migrations.Migration):

    dependencies = [
        ("workshop", "0016_workshopprofile_delivery_signature_enabled_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="servicepackage",
            name="discount_amount",
            field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12, validators=[MinValueValidator(Decimal("0.00"))]),
        ),
        migrations.RunPython(move_item_discounts_to_package, restore_package_discounts_to_first_item),
    ]
