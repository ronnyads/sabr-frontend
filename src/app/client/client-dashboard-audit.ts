import { AuditCoverageResult, ClientProfitabilityResult } from '../core/services/client-sales-dashboard.service';

export type AuditResultStatus = 'PARTIAL' | 'PROFIT' | 'LOSS';

export interface ResolvedAuditPresentation {
  status: AuditResultStatus;
  label: string;
  isPartial: boolean;
  costCoverage: AuditCoverageResult;
  financialCoverage: AuditCoverageResult;
}

const completePlanStatuses = new Set(['COMPLETED']);
const completeReconciliationStatuses = new Set(['COMPLETED', 'RECONCILED', 'CURRENT']);

export function resolveAuditPresentation(finance: ClientProfitabilityResult): ResolvedAuditPresentation {
  const costCoverage = normalizeCoverage(finance.costCoverage, finance.coverage.costPercent);
  const financialCoverage = normalizeCoverage(finance.financialCoverage, finance.coverage.confirmedPercent);
  const planIsPending = !!finance.pendingCorrectionPlan
    && !completePlanStatuses.has(finance.pendingCorrectionPlan.status.toUpperCase());
  const reconciliationIsPending = isExplicitlyPending(finance.reconciliationStatus);
  const projectionIsPending = isExplicitlyPending(finance.projectionStatus);
  const hasPendingComponents = (finance.incompleteReasons?.length ?? 0) > 0
    || finance.unallocatedCents !== 0
    || costCoverage.percent < 100
    || financialCoverage.percent < 100
    || planIsPending
    || reconciliationIsPending
    || projectionIsPending
    || finance.auditResultStatus === 'PARTIAL';

  const status: AuditResultStatus = hasPendingComponents
    ? 'PARTIAL'
    : finance.operationalProfitCents < 0 ? 'LOSS' : 'PROFIT';

  return {
    status,
    isPartial: status === 'PARTIAL',
    label: status === 'PARTIAL'
      ? 'Resultado auditado parcial'
      : status === 'LOSS' ? 'Prejuízo operacional auditado' : 'Lucro operacional auditado',
    costCoverage,
    financialCoverage
  };
}

function isExplicitlyPending(status: string | null | undefined): boolean {
  return !!status && !completeReconciliationStatuses.has(status.toUpperCase());
}

function normalizeCoverage(value: AuditCoverageResult | undefined, fallbackPercent: number): AuditCoverageResult {
  const resolved = finiteNonNegative(value?.resolved);
  const total = finiteNonNegative(value?.total);
  const rawPercent = Number.isFinite(value?.percent) ? Number(value?.percent) : fallbackPercent;
  return {
    resolved,
    total,
    percent: Math.min(100, Math.max(0, Number.isFinite(rawPercent) ? rawPercent : 0))
  };
}

function finiteNonNegative(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}
