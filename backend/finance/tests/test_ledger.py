from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from finance.ledger import record_ledger_entry
from finance.models import FinancialLedgerEntry


class FinancialLedgerTests(TestCase):
    def test_records_credit_entry(self):
        user = get_user_model().objects.create_user(username="financeiro", password="senha-forte-123")
        entry = record_ledger_entry(
            entry_type=FinancialLedgerEntry.EntryType.CREDIT,
            origin=FinancialLedgerEntry.Origin.MANUAL,
            description="Recebimento teste",
            amount="150.25",
            payment_method="pix",
            actor=user,
        )
        self.assertIsNotNone(entry)
        self.assertEqual(entry.amount, Decimal("150.25"))
        self.assertEqual(entry.entry_type, FinancialLedgerEntry.EntryType.CREDIT)
        self.assertEqual(entry.created_by, user)

    def test_ignores_zero_amount(self):
        entry = record_ledger_entry(
            entry_type=FinancialLedgerEntry.EntryType.CREDIT,
            origin=FinancialLedgerEntry.Origin.MANUAL,
            description="Valor zerado",
            amount="0.00",
        )
        self.assertIsNone(entry)
