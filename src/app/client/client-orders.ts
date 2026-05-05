import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NbButtonModule, NbIconModule, NbSelectModule, NbToastrService } from '@nebular/theme';
import { Subject, takeUntil } from 'rxjs';
import {
  MarketplaceInternalFulfillmentSummaryResult,
  MarketplaceOrderDetail,
  MarketplaceOrderListItem,
  MarketplaceOrdersService,
  MarketplaceShipmentMilestonesResult,
  MarketplaceShipmentResult
} from '../core/services/marketplace-orders.service';

const CHANNEL_STATUS_LABELS: Record<string, string> = {
  pending: 'Aguardando canal',
  awaiting_shipment: 'Aguardando envio',
  channel_dispatched: 'Despachado no canal',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
  refund_requested: 'Estorno solicitado',
  refunded: 'Estornado',
  pending_payment: 'Aguardando Pagamento',
  paid: 'Pago',
  payment_confirmed: 'Confirmado'
};

@Component({
  selector: 'app-client-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, NbButtonModule, NbIconModule, NbSelectModule],
  templateUrl: './client-orders.html',
  styleUrls: ['./client-orders.scss']
})
export class ClientOrders implements OnInit, OnDestroy {
  orders: MarketplaceOrderListItem[] = [];
  total = 0;
  skip = 0;
  limit = 20;
  loading = false;
  error: string | null = null;

  selectedInternalStatus = '';
  selectedChannelStatus = '';
  filterProvider = '';
  expandedOrderId: string | null = null;
  orderDetails: Record<string, MarketplaceOrderDetail> = {};
  detailLoading: Record<string, boolean> = {};
  actionLoading: Record<string, boolean> = {};
  cancelReason: Record<string, string> = {};
  refundReason: Record<string, string> = {};
  showCancelForm: Record<string, boolean> = {};
  showRefundForm: Record<string, boolean> = {};

  private destroy$ = new Subject<void>();

  readonly providerOptions = [
    { value: '', label: 'Todos os canais' },
    { value: '1', label: 'Mercado Livre' },
    { value: '2', label: 'Tiny ERP' },
    { value: '4', label: 'TikTok Shop' }
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
    { value: 'refund_requested', label: 'Estorno solicitado' },
    { value: 'refunded', label: 'Estornado' }
  ];

  constructor(
    private ordersService: MarketplaceOrdersService,
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
      internalStatus: this.selectedInternalStatus || null,
      channelStatus: this.selectedChannelStatus || null,
      provider: this.filterProvider || null,
      skip: this.skip,
      limit: this.limit
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.orders = result.items ?? [];
          this.total = result.total ?? 0;
          this.orderDetails = {};
          this.detailLoading = {};
          this.expandedOrderId = null;
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
    if (this.skip > 0) {
      this.skip = Math.max(0, this.skip - this.limit);
      this.load();
    }
  }

  nextPage(): void {
    if (this.skip + this.limit < this.total) {
      this.skip += this.limit;
      this.load();
    }
  }

