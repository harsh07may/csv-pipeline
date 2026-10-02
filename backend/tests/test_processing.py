"""Run from backend/:  uv run pytest"""
from datetime import date
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
    ("amount", "-5", "greater than zero"),
    ("currency", "JPY", "unsupported currency"),
    ("order_date", "2027-01-01", "in the future"),
    ("customer_email", "nope", "invalid email"),
])


def test_rejects_bad_rows(field, value, message):
    with pytest.raises(RowError, match=message):
        process_row({**GOOD, field: value}, today=TODAY)