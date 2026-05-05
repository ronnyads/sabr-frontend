import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NbButtonModule, NbIconModule, NbToastrService } from '@nebular/theme';
import { Subject, takeUntil } from 'rxjs';
import { AdminOrderListItem, AdminOrdersService } from '../core/services/admin-orders.service';

const CHANNEL_STATUS_LABELS: Record<string, string> = {
  awaiting_shipment: 'Aguardando envio',
  channel_dispatched: 'Despachado no canal',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
  refund_requested: 'Estorno Solicitado',
  refunded: 'Estornado'
};

@Component({
  selector: 'app-admin-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, NbButtonModule, NbIconModule],
  templateUrl: './admin-orders.html',
  styleUrls: ['./admin-orders.scss']
})
export class AdminOrders implements OnInit, OnDestroy {
  orders: AdminOrderListItem[] = [];
  total = 0;
  skip = 0;
  limit = 20;
  loading = false;
  error: string | null = null;

  filterStatus = '';
  filterInternalStatus = '';
  filterChannelStatus = '';
  filterTenant = '';
  filterProvider: string = '';

  actionLoading: Record<string, boolean> = {};
  cancelReason: Record<string, string> = {};
  showCancelConfirm: Record<string, boolean> = {};
  expandedOrderId: string | null = null;

  private destroy$ = new Subject<void>();

  readonly providerOptions = [
    { value: '', label: 'Todos os canais' },
    { value: '1', label: 'Mercado Livre' },
    { value: '2', label: 'Tiny ERP' },
    { value: '4', label: 'TikTok Shop' }
  ];

  readonly statusOptions = [
    { value: '', label: 'Todos os status legados' },
    { value: 'paid', label: 'Pago' },
    { value: 'delivered', label: 'Entregue' },
    { value: 'cancelled', label: 'Cancelado' },
    { value: 'refund_requested', label: 'Estorno Solicitado' },
    { value: 'refunded', label: 'Estornado' }
  ];

  readonly internalStatusOptions = [
    { value: '', label: 'Status interno' },
    { value: 'received', label: 'Pedido recebido' },
    { value: 'paid', label: 'Pedido pago' },
    { value: 'processing_started', label: 'Em processamento' },
    { value: 'label_printed', label: 'Etiqueta impressa' },
    { value: 'separated', label: 'Pedido separado' },
    { value: 'dispatched', label: 'Pedido enviado' }
  ];

  readonly channelStatusOptions = [
    { value: '', label: 'Status do canal' },
    { value: 'awaiting_shipment', label: 'Aguardando envio' },
    { value: 'channel_dispatched', label: 'Despachado no canal' },
    { value: 'delivered', label: 'Entregue' },
    { value: 'cancelled', label: 'Cancelado' },
    { value: 'refund_requested', label: 'Estorno Solicitado' },
    { value: 'refunded', label: 'Estornado' }
  ];

  constructor(
    private ordersService: AdminOrdersService,
    private toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.ordersService.listOrders({
      status: this.filterStatus || null,
      internalStatus: this.filterInternalStatus || null,
      channelStatus: this.filterChannelStatus || null,
      tenantId: this.filterTenant || null,
      provider: this.filterProvider || null,
      skip: this.skip,
      limit: this.limit
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (result) => {
        this.orders = result.items ?? [];
        this.total = result.total ?? 0;
        this.loading = false;
      },
      error: () => {
        this.error = 'Erro ao carregar pedidos.';
        this.loading = false;
      }
    });
  }

  onFilterChange(): void {
    this.skip = 0;
    this.load();
  }

  prevPage(): void {
    if (this.skip > 0) { this.skip = Math.max(0, this.skip - this.limit); this.load(); }
  }

  nextPage(): void {
    if (this.skip + this.limit < this.total) { this.skip += this.limit; this.load(); }
  }

  toggleExpand(id: string): void {
    this.expandedOrderId = this.expandedOrderId === id ? null : id;
  }

  providerLabel(provider: number): string {
    if (provider === 1) return 'ML';
    if (provider === 2) return 'Tiny';
    if (provider === 4) return 'TikTok';
    return '';
  }

  providerClass(provider: number): string {
    if (provider === 1) return 'badge-info';
    if (provider === 2) return 'badge-purple';
    if (provider === 4) return 'badge-tiktok';
    return 'badge-neutral';
  }

  statusLabel(status?: string | null): string {
    return status ? (CHANNEL_STATUS_LABELS[status] ?? status) : 'Aguardando canal';
  }

  statusClass(status?: string | null): string {
    switch (status) {
      case 'paid': case 'payment_confirmed': return 'badge-success';
      case 'label_generated': return 'badge-info';
      case 'dispatched': return 'badge-purple';
      case 'delivered': return 'badge-delivered';
      case 'cancelled': case 'refunded': return 'badge-danger';
      case 'refund_requested': return 'badge-warning';
      default: return 'badge-neutral';
    }
  }

  internalStageClass(stage?: string | null): string {
    switch (stage) {
      case 'dispatched': return 'badge-info';
      case 'separated': return 'badge-success';
      case 'label_printed': return 'badge-warning';
      default: return 'badge-neutral';
    }
  }

