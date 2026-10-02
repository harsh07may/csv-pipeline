"""Run from backend/:  uv run pytest"""
from datetime import date
from decimal import Decimal
import pytest
from app.core.processing import RowError, process_row


TODAY = date(2026, 1, 1)
GOOD = {"order_id": "A1", "customer_email": " Ann@X.com ", "amount": "1,200",
        "currency": "eur", "order_date": "31/12/2025", "country": "de"}


def test_normalizes_and_applies_rules():
    row = process_row(GOOD, today=TODAY)
    assert row["customer_email"] == "ann@x.com"
    assert row["currency"] == "EUR" and row["country"] == "DE"
    assert row["order_date"] == date(2025, 12, 31)
    assert row["amount_usd"] == 1296.0 and row["is_high_value"] is True


@pytest.mark.parametrize("field,value,message", [
    ("amount", "abc", "not a number"),
    ("amount", "nan", "not a number"),
    ("amount", "inf", "not a number"),
    ("amount", "1e30", "not a number"),
    ("amount", "99999999999", "too large"),
    ("amount", "0.004", "greater than zero"),   # rounds to 0.00
    ("amount", "-5", "greater than zero"),
    ("currency", "JPY", "unsupported currency"),
    ("order_date", "2027-01-01", "in the future"),
    ("customer_email", "nope", "invalid email"),
])


def test_rejects_bad_rows(field, value, message):
    with pytest.raises(RowError, match=message):
        process_row({**GOOD, field: value}, today=TODAY)

def test_money_is_exact_decimal_rounded_half_up():
    row = process_row({**GOOD, "amount": "10.005", "currency": "usd"}, today=TODAY)
    assert row["amount"] == Decimal("10.01")        # float would give 10.0 (10.005 is 10.00499...)
    assert row["amount_usd"] == Decimal("10.01")
    assert isinstance(row["amount"], Decimal)
