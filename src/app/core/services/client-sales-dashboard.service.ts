import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ClientSalesDailyResult { date: string; orders: number; units: number; revenue: number; }
export interface ClientSalesSkuResult {
  sellerId: number;
  channelItemId: string;
  channelVariationId?: string | null;
  sku: string;
  productName?: string | null;
  orders: number;
  units: number;
  revenue: number;
  isMapped: boolean;
  overdueOrders: number;
  dueTodayOrders: number;
  dueTodayUnits: number;
  earliestDeadlineAt?: string | null;
  mappingPriority: string;
  mappingReason: string;
  isExternalSupplier?: boolean;
  hasExternalCost?: boolean;
  externalSupplierName?: string | null;
  externalUnitCostCents?: number | null;
  externalCurrencyId?: string | null;
}
export interface ExternalSupplierSalesSummary {
  products: number; orders: number; units: number; grossRevenue: number;
  productsWithCost: number; productsPendingCost: number;
}
export interface ClientSalesStatusResult { status: string; orders: number; percentage: number; }
export interface ClientShippingTodaySkuResult {
  sku: string;
  productName?: string | null;
  orders: number;
  units: number;
  isMapped: boolean;
}
export interface ClientShippingTodayResult {
  dueDate: string;
  totalOrders: number;
  paidOrders: number;
  pendingPaymentOrders: number;
  totalUnits: number;
  unmappedUnits: number;
  externalProductsCount?: number;
  externalUnits?: number;
  externalGrossRevenue?: number;
  products: ClientShippingTodaySkuResult[];
}

export interface ClientSalesDashboardResult {
  from: string;
  to: string;
  generatedAt: string;
  lastSyncedAt?: string | null;
  currencyId: string;
  totalOrders: number;
  paidOrders: number;
  totalSalesAmount: number;
  cancelledSalesAmount: number;
  totalUnits: number;
  grossRevenue: number;
  marketplaceFees: number;
  netRevenue: number;
  averageTicket: number;
  cancelledOrders: number;
  refundedOrders: number;
  unmappedUnits: number;
  ordersChangePercent: number;
  revenueChangePercent: number;
  dailySales: ClientSalesDailyResult[];
  totalProducts?: number;
  products?: ClientSalesSkuResult[];
  topSkus: ClientSalesSkuResult[];
  statuses: ClientSalesStatusResult[];
  shippingToday: ClientShippingTodayResult;
  externalSupplier?: ExternalSupplierSalesSummary;
}

export interface FinancialCoverageResult {
  skuPercent: number; costPercent: number; freightPercent: number; operationalPercent: number;
  confirmedPercent: number; itemAllocationPercent: number; overallPercent: number;
}
export interface FinancialDivergenceResult {
  estimatedCents: number; confirmedCents: number; absoluteCents: number; percentage?: number | null;
  componentsCents: Record<string, number>;
}
export interface ClientProfitabilityResult {
  from: string; to: string; generatedAt: string; lastOperationalSyncAt?: string | null; lastBillingSyncAt?: string | null;
  currencyId: string; maturity: string; grossRevenueCents: number; estimatedEconomicNetCents: number;
  marketplaceNetAmountCents: number; marketplaceFeesCents: number; sellerShippingCents: number;
  refundsCents: number; adjustmentsCents: number; productCostMaturity: string;
  productCostCents: number; reconciledConfirmedValueCents: number; operationalProfitCents: number; sellerReportedEstimatedTaxCents: number;
  operationalMarginPct?: number | null;
  profitAfterSellerTaxEstimateCents: number; unallocatedCents: number; coverage: FinancialCoverageResult;
  divergence: FinancialDivergenceResult; incompleteReasons: string[];
}
export interface FinancialSyncJobResult {
  jobId: string; sellerId: number; jobType: string; status: string; rangeFrom: string; rangeTo: string;
  total: number; processed: number; lastError?: string | null; createdAt: string; completedAt?: string | null;
}
export interface FinancialSyncEnqueueResult { jobs: FinancialSyncJobResult[]; }
export interface ClientProfitabilityOrder {
  orderId: string; externalOrderId: string; sellerId: number; orderStatus: string; maturity: string;
  grossRevenueCents: number; estimatedEconomicNetCents: number;
  operationalProfitCents: number; incompleteReasons: string[];
}
export interface ClientProfitabilityOrderEntry {
  entryId: string; entryType: string; status: string; amountCents: number;
  sourceEndpoint: string; isActiveHead: boolean; economicOccurredAt: string;
  financialConfirmedAt?: string | null;
}
export interface ClientProfitabilityOrderDetail extends ClientProfitabilityOrder {
  entries: ClientProfitabilityOrderEntry[];
}

@Injectable({ providedIn: 'root' })
export class ClientSalesDashboardService {
  constructor(private readonly http: HttpClient) {}

  getSales(options: { from: Date; to: Date; provider?: string | null }): Observable<ClientSalesDashboardResult> {
    let params = new HttpParams().set('from', options.from.toISOString()).set('to', options.to.toISOString());
    if (options.provider) params = params.set('provider', options.provider);
    return this.http.get<ClientSalesDashboardResult>(`${environment.apiBaseUrl}/client/dashboard/sales`, { params });
  }

  getProfitability(options: { from: Date; to: Date; provider?: string | null }): Observable<ClientProfitabilityResult> {
    let params = new HttpParams().set('from', options.from.toISOString()).set('to', options.to.toISOString());
    if (options.provider) params = params.set('provider', options.provider);
    return this.http.get<ClientProfitabilityResult>(`${environment.apiBaseUrl}/client/dashboard/profitability`, { params });
  }

  getProfitabilityOrders(from: Date, to: Date): Observable<ClientProfitabilityOrder[]> {
    const params = new HttpParams().set('from', from.toISOString()).set('to', to.toISOString());
    return this.http.get<ClientProfitabilityOrder[]>(`${environment.apiBaseUrl}/client/dashboard/profitability/orders`, { params });
  }

  getProfitabilityOrder(orderId: string): Observable<ClientProfitabilityOrderDetail> {
    return this.http.get<ClientProfitabilityOrderDetail>(`${environment.apiBaseUrl}/client/dashboard/profitability/orders/${orderId}`);
  }

  startSync(): Observable<FinancialSyncEnqueueResult> {
    return this.http.post<FinancialSyncEnqueueResult>(`${environment.apiBaseUrl}/client/dashboard/sync`, {});
  }

  getSync(jobId: string): Observable<FinancialSyncJobResult> {
    return this.http.get<FinancialSyncJobResult>(`${environment.apiBaseUrl}/client/dashboard/sync/${jobId}`);
  }
}
