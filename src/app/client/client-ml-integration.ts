import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NbButtonModule, NbInputModule, NbSelectModule, NbToastrService } from '@nebular/theme';
import { Subject, finalize, takeUntil } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  MarketplaceMarkPaidResult,
  MarketplaceOrderListItemResult,
  MarketplacePaymentConfirmationRequiredResult,
  MercadoLivreListListingsResult,
  MercadoLivreListingItemDetails,
  MercadoLivreCreateMappingRequest,
  MercadoLivreIntegrationService,
  MercadoLivreIntegrationStatusResult,
  MercadoLivreListingMapResult,
  MercadoPagoFinancialStatusResult
} from '../core/services/mercado-livre-integration.service';
import { PageHeaderComponent } from '../shared/page-header/page-header.component';
import { UiStateComponent } from '../shared/ui-state/ui-state.component';
import { MarketplaceMappingsService } from '../core/services/marketplace-mappings.service';

interface RiskConfirmationState {
  orderId: string;
  payload: MarketplacePaymentConfirmationRequiredResult;
  processing: boolean;
}

@Component({
  selector: 'app-client-ml-integration',
  standalone: true,
  imports: [CommonModule, FormsModule, NbButtonModule, NbInputModule, NbSelectModule, PageHeaderComponent, UiStateComponent],
  templateUrl: './client-ml-integration.html',
  styleUrls: ['./client-ml-integration.scss']
})
export class ClientMlIntegration implements OnInit, OnDestroy {
  statusLoading = false;
  mappingsLoading = false;
  ordersLoading = false;
  listingsLoading = false;
  syncing = false;
  reconciling = false;
  disconnecting = false;
  resetting = false;
  showResetConfirm = false;
  creatingMapping = false;
  financialConnecting = false;
  financialProbing = false;
  financialStatusLoading = false;

  statusError: string | null = null;
  mappingsError: string | null = null;
  ordersError: string | null = null;
  listingsError: string | null = null;

  status: MercadoLivreIntegrationStatusResult | null = null;
  financialStatus: MercadoPagoFinancialStatusResult | null = null;
  mappings: MercadoLivreListingMapResult[] = [];
  orders: MarketplaceOrderListItemResult[] = [];
  listings: MercadoLivreListingItemDetails[] = [];

  selectedSellerId = '';
  mappingDraft: MercadoLivreCreateMappingRequest = {
    sellerId: '',
    mlItemId: '',
    mlVariationId: null,
    sabrVariantSku: ''
  };

  orderStatusFilter = '';
  orderLogisticTypeFilter = '';
  orderSkip = 0;
  readonly orderLimit = 20;
  orderTotal = 0;

