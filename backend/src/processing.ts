// Pure functions for processing a CSV: validate, normalize, apply business rules.
// Nothing here talks to the database or object storage.
import Decimal from "decimal.js";
import validator from "validator";

// Same precision as the Python Decimal context this replaces (28 digits).
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// --- Constants ---
export const REQUIRED_COLUMNS = ["order_id", "customer_email", "amount", "currency", "order_date", "country"];
// Money is Decimal, never float: 0.1 + 0.2 is exactly 0.3, and rounding is predictable.
const MAX_AMOUNT = new Decimal("9999999999.99"); // the largest value a NUMERIC(12, 2) column can hold
const HIGH_VALUE_USD = new Decimal(1000); // orders at or above this (in USD) are flagged high value
const USD_RATES: Record<string, Decimal> = {
  USD: new Decimal("1"),
  EUR: new Decimal("1.08"),
  GBP: new Decimal("1.27"),
  INR: new Decimal("0.012"),
};
// Reserved domains no real customer has (email-validator rejects these too).
const SPECIAL_USE_TLDS = ["arpa", "invalid", "local", "localhost", "onion", "test"];
const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
// Largest magnitude that still fits 28 significant digits once rounded to cents.
const AMOUNT_LIMIT = new Decimal("1e26");

// --- Errors ---
// A single row is bad. The file as a whole can still be processed.
export class RowError extends Error {}

export interface ProcessedRow {
  order_id: string;
  customer_email: string;
  country: string;
  currency: string;
  amount: string;
  amount_usd: string;
  order_date: string;
  is_high_value: boolean;
}

// --- File-level validation ---
// A missing column is a *file-level* error: nothing can be processed, so fail fast.
export function checkHeader(columns: readonly string[]): void {
  const missing = [];
  for (const column of REQUIRED_COLUMNS) {
    if (!columns.includes(column)) missing.push(column);
  }
  if (missing.length > 0) throw new Error(`CSV is missing required columns: ${missing.join(", ")}`);
}

// Today's date in UTC as YYYY-MM-DD (same as the DB timestamps).
export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- Processing ---
// Validate and normalize a single row of the CSV. Throws RowError if the row is invalid.
// `today` is a YYYY-MM-DD string; it is a parameter so the rule is easy to check.
export function processRow(rawRow: Record<string, string | undefined>, today: string = utcToday()): ProcessedRow {
  //* 1) Normalize: strip whitespace, lowercase emails, uppercase currency and country codes
  const cleaned: Record<string, string> = {};
  for (const column of REQUIRED_COLUMNS) {
    const value = (rawRow[column] ?? "").trim(); // missing cell becomes ""
    if (!value) throw new RowError(`'${column}' is empty`);
    cleaned[column] = value;
  }

  const email = cleaned.customer_email.toLowerCase();
  const currency = cleaned.currency.toUpperCase();
  const country = cleaned.country.toUpperCase();

  //* 2) Validate: is the data well-formed? (syntax only: no DNS lookups, so this stays fast and offline)
  const tld = email.slice(email.lastIndexOf(".") + 1);
  if (!validator.isEmail(email) || SPECIAL_USE_TLDS.includes(tld)) throw new RowError(`invalid email '${email}'`);
  if ([...country].length !== 2) throw new RowError(`country must be a 2-letter code, got '${country}'`);
  if (!(currency in USD_RATES)) throw new RowError(`unsupported currency '${currency}'`);

  // Amount: accepts thousands separators like "1,250.00"; "nan", "inf" and absurd values are not amounts.
  const amountText = cleaned.amount.replaceAll(",", "");
  if (!NUMBER_PATTERN.test(amountText)) throw new RowError(`amount '${cleaned.amount}' is not a number`);
  const parsed = new Decimal(amountText);
  if (!parsed.isFinite() || parsed.abs().gte(AMOUNT_LIMIT)) throw new RowError(`amount '${cleaned.amount}' is not a number`);
  const amount = parsed.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // Date: ISO (YYYY-MM-DD) or day/month/year (DD/MM/YYYY), tried in that order.
  let year: number, month: number, day: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(cleaned.order_date);
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(cleaned.order_date);
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [year, month, day] = [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])];
  else throw new RowError(`unrecognised date '${cleaned.order_date}' (use YYYY-MM-DD or DD/MM/YYYY)`);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (year < 1 || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new RowError(`unrecognised date '${cleaned.order_date}' (use YYYY-MM-DD or DD/MM/YYYY)`);
  }
  const orderDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  //* 3) Business rules: well-formed, but does it make sense for *our* business?
  if (amount.lte(0)) throw new RowError("amount must be greater than zero");
  if (orderDate > today) throw new RowError(`order date ${orderDate} is in the future`);

  const amountUsd = amount.times(USD_RATES[currency]).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (Decimal.max(amount, amountUsd).gt(MAX_AMOUNT)) throw new RowError("amount is too large");

  // Keys match the orders table's columns, so the worker can insert this object directly.
  return {
    order_id: cleaned.order_id,
    customer_email: email,
    country,
    currency,
    amount: amount.toFixed(2),
    amount_usd: amountUsd.toFixed(2),
    order_date: orderDate, // one canonical form
    is_high_value: amountUsd.gte(HIGH_VALUE_USD), // derived field
  };
}
