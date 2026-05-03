// Keep in sync with src/Phub.Domain/Enums/*.cs
export const DocumentStatus = {
  Pending: 1,
  Approved: 2,
  Rejected: 3,
  UnderReview: 4
} as const;

// PJ required checklist types
export const REQUIRED_PJ_DOCUMENT_TYPES = [1, 2, 3, 4] as const;

export type DocumentStatusValue = (typeof DocumentStatus)[keyof typeof DocumentStatus];

export function normalizeDocumentStatus(status: number | string | null | undefined): number {
  if (typeof status === 'number') {
    return Number.isFinite(status) ? status : 0;
  }

  const raw = (status ?? '').toString().trim();
  if (!raw) {
    return 0;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function documentStatusLabel(status: number | string | null | undefined): string {
  switch (normalizeDocumentStatus(status)) {
    case DocumentStatus.Pending:
      return 'Enviado';
    case DocumentStatus.Approved:
      return 'Aprovado';
    case DocumentStatus.Rejected:
      return 'Rejeitado';
    case DocumentStatus.UnderReview:
      return 'Em analise';
    default:
      return 'Desconhecido';
  }
}
