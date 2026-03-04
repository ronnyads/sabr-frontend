export type RoleValue = number | string | null | undefined;

export function normalizeRole(role: RoleValue): number {
  if (typeof role === 'number' && Number.isFinite(role)) {
    return Math.trunc(role);
  }

  const raw = (role ?? '').toString().trim();
  if (!raw) {
    return 0;
  }

  const parsed = Number(raw);
  if (!Number.isNaN(parsed)) {
    return Math.trunc(parsed);
  }

  switch (raw.toLowerCase()) {
    case 'admin':
      return 1;
    case 'finance':
      return 2;
    case 'superadmin':
      return 4;
    default:
      return 0;
  }
}

export function roleLabelTenant(role: RoleValue): string {
  const normalized = normalizeRole(role);

  if ((normalized & 4) === 4) {
    return 'Owner (Cliente)';
  }

  if ((normalized & 1) === 1 && (normalized & 2) === 2) {
    return 'Admin + Financeiro (Cliente)';
  }

  if ((normalized & 1) === 1) {
    return 'Admin (Cliente)';
  }

  if ((normalized & 2) === 2) {
    return 'Financeiro (Cliente)';
  }

  return `Desconhecido (${stringifyRole(role)})`;
}

export function roleLabelSystem(role: RoleValue): string {
  const normalized = normalizeRole(role);

  if ((normalized & 4) === 4) {
    return 'SuperAdmin (Sistema)';
  }

  if ((normalized & 1) === 1 && (normalized & 2) === 2) {
    return 'Admin + Finance (Sistema)';
  }

  if ((normalized & 1) === 1) {
    return 'Admin (Sistema)';
  }

  if ((normalized & 2) === 2) {
    return 'Finance (Sistema)';
  }

  return `Desconhecido (${stringifyRole(role)})`;
}

function stringifyRole(role: RoleValue): string {
  return (role ?? 'n/a').toString();
}
