import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NbButtonModule } from '@nebular/theme';
import { catchError, finalize, forkJoin, interval, of, switchMap, takeWhile } from 'rxjs';
import { AuthService } from '../core/services/auth.service';
import {
  ClientSalesDashboardResult,
  ClientSalesDailyResult,
  ClientSalesDashboardService,
  ClientSalesSkuResult,
  ClientSalesStatusResult,
  ClientProfitabilityResult,
  ClientProfitabilityOrder,
  ClientProfitabilityOrderDetail
} from '../core/services/client-sales-dashboard.service';
import { ClientProfileService } from '../core/services/client-profile.service';
import { ClientStatus } from '../core/utils/client-status.constants';
import { MarketplaceMappingsService } from '../core/services/marketplace-mappings.service';

@Component({
  selector: 'app-client-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, NbButtonModule],
  templateUrl: './client-dashboard.html',
  styleUrls: ['./client-dashboard.scss']
})
export class ClientDashboard implements OnInit {
  readonly periods = [{ label: '7 dias', days: 7 }, { label: '30 dias', days: 30 }, { label: '90 dias', days: 90 }, { label: '12 meses', days: 365 }];
  selectedDays: number | null = 30;
  customRangeOpen = false;
  customFrom = '';
  customTo = '';
  customRangeError = '';
  readonly selectedProvider = 'MercadoLivre';
  loading = true;
  errorMessage = '';
  dashboard?: ClientSalesDashboardResult;
  profitability?: ClientProfitabilityResult;
  syncing = false;
  syncMessage = '';
  productSearch = '';
  productPage = 1;
  readonly productPageSize = 10;
  financeOrders: ClientProfitabilityOrder[] = [];
  financeOrdersLoading = false;
  financeOrdersError = '';
  financeOrderDetail?: ClientProfitabilityOrderDetail;
  externalProduct?: ClientSalesSkuResult;
  externalSupplierName = '';
  externalUnitCost: number | string | null = null;
  externalReason = '';
  externalSaving = false;
  externalError = '';

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly salesDashboard: ClientSalesDashboardService,
    private readonly profileService: ClientProfileService,
    private readonly marketplaceMappings: MarketplaceMappingsService
  ) {}

  ngOnInit(): void {
    this.refreshClientStatus();
    this.loadDashboard();
  }

  get userName(): string { return this.auth.currentUser?.name?.split(' ')[0] ?? 'Cliente'; }
  get status(): number { return this.auth.currentUser?.status ?? ClientStatus.PendingProfile; }
  get isApproved(): boolean { return this.status === ClientStatus.Approved; }
  get isAwaitingApproval(): boolean {
    return this.status === ClientStatus.UnderReview || this.status === ClientStatus.PendingAdminApproval;
  }
  get accessAlertTone(): 'warning' | 'info' | 'danger' {
    if (this.isAwaitingApproval) return 'info';
    if (this.status === ClientStatus.Rejected || this.status === ClientStatus.Inactive) return 'danger';
    return 'warning';
  }
  get accessAlertTitle(): string {
    switch (this.status) {
      case ClientStatus.PendingDocuments: return 'Documentos enviados';
      case ClientStatus.UnderReview:
      case ClientStatus.PendingAdminApproval: return 'Aguardando aprovação';
      case ClientStatus.Rejected: return 'Cadastro precisa de ajustes';
      case ClientStatus.Inactive: return 'Conta inativa';
      default: return 'Conclua seu cadastro';
    }
  }
  get accessAlertMessage(): string {
    switch (this.status) {
      case ClientStatus.PendingDocuments:
        return 'Confirme o envio para que seus documentos entrem na fila de análise.';
      case ClientStatus.UnderReview:
      case ClientStatus.PendingAdminApproval:
        return 'Seus dados e documentos foram recebidos e estão aguardando aprovação administrativa.';
      case ClientStatus.Rejected:
        return 'Revise os dados ou documentos indicados para continuar a liberação.';
      case ClientStatus.Inactive:
        return 'Entre em contato com o suporte para verificar a situação da conta.';
      default:
        return 'Finalize seus dados cadastrais para operar todos os recursos da plataforma.';
    }
  }
  get accessAlertAction(): string {
    if (this.status === ClientStatus.PendingDocuments) return 'Concluir envio';
    if (this.status === ClientStatus.Rejected) return 'Revisar pendências';
    return 'Continuar cadastro';
  }
  get showAccessAlertAction(): boolean {
    return this.status === ClientStatus.PendingProfile ||
      this.status === ClientStatus.PendingDocuments ||
      this.status === ClientStatus.Rejected;
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    this.refreshClientStatus();
  }

  get chartDays(): ClientSalesDailyResult[] {
    const days = this.dashboard?.dailySales ?? [];
    return days.length > 31 ? days.filter((_, index) => index % 3 === 0 || index === days.length - 1) : days;
  }

  get maxDailyRevenue(): number { return Math.max(1, ...this.chartDays.map(day => day.revenue)); }

  get filteredProducts(): ClientSalesSkuResult[] {
    const products = this.dashboard?.products ?? this.dashboard?.topSkus ?? [];
    const query = this.productSearch.trim().toLocaleLowerCase('pt-BR');
    if (!query) return products;
    return products.filter(product =>
      [product.productName, product.sku, product.channelItemId, product.channelVariationId]
        .some(value => value?.toLocaleLowerCase('pt-BR').includes(query)));
  }

  get productPageCount(): number { return Math.max(1, Math.ceil(this.filteredProducts.length / this.productPageSize)); }

  financialPendingLabels(reasons: string[]): string {
    const labels: Record<string, string> = {
      SKU_PENDING: 'produto sem vínculo com SKU interno',
      CATALOG_COST_PENDING: 'custo do produto não definido',
      GROSS_REVENUE_PENDING: 'valor da venda não informado pelo canal',
      MARKETPLACE_FEE_PENDING: 'tarifa do marketplace ainda não informada',
      SHIPPING_COST_PENDING: 'frete do seller ainda não conferido',
      EXTERNAL_COST_PENDING: 'custo do fornecedor externo não definido',
      UNALLOCATED_EXTERNAL_VALUE: 'valor externo sem identificação por produto'
    };
    return reasons.map(reason => labels[reason] ?? reason).join(' · ');
  }

  get pagedProducts(): ClientSalesSkuResult[] {
    const start = (this.productPage - 1) * this.productPageSize;
    return this.filteredProducts.slice(start, start + this.productPageSize);
  }

  get statusGradient(): string {
    const statuses = this.dashboard?.statuses ?? [];
    if (statuses.length === 0) return 'conic-gradient(#e8edf5 0 100%)';
    const colors = ['#16a57a', '#2f75ff', '#ffb547', '#f15b68', '#7c5cff', '#6f7d94'];
    let cursor = 0;
    const segments = statuses.map((status, index) => {
      const start = cursor;
      cursor += status.percentage;
      return `${colors[index % colors.length]} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${segments.join(', ')})`;
  }

  loadDashboard(): void {
    const { from, to } = this.activeRange;
    this.loading = true;
    this.errorMessage = '';
    forkJoin({
      sales: this.salesDashboard.getSales({ from, to, provider: this.selectedProvider }),
      // The financial module is feature-gated during rollout. A temporarily
      // unavailable projection must never take the operational sales dashboard down.
      profitability: this.salesDashboard.getProfitability({ from, to, provider: this.selectedProvider })
        .pipe(catchError(() => of(undefined)))
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: result => {
          this.dashboard = result.sales;
          this.profitability = result.profitability;
          this.financeOrders = [];
          this.financeOrderDetail = undefined;
          this.productPage = 1;
        },
        error: () => (this.errorMessage = 'Não foi possível atualizar suas vendas. Verifique a integração e tente novamente.')
      });
  }

  updateNow(): void {
    if (this.syncing) return;
    this.syncing = true;
    this.syncMessage = 'Criando atualização segura em partes…';
    this.salesDashboard.startSync().subscribe({
      next: result => {
        const jobs = result.jobs;
        if (!jobs.length) { this.syncing = false; this.syncMessage = 'Nenhum seller disponível para atualizar.'; return; }
        interval(2500).pipe(
          switchMap(() => forkJoin(jobs.map(job => this.salesDashboard.getSync(job.jobId)))),
          takeWhile(statuses => statuses.some(status => !['COMPLETED', 'FAILED'].includes(status.status)), true),
          finalize(() => (this.syncing = false))
        ).subscribe({
          next: statuses => {
            const failed = statuses.find(status => status.status === 'FAILED');
            const finished = statuses.every(status => ['COMPLETED', 'FAILED'].includes(status.status));
            const processed = statuses.reduce((sum, status) => sum + status.processed, 0);
            const total = statuses.reduce((sum, status) => sum + status.total, 0);
            this.syncMessage = failed ? `Atualização interrompida: ${failed.lastError || 'verifique a integração.'}`
              : finished ? 'Pedidos atualizados e conferência financeira concluída.'
              : `Atualizando pedidos e conferindo valores: ${processed}/${total} etapas.`;
            if (finished) this.loadDashboard();
          },
          error: () => (this.syncMessage = 'Não foi possível acompanhar a atualização.')
        });
      },
      error: () => { this.syncing = false; this.syncMessage = 'Não foi possível iniciar a atualização.'; }
    });
  }

  goToBilling(): void {
    void this.router.navigate(['/client/integrations/mercadopago']);
  }

  loadFinanceOrders(): void {
    const { from, to } = this.activeRange;
    this.financeOrdersLoading = true;
    this.financeOrdersError = '';
    this.salesDashboard.getProfitabilityOrders(from, to)
      .pipe(finalize(() => (this.financeOrdersLoading = false)))
      .subscribe({
        next: orders => this.financeOrders = [...orders].sort((a, b) => a.operationalProfitCents - b.operationalProfitCents).slice(0, 20),
        error: () => this.financeOrdersError = 'Não foi possível consultar os pedidos agora.'
      });
  }

  inspectFinanceOrder(orderId: string): void {
    this.salesDashboard.getProfitabilityOrder(orderId).subscribe({
      next: detail => this.financeOrderDetail = detail,
      error: () => this.financeOrdersError = 'Não foi possível abrir os lançamentos deste pedido.'
    });
  }

  reviewSku(sku: ClientSalesSkuResult): void {
    void this.router.navigate(['/client/my-products'], {
      queryParams: { focusSeller: sku.sellerId, focusItem: sku.channelItemId, focusVariation: sku.channelVariationId || null }
    });
  }

  manageExternalProduct(sku: ClientSalesSkuResult): void {
    this.externalProduct = sku;
    this.externalSupplierName = sku.externalSupplierName ?? '';
    this.externalUnitCost = sku.externalUnitCostCents == null ? null : sku.externalUnitCostCents / 100;
    this.externalReason = '';
    this.externalError = '';
  }

  closeExternalProduct(): void {
    if (this.externalSaving) return;
    this.externalProduct = undefined;
    this.externalError = '';
  }

  externalProductIsValid(): boolean {
    const cost = this.parseExternalCost(this.externalUnitCost);
    return this.externalSupplierName.trim().length >= 2
      && cost !== null
      && cost >= 0;
  }

  saveExternalProduct(): void {
    const sku = this.externalProduct;
    if (!sku || !this.externalProductIsValid() || this.externalSaving) return;
    this.externalSaving = true;
    this.externalError = '';
    this.marketplaceMappings.classifyExternalSupplier({
      provider: this.selectedProvider,
      sellerId: String(sku.sellerId),
      externalItemId: sku.channelItemId,
      externalVariationId: sku.channelVariationId ?? null,
      supplierName: this.externalSupplierName.trim(),
      reason: this.externalReason.trim() || null,
      unitCostCents: Math.round((this.parseExternalCost(this.externalUnitCost) ?? 0) * 100),
      currencyId: this.dashboard?.currencyId || 'BRL'
    }).pipe(finalize(() => (this.externalSaving = false))).subscribe({
      next: () => {
        this.closeExternalProduct();
        this.loadDashboard();
      },
      error: () => this.externalError = 'Não foi possível atualizar o custo externo. Tente novamente.'
    });
  }

  requireInternalMapping(): void {
    const sku = this.externalProduct;
    if (!sku || this.externalSaving) return;
    this.externalSaving = true;
    this.externalError = '';
    this.marketplaceMappings.removeExternalSupplierClassification({
      provider: this.selectedProvider,
      sellerId: sku.sellerId,
      externalItemId: sku.channelItemId,
      externalVariationId: sku.channelVariationId ?? null
    }).pipe(finalize(() => (this.externalSaving = false))).subscribe({
      next: () => {
        this.externalProduct = undefined;
        void this.router.navigate(['/client/my-products'], {
          queryParams: { focusSeller: sku.sellerId, focusItem: sku.channelItemId, focusVariation: sku.channelVariationId || null }
        });
      },
      error: () => this.externalError = 'Não foi possível remover a classificação externa. Tente novamente.'
    });
  }

  selectPeriod(days: number): void {
    if (this.selectedDays === days) return;
    this.selectedDays = days;
    this.customRangeOpen = false;
    this.customRangeError = '';
    this.loadDashboard();
  }

  openCustomRange(): void {
    const current = this.activeRange;
    this.customFrom ||= this.toDateInput(current.from);
    this.customTo ||= this.toDateInput(current.to);
    this.customRangeError = '';
    this.customRangeOpen = !this.customRangeOpen;
  }

  applyCustomRange(): void {
    if (!this.customFrom || !this.customTo) {
      this.customRangeError = 'Informe a data inicial e a data final.';
      return;
    }
    const from = this.dateInputAtStart(this.customFrom);
    const to = this.dateInputAtEnd(this.customTo);
    const requestedEnd = this.dateInputAtStart(this.customTo);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
      this.customRangeError = 'A data inicial deve ser anterior ou igual à data final.';
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (requestedEnd > today) {
      this.customRangeError = 'A data final não pode estar no futuro.';
      return;
    }
    this.selectedDays = null;
    this.customRangeOpen = false;
    this.customRangeError = '';
    this.loadDashboard();
  }

  get customRangeLabel(): string {
    if (this.selectedDays !== null || !this.customFrom || !this.customTo) return 'Personalizado';
    const format = (value: string) => value.split('-').reverse().join('/');
    return `${format(this.customFrom)} – ${format(this.customTo)}`;
  }

  onProductSearch(): void { this.productPage = 1; }

  setProductPage(page: number): void {
    this.productPage = Math.min(this.productPageCount, Math.max(1, page));
  }

  goToOrders(): void { void this.router.navigate(['/client/orders']); }
  goToIntegration(): void { void this.router.navigate(['/client/integrations/mercadolivre']); }
  goToOnboarding(): void { void this.router.navigate(['/client/onboarding']); }

  formatMoney(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency', currency: this.dashboard?.currencyId || 'BRL', maximumFractionDigits: 2
    }).format(value || 0);
  }

  formatCents(value: number): string { return this.formatMoney((value || 0) / 100); }

  formatCompactMoney(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency', currency: this.dashboard?.currencyId || 'BRL', notation: 'compact', maximumFractionDigits: 1
    }).format(value || 0);
  }

  barHeight(day: ClientSalesDailyResult): number {
    return day.revenue <= 0 ? 3 : Math.max(8, Math.round((day.revenue / this.maxDailyRevenue) * 100));
  }

  statusLabel(status: ClientSalesStatusResult): string {
    const labels: Record<string, string> = {
      paid: 'Pagos', confirmed: 'Confirmados', payment_required: 'Aguardando pagamento',
      payment_in_process: 'Pagamento em análise', partially_paid: 'Parcialmente pagos',
      partially_refunded: 'Parcialmente estornados', cancelled: 'Cancelados', invalid: 'Inválidos', unknown: 'Não identificado'
    };
    return labels[status.status] ?? status.status.replaceAll('_', ' ');
  }

  trendClass(value: number): string { return value > 0 ? 'trend-up' : value < 0 ? 'trend-down' : 'trend-flat'; }
  trackByDate(_: number, item: ClientSalesDailyResult): string { return item.date; }

  private refreshClientStatus(): void {
    this.profileService.getProfile().subscribe({
      next: profile => {
        const status = Number(profile.status);
        if (Number.isFinite(status)) this.auth.updateCurrentUser({ status });
      }
    });
  }

  private parseExternalCost(value: number | string | null): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (value == null) return null;
    let normalized = value.trim().replace(/\s/g, '').replace(/^R\$/i, '');
    if (!normalized) return null;
    if (normalized.includes(',') && normalized.includes('.')) normalized = normalized.replace(/\./g, '').replace(',', '.');
    else normalized = normalized.replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private get activeRange(): { from: Date; to: Date } {
    if (this.selectedDays === null && this.customFrom && this.customTo) {
      return { from: this.dateInputAtStart(this.customFrom), to: this.dateInputAtEnd(this.customTo) };
    }
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - ((this.selectedDays ?? 30) - 1));
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }

  private dateInputAtStart(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  private dateInputAtEnd(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    const selected = new Date(year, month - 1, day, 23, 59, 59, 999);
    const now = new Date();
    return selected > now ? now : selected;
  }

  private toDateInput(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
