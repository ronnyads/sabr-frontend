export function formatBrlFromCents(value: number | bigint | null | undefined): string {
  if (value == null) {
    return 'R$ 0,00';
  }

  const numeric = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isFinite(numeric)) {
    return 'R$ 0,00';
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numeric / 100);
}

export function parseBrlToCents(value: string | number | null | undefined): number {
  if (value == null) {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(0, Math.round(value * 100)) : 0;
  }

  const normalized = value
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();

  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.round(parsed * 100));
}