  toggleExpand(id: string): void {
    if (this.expandedOrderId === id) {
      this.expandedOrderId = null;
      return;
    }

    this.expandedOrderId = id;
    if (!this.orderDetails[id] && !this.detailLoading[id]) {
      this.loadOrderDetail(id);
    }
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

  internalStageLabel(summary?: MarketplaceInternalFulfillmentSummaryResult | null): string {
    return summary?.label || 'Pedido recebido';
  }

  internalStageClass(stage?: string | null): string {
    switch (stage) {
      case 'dispatched':
        return 'badge-info';
      case 'separated':
        return 'badge-success';
      case 'label_printed':
        return 'badge-warning';
      case 'processing_started':
      case 'paid':
        return 'badge-neutral';
      default:
        return 'badge-neutral';
    }
  }

  channelStatusLabel(order: MarketplaceOrderListItem): string {
    return order.channelStatus?.label || CHANNEL_STATUS_LABELS[order.currentChannelStage] || order.currentChannelStage;
  }

  channelStatusClass(stage?: string | null): string {
    switch (stage) {
      case 'channel_dispatched':
        return 'badge-info';
      case 'delivered':
        return 'badge-delivered';
      case 'cancelled':
      case 'refunded':
        return 'badge-danger';
      case 'refund_requested':
        return 'badge-warning';
      default:
        return 'badge-neutral';
    }
  }

  labelAvailabilityLabel(value?: string | null): string {
    switch (value) {
      case 'available_cached':
        return 'Etiqueta cacheada';
      case 'available_remote':
        return 'Etiqueta disponível';
      default:
        return 'Etiqueta pendente';
    }
  }

  isLabelReady(value?: string | null): boolean {
    return value === 'available_cached' || value === 'available_remote';
  }

  labelAvailabilityClass(value?: string | null): string {
    return this.isLabelReady(value) ? 'enabled' : '';
  }

  markPaid(order: MarketplaceOrderListItem): void {
    const key = `${order.id}_pay`;
    this.actionLoading[key] = true;
    this.ordersService.markPaid(order.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success('Pagamento confirmado com sucesso.', 'Pedidos');
          this.load();
        },
        error: (err: any) => {
          const msg = err?.error?.message ?? 'Erro ao confirmar pagamento.';
          this.toastr.danger(msg, 'Erro');
          this.actionLoading[key] = false;
        },
        complete: () => { this.actionLoading[key] = false; }
      });
  }

  pullLabel(order: MarketplaceOrderListItem, shipment?: MarketplaceShipmentResult): void {
    const key = `${order.id}_${shipment?.shipmentId ?? 'order'}_pull`;
    this.actionLoading[key] = true;
    this.ordersService.pullLabel(order.id, shipment?.shipmentId ?? null)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          if (result.succeeded) {
            this.toastr.success(result.message, 'Etiqueta');
          } else {
            this.toastr.warning(result.message, 'Etiqueta');
          }
          this.load();
        },
        error: (err) => {
          this.toastr.danger(err?.error?.message ?? 'Falha ao puxar etiqueta.', 'Etiqueta');
          this.actionLoading[key] = false;
        },
        complete: () => { this.actionLoading[key] = false; }
      });
  }

  pullFilteredLabels(): void {
    if (this.orders.length === 0) {
      return;
    }

    this.actionLoading['bulk_pull'] = true;
    this.ordersService.pullLabelsBulk(this.orders.map(order => order.id))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          const title = result.failed > 0 ? 'Etiquetas' : 'Etiquetas atualizadas';
          const message = `${result.succeeded} pedido(s) atualizado(s)` + (result.failed > 0 ? `, ${result.failed} falharam.` : '.');
          if (result.failed > 0) {
            this.toastr.warning(message, title);
          } else {
            this.toastr.success(message, title);
          }
          this.load();
        },
        error: (err) => {
          this.toastr.danger(err?.error?.message ?? 'Falha ao puxar etiquetas em massa.', 'Etiquetas');
          this.actionLoading['bulk_pull'] = false;
        },
        complete: () => { this.actionLoading['bulk_pull'] = false; }
      });
  }

  downloadLabel(order: MarketplaceOrderListItem, shipment: MarketplaceShipmentResult): void {
    const key = `${order.id}_${shipment.shipmentId}_label`;
    this.actionLoading[key] = true;
    this.ordersService.downloadLabel(order.id, shipment.shipmentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `etiqueta-${order.mlOrderId}-${shipment.shipmentId}.pdf`;
          anchor.click();
          URL.revokeObjectURL(url);
        },
        error: (err) => {
          const msg = err?.error?.message ?? 'Etiqueta indisponível no momento.';
          this.toastr.danger(msg, 'Etiqueta');
        },
        complete: () => { this.actionLoading[key] = false; }
      });
  }

  toggleCancelForm(orderId: string): void {
    this.showCancelForm[orderId] = !this.showCancelForm[orderId];
    this.showRefundForm[orderId] = false;
  }

  submitCancel(orderId: string): void {
    this.actionLoading[orderId] = true;
    this.ordersService.cancelOrder(orderId, this.cancelReason[orderId] || null)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.toastr.success(result.message || (result.action === 'cancellation_requested'
            ? 'Solicitação de cancelamento enviada.'
            : 'Pedido cancelado com sucesso.'), 'Cancelamento');
          this.showCancelForm[orderId] = false;
          this.load();
        },
        error: (err) => {
          const msg = err?.error?.message ?? 'Erro ao cancelar pedido.';
          this.toastr.danger(msg, 'Erro');
          this.actionLoading[orderId] = false;
        },
        complete: () => { this.actionLoading[orderId] = false; }
      });
  }

  toggleRefundForm(orderId: string): void {
    this.showRefundForm[orderId] = !this.showRefundForm[orderId];
    this.showCancelForm[orderId] = false;
  }

  submitRefund(orderId: string): void {
    this.actionLoading[orderId] = true;
    this.ordersService.requestRefund(orderId, this.refundReason[orderId] || null)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success('Solicitação de estorno enviada.', 'Estorno');
          this.showRefundForm[orderId] = false;
          this.load();
        },
        error: (err) => {
          const msg = err?.error?.message ?? 'Erro ao solicitar estorno.';
          this.toastr.danger(msg, 'Erro');
          this.actionLoading[orderId] = false;
        },
        complete: () => { this.actionLoading[orderId] = false; }
      });
  }

  formatProviderName(shipment: MarketplaceShipmentResult): string {
    return shipment.shippingProvider || shipment.trackingMethod || shipment.logisticType || 'Marketplace';
  }

  getExpandedShipments(order: MarketplaceOrderListItem): MarketplaceShipmentResult[] {
    return this.orderDetails[order.id]?.shipments ?? [];
  }

  isPullLabelLoading(order: MarketplaceOrderListItem, shipment?: MarketplaceShipmentResult): boolean {
    return !!this.actionLoading[`${order.id}_${shipment?.shipmentId ?? 'order'}_pull`];
  }

  isLabelLoading(order: MarketplaceOrderListItem, shipment: MarketplaceShipmentResult): boolean {
    return !!this.actionLoading[`${order.id}_${shipment.shipmentId}_label`];
  }

  isUrgent(order: MarketplaceOrderListItem): boolean {
    if (!order.shipByDeadlineAt) return false;
    const deadline = new Date(order.shipByDeadlineAt);
    const diff = deadline.getTime() - Date.now();
    return diff > 0 && diff < 4 * 60 * 60 * 1000;
  }

  canShowRefund(order: MarketplaceOrderListItem): boolean {
    return ['paid', 'payment_confirmed', 'label_generated', 'dispatched'].includes(order.status);
  }

  private loadOrderDetail(orderId: string): void {
    this.detailLoading[orderId] = true;
    this.ordersService.getOrder(orderId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (detail) => {
          this.orderDetails[orderId] = detail;
        },
        error: (err) => {
          const msg = err?.error?.message ?? 'Não foi possível carregar os detalhes do pedido.';
          this.toastr.danger(msg, 'Pedidos');
        },
        complete: () => {
          this.detailLoading[orderId] = false;
        }
      });
  }

  milestoneEntries(milestones: MarketplaceShipmentMilestonesResult): Array<{ label: string; value?: string | null }> {
    return [
      { label: 'Pedido recebido', value: milestones.receivedAt },
      { label: 'Pedido pago', value: milestones.paidAt },
      { label: 'Em processamento', value: milestones.processingStartedAt },
      { label: 'Etiqueta impressa', value: milestones.labelPrintedAt },
      { label: 'Pedido separado', value: milestones.separatedAt },
      { label: 'Pedido enviado', value: milestones.dispatchedAt }
    ];
  }

  inventoryStatusLabel(value?: string | null): string {
    switch (value) {
      case 'mapped_in_stock':
        return 'Mapeado com estoque';
      case 'mapped_partial_stock':
        return 'Estoque parcial';
      case 'out_of_stock':
        return 'Sem estoque';
      default:
        return 'Sem mapeamento';
    }
  }

  itemStockLabel(value?: string | null): string {
    switch (value) {
      case 'in_stock':
        return 'Estoque ok';
      case 'partial':
        return 'Estoque parcial';
      case 'out_of_stock':
        return 'Sem estoque';
      default:
        return 'Sem mapeamento';
    }
  }

  paymentBlockerLabel(value: string): string {
    switch (value) {
      case 'unmapped_item':
        return 'Item sem mapeamento';
      case 'out_of_stock':
        return 'Sem estoque';
      case 'label_missing':
        return 'Etiqueta pendente';
      case 'cancellation_pending':
        return 'Cancelamento solicitado';
      default:
        return value;
    }
  }

  paymentBlockerSummary(values: string[]): string {
    return values.map((value) => this.paymentBlockerLabel(value)).join(' • ');
  }

  get currentPage(): number {
    return Math.floor(this.skip / this.limit) + 1;
  }

  get totalPages(): number {
    return Math.ceil(this.total / this.limit);
  }
}
