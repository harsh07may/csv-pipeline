"""Pure functions for processing a CSV: validate, normalize, apply business rules.

Nothing here talks to the database or object storage, so everything is easy to test.
"""
from collections.abc import Sequence
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from email_validator import EmailNotValidError, validate_email

# --- Constants ---
REQUIRED_COLUMNS = ["order_id", "customer_email", "amount", "currency", "order_date", "country"]
ACCEPTED_DATE_FORMATS = ["%Y-%m-%d", "%d/%m/%Y"]   # ISO and day/month/year
# Money is Decimal, never float: 0.1 + 0.2 is exactly 0.3, and rounding is predictable.
CENT = Decimal("0.01")
MAX_AMOUNT = Decimal("9999999999.99")   # the largest value a NUMERIC(12, 2) column can hold
HIGH_VALUE_USD = Decimal("1000")        # orders at or above this (in USD) are flagged high value
USD_RATES = {"USD": Decimal("1"),
             "EUR": Decimal("1.08"),
             "GBP": Decimal("1.27"),
             "INR": Decimal("0.012")}


# --- Errors ---
class RowError(ValueError):
    """A single row is bad. The file as a whole can still be processed."""


# --- File-level validation ---
def check_header(columns: Sequence[str]) -> None:
    """Raise if any required column is missing from the header.

    A missing column is a *file-level* error: nothing can be processed, so fail fast.
    """
    missing = []
    for column in REQUIRED_COLUMNS:
        if column not in columns:
            missing.append(column)

    if missing:
        raise ValueError(f"CSV is missing required columns: {', '.join(missing)}")


# --- Row-level parsing and business rules ---
def _parse_date(date_string: str) -> date:
    """Parse a date in any accepted format, trying each one in order.

    Raises RowError if none of the formats match.
    """
    for date_format in ACCEPTED_DATE_FORMATS:
        try:
            return datetime.strptime(date_string, date_format).date()
        except ValueError:
            continue  # wrong format, try the next one

    raise RowError(f"unrecognised date '{date_string}' (use YYYY-MM-DD or DD/MM/YYYY)")


def _parse_amount(amount_string: str) -> Decimal:
    """Parse an amount to the cent, accepting thousands separators like "1,250.00"."""
    try:
        amount = Decimal(amount_string.replace(",", ""))
        if not amount.is_finite():   # "nan" and "inf" parse fine but are not amounts
            raise InvalidOperation
        return amount.quantize(CENT, rounding=ROUND_HALF_UP)   # also fails for absurdly large values
    except InvalidOperation:
        raise RowError(f"amount '{amount_string}' is not a number") from None


# --- Processing ---
def process_row(raw_row: dict, today: date | None = None) -> dict:
    """Validate and normalize a single row of the CSV.

    Raises RowError if the row is invalid.
    """
    today = today or datetime.now(timezone.utc).date()   # UTC, same as the DB timestamps

    # 1) Normalize: strip whitespace, lowercase emails, uppercase currency and country codes
    cleaned_row = {}
    for column in REQUIRED_COLUMNS:
        value = (raw_row.get(column) or "").strip()   # missing cell becomes ""
        if not value:
            raise RowError(f"'{column}' is empty")
        cleaned_row[column] = value

    cleaned_row["customer_email"] = cleaned_row["customer_email"].lower()
    cleaned_row["currency"] = cleaned_row["currency"].upper()
    cleaned_row["country"] = cleaned_row["country"].upper()

    # 2) Validate: is the data well-formed?
    email = cleaned_row["customer_email"]
    country = cleaned_row["country"]
    currency = cleaned_row["currency"]

    try:
        # Syntax check only: no DNS lookups, so this stays fast and offline.
        validate_email(email, check_deliverability=False)
    except EmailNotValidError:
        raise RowError(f"invalid email '{email}'") from None
    if len(country) != 2:
        raise RowError(f"country must be a 2-letter code, got '{country}'")
    if currency not in USD_RATES:
        raise RowError(f"unsupported currency '{currency}'")

    amount = _parse_amount(cleaned_row["amount"])
    order_date = _parse_date(cleaned_row["order_date"])

    # 3) Business rules: well-formed, but does it make sense for *our* business?
    if amount <= 0:
        raise RowError("amount must be greater than zero")
    if order_date > today:
        raise RowError(f"order date {order_date.isoformat()} is in the future")

    amount_usd = (amount * USD_RATES[currency]).quantize(CENT, rounding=ROUND_HALF_UP)
    if max(amount, amount_usd) > MAX_AMOUNT:
        raise RowError("amount is too large")

    # Keys match the Order model's columns, so the worker can insert this dict directly.
    return {
        "order_id": cleaned_row["order_id"],
        "customer_email": email,
        "country": country,
        "currency": currency,
        "amount": amount,
        "amount_usd": amount_usd,
        "order_date": order_date,                       # a real date object, one canonical form
        "is_high_value": amount_usd >= HIGH_VALUE_USD,  # derived field
    }
