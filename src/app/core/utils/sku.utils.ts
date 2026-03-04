export const SKU_REGEX = /^[A-Z0-9][A-Z0-9\-_/]{0,63}$/;

export function normalizeSkuUppercase(input: string | null | undefined): string {
  return (input ?? '').trim().toUpperCase();
}

export function isValidSku(input: string | null | undefined): boolean {
  return SKU_REGEX.test(normalizeSkuUppercase(input));
}