  riskConfirmation: RiskConfirmationState | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly integrationService: MercadoLivreIntegrationService,
    private readonly marketplaceMappingsService: MarketplaceMappingsService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    this.consumeOAuthSignalFromQuery();
    const requestedSku = (this.route.snapshot.queryParamMap.get('mappingSku') ?? '').trim().toUpperCase();
    if (requestedSku) {
      this.mappingDraft.sabrVariantSku = requestedSku;
      setTimeout(() => document.getElementById('mappings')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
    this.loadStatusAndData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get connected(): boolean {
    return !!this.status?.connected;
  }

  get availableSellers(): string[] {
    return this.status?.connections?.map((item) => item.sellerId) ?? [];
  }

  get hasPreviousPage(): boolean {
    return this.orderSkip > 0;
  }

  get hasNextPage(): boolean {
    return this.orderSkip + this.orderLimit < this.orderTotal;
  }

  get emptyMappings(): boolean {
    return !this.mappingsLoading && !this.mappingsError && this.mappings.length === 0;
  }

  get emptyOrders(): boolean {
    return !this.ordersLoading && !this.ordersError && this.orders.length === 0;
  }

  get emptyListings(): boolean {
    return !this.listingsLoading && !this.listingsError && this.listings.length === 0;
  }

  trackMapping(_: number, item: MercadoLivreListingMapResult): string {
    return item.id;
  }

  trackOrder(_: number, item: MarketplaceOrderListItemResult): string {
    return item.id;
  }

  trackListing(_: number, item: MercadoLivreListingItemDetails): string {
    return item.id;
  }

  connect(): void {
    this.integrationService
      .connectUrl('/client/integrations/mercadolivre')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          if (!result?.url) {
            this.toastr.warning('URL de conexao nao retornada pela API.', 'Mercado Livre');
            return;
          }

          window.location.assign(result.url);
        },
        error: (error: HttpErrorResponse) => {
          this.logTraceableHttpError('connect_url', error);
          this.toastr.danger(this.buildErrorMessage('Falha ao iniciar OAuth do Mercado Livre.', error), 'Erro');
        }
      });
  }

  connectFinancial(): void {
    if (this.financialConnecting) return;
    this.financialConnecting = true;
    this.integrationService
      .mercadoPagoConnectUrl('/client/integrations/mercadolivre')
      .pipe(
        finalize(() => (this.financialConnecting = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          if (!result?.url) {
            this.toastr.warning('URL de autorização não retornada pela API.', 'Financeiro');
            return;
          }
          window.location.assign(result.url);
        },
        error: (error: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao iniciar autorização financeira.', error), 'Financeiro');
        }
      });
  }

  verifyFinancialBilling(): void {
    if (this.financialProbing || !this.financialStatus?.connected) return;
    this.financialProbing = true;
    this.integrationService.mercadoPagoProbeBilling()
      .pipe(finalize(() => (this.financialProbing = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (results) => {
          this.loadFinancialStatus();
          if (results.length > 0 && results.every((result) => result.verified)) {
            this.toastr.success('Acesso ao Billing confirmado. A conciliação dos valores é uma etapa separada.', 'Financeiro');
          } else {
            this.toastr.warning(this.billingProbeMessage(results[0]?.errorCode), 'Financeiro');
          }
        },
        error: (error: HttpErrorResponse) =>
          this.toastr.danger(this.buildErrorMessage('Não foi possível verificar o Billing.', error), 'Financeiro')
      });
  }

  billingProbeMessage(code?: string | null): string {
    if (code?.includes('ABUSE_PREVENTION_ERROR')) {
      return 'O provedor bloqueou preventivamente a consulta. Vamos reduzir a frequência e tentar depois; a autorização não foi invalidada.';
    }
    if (code?.startsWith('MP_BILLING_HTTP_403')) {
      return `O provedor negou a consulta ao Billing (403${code.includes(':') ? `: ${code.split(':')[1]}` : ''}). A conta está autorizada, mas o motivo exato precisa ser verificado.`;
    }
    switch (code) {
      case 'MP_BILLING_HTTP_401': return 'A autorização não foi aceita pelo Billing. Renove a conexão.';
      case 'MP_BILLING_RATE_LIMITED': return 'O provedor limitou as consultas. Aguarde alguns minutos e tente novamente.';
      case 'MP_REAUTHORIZATION_REQUIRED': return 'A autorização expirou. Conecte o Mercado Pago novamente.';
      case 'MP_BILLING_UNAVAILABLE': return 'O Billing do provedor está indisponível temporariamente.';
      case 'MP_BILLING_PROBE_FAILED': return 'Falha de comunicação com o Billing. Tente novamente.';
      default: return 'O acesso ao Billing ainda não foi confirmado; os valores continuam estimados.';
    }
  }

  openResetConfirm(): void {
    this.showResetConfirm = true;
  }

  cancelReset(): void {
    this.showResetConfirm = false;
  }

  confirmReset(): void {
    if (this.resetting) {
      return;
    }

    this.showResetConfirm = false;
    this.resetting = true;
    this.integrationService
      .reset()
      .pipe(
        finalize(() => (this.resetting = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
          this.toastr.success('Integracao Mercado Livre limpa com sucesso.', 'Mercado Livre');
          this.status = null;
          this.mappings = [];
          this.orders = [];
          this.listings = [];
          this.selectedSellerId = '';
          this.loadStatusAndData();
        },
        error: (error: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao limpar integracao.', error), 'Erro');
        }
      });
  }

  disconnect(): void {
    if (this.disconnecting) {
      return;
    }

    this.disconnecting = true;
    this.integrationService
      .disconnect(this.selectedSellerId || null)
      .pipe(
        finalize(() => (this.disconnecting = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
          this.toastr.success('Conexao removida com sucesso.', 'Mercado Livre');
          this.loadStatusAndData();
        },
        error: (error: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao desconectar.', error), 'Erro');
        }
      });
  }

  syncNow(): void {
    if (this.syncing) {
      return;
    }

    this.syncing = true;
    this.integrationService
      .syncNow(this.selectedSellerId || null)
      .pipe(
        finalize(() => (this.syncing = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          const job = result.jobs?.[0];
          this.toastr.success(
            job
              ? `Atualização iniciada em ${job.total} etapa(s). Ela continuará em segundo plano sem travar esta tela.`
              : 'A atualização já está em andamento para este seller.',
            'Mercado Livre'
          );
          this.loadStatusAndData();
        },
        error: (error: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha no sync manual.', error), 'Erro');
        }
      });
  }

  reconcileNow(): void {
    if (this.reconciling) {
      return;
    }

    this.reconciling = true;
    this.integrationService
      .reconcile(this.selectedSellerId || null)
      .pipe(
        finalize(() => (this.reconciling = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          this.toastr.success(
            `Reconciliacao concluida. Pedidos: ${result.ordersUpserted}, Itens: ${result.itemsUpserted}, Reservas: ${result.reservationsCreated}.`,
            'Mercado Livre'
          );
          this.loadStatusAndData();
        },
        error: (error: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha na reconciliacao.', error), 'Erro');
        }
      });
  }

  onSellerChanged(value: string): void {
    this.selectedSellerId = (value ?? '').trim();
    this.mappingDraft.sellerId = this.selectedSellerId;
    this.loadMappings();
    this.loadListings();
  }

  createMapping(): void {
    if (this.creatingMapping) {
      return;
    }

    const sellerId = (this.mappingDraft.sellerId ?? '').trim();
    const mlItemId = (this.mappingDraft.mlItemId ?? '').trim();
    const sabrVariantSku = (this.mappingDraft.sabrVariantSku ?? '').trim().toUpperCase();
    const mlVariationId = (this.mappingDraft.mlVariationId ?? '').trim();

    if (!sellerId || !mlItemId || !sabrVariantSku) {
      this.toastr.warning('Preencha seller, item e SKU para criar o mapping.', 'Dados obrigatorios');
      return;
    }

    this.creatingMapping = true;
    this.marketplaceMappingsService
      .createMapping({
        provider: 'MercadoLivre',
        sellerId,
        externalItemId: mlItemId,
        externalVariationId: mlVariationId || null,
        selectedCatalogSku: sabrVariantSku
      })
      .pipe(
        finalize(() => (this.creatingMapping = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
          this.mappingDraft.mlItemId = '';
          this.mappingDraft.mlVariationId = '';
          this.mappingDraft.sabrVariantSku = '';
          this.toastr.success('Mapping criado com sucesso.', 'Mercado Livre');
          this.loadStatusAndData();
        },
        error: (error: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao criar mapping.', error), 'Erro');
        }
      });
  }

  deleteMapping(id: string): void {
    this.integrationService
      .deleteMapping(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success('Mapping removido.', 'Mercado Livre');
          this.loadStatusAndData();
        },
        error: (error: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao remover mapping.', error), 'Erro');
        }
      });
  }

  applyOrderFilters(): void {
    this.orderSkip = 0;
    this.loadOrders();
  }

  clearOrderFilters(): void {
    this.orderStatusFilter = '';
    this.orderLogisticTypeFilter = '';
    this.orderSkip = 0;
    this.loadOrders();
  }

  previousPage(): void {
    if (!this.hasPreviousPage) {
      return;
    }

    this.orderSkip = Math.max(0, this.orderSkip - this.orderLimit);
    this.loadOrders();
  }

  nextPage(): void {
    if (!this.hasNextPage) {
      return;
    }

    this.orderSkip += this.orderLimit;
    this.loadOrders();
  }

  markPaid(order: MarketplaceOrderListItemResult, force: boolean): void {
    if (!order?.id) {
      return;
    }

    this.integrationService
      .markPaid(order.id, force)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result: MarketplaceMarkPaidResult) => {
          this.riskConfirmation = null;
          const suffix = result.alreadyPaid ? ' (pedido ja estava confirmado).' : '.';
          this.toastr.success(`Pedido marcado como pago no PrometheusHUB${suffix}`, 'Mercado Livre');
          this.loadStatusAndData();
        },
        error: (error: HttpErrorResponse) => {
          if (error.status === 409 && this.isConfirmationRequired(error)) {
            this.riskConfirmation = {
              orderId: order.id,
              payload: this.readConfirmationPayload(error),
              processing: false
            };
            return;
          }

          this.toastr.danger(this.buildErrorMessage('Falha ao marcar pedido como pago.', error), 'Erro');
        }
      });
  }

  closeRiskModal(): void {
    if (this.riskConfirmation?.processing) {
      return;
    }

    this.riskConfirmation = null;
  }

  confirmRiskPayment(): void {
    if (!this.riskConfirmation || this.riskConfirmation.processing) {
      return;
    }

    this.riskConfirmation.processing = true;
    this.integrationService
      .markPaid(this.riskConfirmation.orderId, true)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.warning('Pagamento confirmado fora de prazo/corte.', 'Atencao');
          this.riskConfirmation = null;
          this.loadStatusAndData();
        },
        error: (error: HttpErrorResponse) => {
          if (this.riskConfirmation) {
            this.riskConfirmation.processing = false;
          }
          this.toastr.danger(this.buildErrorMessage('Falha ao confirmar pagamento com risco.', error), 'Erro');
        }
      });
  }

  riskBadge(order: MarketplaceOrderListItemResult): string {
    if (!order.riskFlagsJson) {
      return '';
    }

    return order.riskFlagsJson.includes('PAID_AFTER_DEADLINE') ? 'RISCO/ATRASADO' : 'RISCO';
  }

  shippingLabel(order: MarketplaceOrderListItemResult): string {
    const mode = (order.shippingMode ?? '').trim();
    const logistic = (order.logisticType ?? '').trim();
    if (mode && logistic) {
      return `${mode} / ${logistic}`;
    }

    if (mode || logistic) {
      return mode || logistic;
    }

    return '-';
  }

  loadStatusAndData(): void {
    this.loadStatus(true);
    this.loadFinancialStatus();
    this.loadOrders();
  }

  private loadFinancialStatus(): void {
    this.financialStatusLoading = true;
    this.integrationService
      .mercadoPagoStatus()
      .pipe(
        finalize(() => (this.financialStatusLoading = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => (this.financialStatus = result),
        error: () => (this.financialStatus = null)
      });
  }

  private loadStatus(refreshDependentData: boolean): void {
    this.statusLoading = true;
    this.statusError = null;
    this.integrationService
      .status()
      .pipe(
        finalize(() => (this.statusLoading = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          this.status = result;

          const sellers = result.connections?.map((item) => item.sellerId) ?? [];
          if (sellers.length === 0) {
            this.selectedSellerId = '';
          } else if (!sellers.includes(this.selectedSellerId)) {
            this.selectedSellerId = sellers[0];
          }

          this.mappingDraft.sellerId = this.selectedSellerId;
          if (refreshDependentData) {
            this.loadMappings();
            this.loadListings();
          }
        },
        error: (error: HttpErrorResponse) => {
          this.status = null;
          this.mappings = [];
          this.listings = [];
          this.logTraceableHttpError('status', error);
          this.statusError = this.buildErrorMessage('Falha ao carregar status da integracao.', error);
        }
      });
  }

  loadMappings(): void {
    this.mappingsLoading = true;
    this.mappingsError = null;
    this.integrationService
      .listMappings(this.selectedSellerId || null)
      .pipe(
        finalize(() => (this.mappingsLoading = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          this.mappings = result ?? [];
        },
        error: (error: HttpErrorResponse) => {
          this.mappings = [];
          this.mappingsError = this.buildErrorMessage('Falha ao carregar mappings.', error);
        }
      });
  }

  loadListings(): void {
    this.listingsLoading = true;
    this.listingsError = null;
    this.integrationService
      .listListings(this.selectedSellerId || null)
      .pipe(
        finalize(() => (this.listingsLoading = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result: MercadoLivreListListingsResult) => {
          this.listings = result.items ?? [];
        },
        error: (error: HttpErrorResponse) => {
          this.listings = [];
          this.listingsError = this.buildErrorMessage('Falha ao carregar listings.', error);
        }
      });
  }

  loadOrders(): void {
    this.ordersLoading = true;
    this.ordersError = null;

    this.integrationService
      .listOrders({
        status: this.orderStatusFilter || null,
        logisticType: this.orderLogisticTypeFilter || null,
        skip: this.orderSkip,
        limit: this.orderLimit
      })
      .pipe(
        finalize(() => (this.ordersLoading = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (page) => {
          this.orders = page.items ?? [];
          this.orderTotal = page.total ?? 0;
        },
        error: (error: HttpErrorResponse) => {
          this.orders = [];
          this.orderTotal = 0;
          this.logTraceableHttpError('orders_list', error);
          this.ordersError = this.buildErrorMessage('Falha ao carregar pedidos importados.', error);
        }
      });
  }

  private logTraceableHttpError(operation: string, error: HttpErrorResponse): void {
    if (environment.production) {
      return;
    }

    const traceId =
      (typeof error.error?.traceId === 'string' ? error.error.traceId : null) ||
      error.headers?.get('X-Correlation-Id') ||
      error.headers?.get('x-correlation-id');
    console.error(`[ML][CLIENT] ${operation}_error`, {
      status: error.status,
      url: error.url ?? null,
      code: typeof error.error?.code === 'string' ? error.error.code : null,
      message: typeof error.error?.message === 'string' ? error.error.message : error.message,
      traceId
    });
  }

  private consumeOAuthSignalFromQuery(): void {
    const signal = (this.route.snapshot.queryParamMap.get('ml') ?? '').trim().toLowerCase();
    const mpSignal = (this.route.snapshot.queryParamMap.get('mp') ?? '').trim().toLowerCase();

    if (signal) {

      switch (signal) {
      case 'connected':
        this.toastr.success('Conta Mercado Livre conectada com sucesso.', 'Mercado Livre');
        break;
      case 'oauth_error':
        this.toastr.warning('Falha ao concluir OAuth. Clique em Conectar novamente.', 'Mercado Livre');
        break;
      case 'invalid_state':
        this.toastr.warning('Sessao de autorizacao expirada. Inicie a conexao novamente.', 'Mercado Livre');
        break;
      case 'missing_code_or_state':
        this.toastr.warning('Retorno OAuth invalido. Clique em Conectar novamente.', 'Mercado Livre');
        break;
      default:
        this.toastr.warning('Retorno de conexao Mercado Livre recebido.', 'Mercado Livre');
        break;
      }
    }

    if (mpSignal === 'connected') {
      this.toastr.success('Conta Mercado Pago autorizada. Acesso ao Billing ainda precisa ser verificado.', 'Financeiro');
    } else if (mpSignal === 'seller_mismatch') {
      this.toastr.warning('A conta Mercado Pago autorizada não pertence ao seller Mercado Livre conectado.', 'Financeiro');
    } else if (mpSignal) {
      this.toastr.warning('Não foi possível concluir a autorização financeira. Tente novamente.', 'Financeiro');
    }

    if (!signal && !mpSignal) return;

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ml: null, mp: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  private isConfirmationRequired(error: HttpErrorResponse): boolean {
    const code = typeof error.error?.code === 'string' ? error.error.code : '';
    return code.trim().toUpperCase() === 'PAYMENT_CONFIRMATION_REQUIRED';
  }

  private readConfirmationPayload(error: HttpErrorResponse): MarketplacePaymentConfirmationRequiredResult {
    const payload = error.error?.errors as Partial<MarketplacePaymentConfirmationRequiredResult> | null;
    return {
      shipByDeadlineAt: payload?.shipByDeadlineAt ?? null,
      cutoffLocalTime: payload?.cutoffLocalTime ?? '',
      nowLocal: payload?.nowLocal ?? '',
      message: payload?.message ?? 'Pagamento apos prazo/corte. Confirmacao obrigatoria.'
    };
  }

  private buildErrorMessage(baseMessage: string, error: HttpErrorResponse): string {
    const apiMessage = typeof error.error?.message === 'string' ? error.error.message : null;
    const traceId =
      (typeof error.error?.traceId === 'string' ? error.error.traceId : null) ||
      error.headers?.get('X-Correlation-Id');
    const message = apiMessage && apiMessage.trim() ? apiMessage.trim() : baseMessage;
    return traceId ? `${message} (traceId: ${traceId})` : message;
  }
}
