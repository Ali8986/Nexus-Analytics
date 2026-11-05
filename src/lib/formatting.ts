export function formatCurrency(
  value: number,
  currency = "USD",
  maximumFractionDigits = 0,
) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits,
  }).format(value);
}
