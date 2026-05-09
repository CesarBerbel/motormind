from django.core.exceptions import ValidationError
from django.test import TestCase

from workshop.models import Part, normalize_part_unit


class PartUnitNormalizationTests(TestCase):
    def test_normalizes_common_unit_aliases(self):
        self.assertEqual(normalize_part_unit("UNIDADE"), "un")
        self.assertEqual(normalize_part_unit("peças"), "pc")
        self.assertEqual(normalize_part_unit("caixa"), "cx")
        self.assertEqual(normalize_part_unit("quilo"), "kg")

    def test_part_save_normalizes_unit(self):
        part = Part.objects.create(sku="P-TEST-001", name="Filtro teste", unit="UNIDADE", sale_price="10.00")
        self.assertEqual(part.unit, "un")

    def test_rejects_unknown_unit(self):
        part = Part(sku="P-TEST-002", name="Peça inválida", unit="saco")
        with self.assertRaises(ValidationError):
            part.full_clean()
