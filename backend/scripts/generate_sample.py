# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///

"""Generate a demo orders CSV with some deliberately broken rows.
Usage (from the repo root):  uv run backend/scripts/generate_sample.py orders.csv 5000
The block above is inline script metadata (PEP 723): uv reads it to pick a Python
and install any listed dependencies. This script needs none.
"""
import csv
import random
import sys
from datetime import date, timedelta
path = sys.argv[1] if len(sys.argv) > 1 else "orders.csv"
count = int(sys.argv[2]) if len(sys.argv) > 2 else 5000
random.seed(42)   # same file every time
with open(path, "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["order_id", "customer_email", "amount", "currency", "order_date", "country"])
    for i in range(1, count + 1):
        day = date(2025, 1, 1) + timedelta(days=random.randint(0, 540))
        row = [
            f"ORD-{i:06d}",
            f"  User{i}@Example.com ",                            # needs trimming + lowercasing
            f"{random.uniform(5, 2500):.2f}",
            random.choice(["USD", "eur", " INR ", "GBP"]),        # mixed case / whitespace
            random.choice([day.isoformat(), day.strftime("%d/%m/%Y")]),
            random.choice(["us", "IN", "de", "GB"]),
        ]
        r = random.random()                                       # ~7% broken rows
        if r < 0.02:   row[2] = "abc"                             # not a number
        elif r < 0.03: row[1] = "not-an-email"
        elif r < 0.04: row[2] = f"-{row[2]}"                      # negative amount
        elif r < 0.05: row[0] = f"ORD-{max(i - 1, 1):06d}"        # duplicate id
        elif r < 0.06: row[4] = "2031-01-01"                      # future date
        elif r < 0.07: row[3] = "JPY"                             # unsupported currency
        writer.writerow(row)
print(f"Wrote {count} rows to {path}")