  labelAvailabilityLabel(value?: string | null): string {
    switch (value) {
      case 'available_cached': return 'Etiqueta cacheada';
      case 'available_remote': return 'Etiqueta disponível';
      default: return 'Etiqueta pendente';
    }
  }

  inventoryStatusLabel(value?: string | null): string {
    switch (value) {
      case 'mapped_in_stock': return 'Mapeado com estoque';
      case 'mapped_partial_stock': return 'Estoque parcial';
      case 'out_of_stock': return 'Sem estoque';
      default: return 'Sem mapeamento';
    }
  }

  paymentBlockerLabel(value: string): string {
    switch (value) {
      case 'unmapped_item': return 'Sem mapeamento';
      case 'out_of_stock': return 'Sem estoque';
      case 'label_missing': return 'Etiqueta pendente';
      case 'cancellation_pending': return 'Cancelamento solicitado';
      default: return value;
    }
  }

  blockerBadgeClass(value: string): string {
    switch (value) {
      case 'out_of_stock':
      case 'unmapped_item':
        return 'badge-danger';
      case 'label_missing':
        return 'badge-warning';
      case 'cancellation_pending':
        return 'badge-purple';
      default:
        return 'badge-neutral';
    }
  }

  hasRisk(order: AdminOrderListItem): boolean {
    try {
      if (!order.riskFlagsJson) return false;
      const flags = JSON.parse(order.riskFlagsJson);
      return Object.keys(flags).length > 0;
    } catch { return false; }
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  confirmPayment(order: AdminOrderListItem): void {
    this.actionLoading[order.id] = true;
    this.ordersService.confirmPayment(order.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastr.success('Pagamento confirmado com sucesso.', 'Confirmação');
        this.load();
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'Erro ao confirmar pagamento.';
        this.toastr.danger(msg, 'Erro');
        this.actionLoading[order.id] = false;
      },
      complete: () => { this.actionLoading[order.id] = false; }
    });
  }

  downloadLabel(order: AdminOrderListItem): void {
    this.actionLoading[order.id + '_label'] = true;
    this.ordersService.getLabel(order.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `etiqueta-${order.mlOrderId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        this.actionLoading[order.id + '_label'] = false;
      },
      error: () => {
        this.toastr.danger('Etiqueta não disponível.', 'Erro');
        this.actionLoading[order.id + '_label'] = false;
      }
    });
  }

  pullLabel(order: AdminOrderListItem): void {
    this.actionLoading[order.id + '_pull_label'] = true;
    this.ordersService.pullLabel(order.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (result) => {
        this.toastr.success(result.message, 'Etiqueta');
        this.load();
      },
      error: (err) => {
        this.toastr.danger(err?.error?.message ?? 'Etiqueta não disponível.', 'Erro');
        this.actionLoading[order.id + '_pull_label'] = false;
      },
      complete: () => { this.actionLoading[order.id + '_pull_label'] = false; }
    });
  }

  toggleCancelConfirm(orderId: string): void {
    this.showCancelConfirm[orderId] = !this.showCancelConfirm[orderId];
  }

  submitCancel(orderId: string): void {
    this.actionLoading[orderId] = true;
    this.ordersService.cancelOrder(orderId, this.cancelReason[orderId] || null)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success('Pedido cancelado.', 'Cancelamento');
          this.showCancelConfirm[orderId] = false;
          this.load();
        },
        error: (err) => {
          this.toastr.danger(err?.error?.message ?? 'Erro ao cancelar.', 'Erro');
          this.actionLoading[orderId] = false;
        },
        complete: () => { this.actionLoading[orderId] = false; }
      });
  }

  processRefund(orderId: string): void {
    this.actionLoading[orderId + '_refund'] = true;
    this.ordersService.processRefund(orderId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastr.success('Estorno processado.', 'Estorno');
        this.load();
      },
      error: (err) => {
        this.toastr.danger(err?.error?.message ?? 'Erro ao processar estorno.', 'Erro');
        this.actionLoading[orderId + '_refund'] = false;
      },
      complete: () => { this.actionLoading[orderId + '_refund'] = false; }
    });
  }

  approveCancellation(orderId: string): void {
    this.actionLoading[orderId + '_approve_cancel'] = true;
    this.ordersService.approveCancellationRequest(orderId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastr.success('Cancelamento aprovado.', 'Pedidos');
        this.load();
      },
      error: (err) => {
        this.toastr.danger(err?.error?.message ?? 'Erro ao aprovar cancelamento.', 'Erro');
        this.actionLoading[orderId + '_approve_cancel'] = false;
      },
      complete: () => { this.actionLoading[orderId + '_approve_cancel'] = false; }
    });
  }

  rejectCancellation(orderId: string): void {
    this.actionLoading[orderId + '_reject_cancel'] = true;
    this.ordersService.rejectCancellationRequest(orderId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastr.success('Solicitação recusada.', 'Pedidos');
        this.load();
      },
      error: (err) => {
        this.toastr.danger(err?.error?.message ?? 'Erro ao recusar cancelamento.', 'Erro');
        this.actionLoading[orderId + '_reject_cancel'] = false;
      },
      complete: () => { this.actionLoading[orderId + '_reject_cancel'] = false; }
    });
  }

  get currentPage(): number { return Math.floor(this.skip / this.limit) + 1; }
  get totalPages(): number { return Math.ceil(this.total / this.limit); }
}
