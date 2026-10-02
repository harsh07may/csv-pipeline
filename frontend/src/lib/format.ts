// Number formatting in one place, so every figure on screen reads the same way.
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const count = new Intl.NumberFormat("en-US");
const byCurrency = new Map<string, Intl.NumberFormat>();

export const formatUsd = (value: number) => usd.format(value);
export const formatCount = (value: number) => count.format(value);

/** Amount in the row's own currency, e.g. "€1,250.00". Formatters are cached per currency. */
export function formatMoney(value: number, currency: string): string {
  let formatter = byCurrency.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
    byCurrency.set(currency, formatter);
  }
  return formatter.format(value);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
