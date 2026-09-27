import { MercadoLivreHistorySellerStatusResult } from '../core/services/mercado-livre-integration.service';

export interface HistoryCoveragePresentation {
  label: string;
  description: string;
  tone: 'neutral' | 'progress' | 'warning' | 'success' | 'danger';
  complete: boolean;
  progressPct: number;
  resolvedOrderIds: number;
}

export function presentHistoryCoverage(seller: MercadoLivreHistorySellerStatusResult): HistoryCoveragePresentation {
  const discovered = nonNegative(seller.discoveredUniqueOrderIds);
  const imported = nonNegative(seller.localImportedOrderIds);
  const unavailable = nonNegative(seller.resolvedUnavailableOrderIds);
  const gaps = nonNegative(seller.unresolvedGapOrderIds);
  const completedWindows = nonNegative(seller.completedWindows);
  const totalWindows = nonNegative(seller.totalWindows);
  const resolved = Math.min(discovered, imported + unavailable);
  const progressPct = discovered > 0
    ? Math.min(100, Math.round((resolved / discovered) * 100))
    : totalWindows > 0
      ? Math.min(100, Math.round((completedWindows / totalWindows) * 100))
      : 0;
  const state = (seller.status ?? '').trim().toUpperCase();
  const complete = state === 'CURRENT'
    && gaps === 0
    && completedWindows >= totalWindows
    && resolved >= discovered;

  if (complete) {
    return {
      label: 'Histórico completo',
      description: 'Todas as janelas foram reconciliadas e todos os pedidos descobertos foram resolvidos.',
      tone: 'success', complete, progressPct: 100, resolvedOrderIds: resolved
    };
  }

  switch (state) {
    case 'BACKFILLING':
      return {
        label: 'Importando histórico',
        description: 'A carga continua em segundo plano. Os números exibidos ainda são parciais.',
        tone: 'progress', complete, progressPct, resolvedOrderIds: resolved
      };
    case 'PARTIAL_WITH_GAPS':
      return {
        label: 'Dados parciais',
        description: `${gaps} pedido(s) ainda precisam ser recuperados ou classificados.`,
        tone: 'warning', complete, progressPct, resolvedOrderIds: resolved
      };
    case 'FAILED':
      return {
        label: 'Importação interrompida',
        description: 'O progresso foi preservado. Inicie novamente para continuar somente as janelas incompletas.',
        tone: 'danger', complete, progressPct, resolvedOrderIds: resolved
      };
    default:
      return {
        label: 'Histórico pendente',
        description: 'Inicie a busca do histórico disponível desta conta.',
        tone: 'neutral', complete, progressPct, resolvedOrderIds: resolved
      };
  }
}

function nonNegative(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}
