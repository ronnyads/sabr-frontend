const SAO_PAULO_UTC_OFFSET_HOURS = 3;

export function brazilianDayBoundary(value: string, exclusiveEnd = false): Date {
  const [year, month, day] = value.split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return new Date(Number.NaN);
  return new Date(Date.UTC(year, month - 1, day + (exclusiveEnd ? 1 : 0), SAO_PAULO_UTC_OFFSET_HOURS));
}
