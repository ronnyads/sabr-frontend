import { MercadoLivreHistorySellerStatusResult } from '../core/services/mercado-livre-integration.service';
import { presentHistoryCoverage } from './client-ml-history-coverage.presenter';

describe('presentHistoryCoverage', () => {
  const seller = (
    changes: Partial<MercadoLivreHistorySellerStatusResult> = {}
  ): MercadoLivreHistorySellerStatusResult => ({
    sellerId: '123',
    nickname: 'Loja teste',
    status: 'INITIAL_PENDING',
    discoveredUniqueOrderIds: 10,
    localImportedOrderIds: 0,
    resolvedUnavailableOrderIds: 0,
    unresolvedGapOrderIds: 0,
    completedWindows: 0,
    totalWindows: 12,
    ...changes
  });

  it('only marks a seller complete after windows and discovered IDs are reconciled', () => {
    expect(presentHistoryCoverage(seller({
      status: 'CURRENT',
      localImportedOrderIds: 9,
      completedWindows: 12
    })).complete).toBeFalse();

    expect(presentHistoryCoverage(seller({
      status: 'CURRENT',
      localImportedOrderIds: 9,
      resolvedUnavailableOrderIds: 1,
      completedWindows: 12
    })).complete).toBeTrue();
  });

  it('keeps CURRENT partial when an unresolved gap remains', () => {
    const result = presentHistoryCoverage(seller({
      status: 'CURRENT',
      localImportedOrderIds: 10,
      unresolvedGapOrderIds: 1,
      completedWindows: 12
    }));

    expect(result.complete).toBeFalse();
    expect(result.label).toBe('Histórico pendente');
  });

  it('does not use remoteReportedTotal as reconciliation progress', () => {
    const result = presentHistoryCoverage(seller({
      status: 'BACKFILLING',
      remoteReportedTotal: 10000,
      localImportedOrderIds: 4,
      resolvedUnavailableOrderIds: 1
    }));

    expect(result.progressPct).toBe(50);
    expect(result.resolvedOrderIds).toBe(5);
  });

  it('reports progress from windows before any order ID is discovered', () => {
    const result = presentHistoryCoverage(seller({
      status: 'BACKFILLING',
      discoveredUniqueOrderIds: 0,
      completedWindows: 3,
      totalWindows: 12
    }));

    expect(result.progressPct).toBe(25);
  });
});
