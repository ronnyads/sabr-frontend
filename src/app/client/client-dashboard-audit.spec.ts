import { ClientProfitabilityResult } from '../core/services/client-sales-dashboard.service';
import { resolveAuditPresentation } from './client-dashboard-audit';

describe('resolveAuditPresentation', () => {
  const result = (changes: Partial<ClientProfitabilityResult> = {}): ClientProfitabilityResult => ({
    from: '2026-09-01T03:00:00Z', to: '2026-09-24T03:00:00Z', generatedAt: '2026-09-24T12:00:00Z',
    currencyId: 'BRL', maturity: 'CONFIRMADO', grossRevenueCents: 10000, estimatedEconomicNetCents: 8000,
    marketplaceNetAmountCents: 8000, marketplaceFeesCents: 2000, sellerShippingCents: 0, refundsCents: 0,
    adjustmentsCents: 0, productCostMaturity: 'CONFIRMADO', productCostCents: -3000,
    reconciledConfirmedValueCents: 8000, operationalProfitCents: 5000, sellerReportedEstimatedTaxCents: 0,
    profitAfterSellerTaxEstimateCents: 5000, unallocatedCents: 0,
    coverage: { skuPercent: 100, costPercent: 100, freightPercent: 100, operationalPercent: 100,
      confirmedPercent: 100, itemAllocationPercent: 100, overallPercent: 100 },
    divergence: { estimatedCents: 8000, confirmedCents: 8000, absoluteCents: 0, componentsCents: {} },
    incompleteReasons: [],
    ...changes
  });

  it('uses a final profit label only with complete cost and financial coverage', () => {
    expect(resolveAuditPresentation(result()).label).toBe('Lucro operacional auditado');
  });

  it('keeps a negative value partial when financial coverage is incomplete', () => {
    const presentation = resolveAuditPresentation(result({
      operationalProfitCents: -100,
      financialCoverage: { resolved: 90, total: 100, percent: 90 }
    }));
    expect(presentation.status).toBe('PARTIAL');
    expect(presentation.label).toBe('Resultado auditado parcial');
  });

  it('does not publish a final result while a correction plan is pending', () => {
    const presentation = resolveAuditPresentation(result({
      pendingCorrectionPlan: { planId: 'plan-1', status: 'PENDING_ACTIVATION' }
    }));
    expect(presentation.isPartial).toBeTrue();
  });

  it('does not publish a final result while reconciliation is pending', () => {
    expect(resolveAuditPresentation(result({ reconciliationStatus: 'RECONCILING' })).isPartial).toBeTrue();
  });

  it('uses the audited loss label only after full coverage', () => {
    expect(resolveAuditPresentation(result({ operationalProfitCents: -100 })).label)
      .toBe('Prejuízo operacional auditado');
  });
});
