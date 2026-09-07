import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NbButtonModule } from '@nebular/theme';
import { finalize } from 'rxjs';
import { AuthService } from '../core/services/auth.service';
import {
  ClientSalesDashboardResult,
  ClientSalesDailyResult,
  ClientSalesDashboardService,
  ClientSalesSkuResult,
  ClientSalesStatusResult
} from '../core/services/client-sales-dashboard.service';
import { ClientProfileService } from '../core/services/client-profile.service';
import { ClientStatus } from '../core/utils/client-status.constants';

@Component({
  selector: 'app-client-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, NbButtonModule],
  templateUrl: './client-dashboard.html',
  styleUrls: ['./client-dashboard.scss']
})
export class ClientDashboard implements OnInit {
  readonly periods = [{ label: '7 dias', days: 7 }, { label: '30 dias', days: 30 }, { label: '90 dias', days: 90 }, { label: '12 meses', days: 365 }];
  selectedDays = 30;
  readonly selectedProvider = 'MercadoLivre';
  loading = true;
  errorMessage = '';
  dashboard?: ClientSalesDashboardResult;
  productSearch = '';
  productPage = 1;
  readonly productPageSize = 10;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly salesDashboard: ClientSalesDashboardService,
    private readonly profileService: ClientProfileService
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
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - (this.selectedDays - 1));
    from.setHours(0, 0, 0, 0);
    this.loading = true;
    this.errorMessage = '';
    this.salesDashboard.getSales({ from, to, provider: this.selectedProvider })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: result => {
          this.dashboard = result;
          this.productPage = 1;
        },
        error: () => (this.errorMessage = 'Não foi possível atualizar suas vendas. Verifique a integração e tente novamente.')
      });
  }

  selectPeriod(days: number): void {
    if (this.selectedDays === days) return;
    this.selectedDays = days;
    this.loadDashboard();
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
}
