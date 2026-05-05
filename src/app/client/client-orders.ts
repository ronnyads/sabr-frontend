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

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Aguardando Pagamento',
  paid: 'Pago',
  payment_confirmed: 'Pagamento Confirmado',
  label_generated: 'Etiqueta Gerada',
  dispatched: 'Despachado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
  refund_requested: 'Estorno Solicitado',
  refunded: 'Estornado',
  AWAITING_SHIPMENT: 'Aguardando envio',
  AWAITING_COLLECTION: 'Aguardando coleta',
  IN_TRANSIT: 'Em trânsito',
  COMPLETED: 'Concluído'
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

  selectedStatus = '';
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

  readonly statusOptions = [
    { value: '', label: 'Todos os status' },
    { value: 'pending_payment', label: 'Aguardando Pagamento' },
    { value: 'paid', label: 'Pago' },
    { value: 'payment_confirmed', label: 'Confirmado' },
    { value: 'label_generated', label: 'Etiqueta Gerada' },
    { value: 'dispatched', label: 'Despachado' },
    { value: 'delivered', label: 'Entregue' },
    { value: 'cancelled', label: 'Cancelado' },
    { value: 'refund_requested', label: 'Estorno Solicitado' },
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
      status: this.selectedStatus || null,
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

  statusLabel(status: string): string {
    return STATUS_LABELS[status] ?? status;
  }

  statusClass(status: string): string {
    switch (status) {
      case 'paid':
      case 'payment_confirmed':
      case 'label_generated':
        return 'badge-success';
      case 'dispatched':
      case 'IN_TRANSIT':
        return 'badge-info';
      case 'delivered':
      case 'COMPLETED':
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

  fulfillmentStageClass(summary?: MarketplaceInternalFulfillmentSummaryResult | null): string {
    switch (summary?.stage) {
      case 'dispatched':
        return 'badge-info';
      case 'separated':
        return 'badge-success';
      case 'label_printed':
        return 'badge-warning';
      case 'processing_started':
        return 'badge-neutral';
      default:
        return 'badge-neutral';
    }
  }

  markPaid(orderId: string): void {
    this.actionLoading[orderId + '_pay'] = true;
    this.ordersService.markPaid(orderId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success('Pagamento confirmado com sucesso.', 'Pedidos');
          this.load();
        },
        error: (err: any) => {
          const msg = err?.error?.message ?? 'Erro ao confirmar pagamento.';
          this.toastr.danger(msg, 'Erro');
          this.actionLoading[orderId + '_pay'] = false;
        },
        complete: () => { this.actionLoading[orderId + '_pay'] = false; }
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

  isLabelLoading(order: MarketplaceOrderListItem, shipment: MarketplaceShipmentResult): boolean {
    return !!this.actionLoading[`${order.id}_${shipment.shipmentId}_label`];
  }

  isUrgent(order: MarketplaceOrderListItem): boolean {
    if (!order.shipByDeadlineAt) return false;
    const deadline = new Date(order.shipByDeadlineAt);
    const diff = deadline.getTime() - Date.now();
    return diff > 0 && diff < 4 * 60 * 60 * 1000;
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
        next: () => {
          this.toastr.success('Pedido cancelado com sucesso.', 'Cancelamento');
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
      { label: 'Em processamento', value: milestones.processingStartedAt },
      { label: 'Etiqueta impressa', value: milestones.labelPrintedAt },
      { label: 'Pedido separado', value: milestones.separatedAt },
      { label: 'Pedido enviado', value: milestones.dispatchedAt }
    ];
  }

  get currentPage(): number {
    return Math.floor(this.skip / this.limit) + 1;
  }

  get totalPages(): number {
    return Math.ceil(this.total / this.limit);
  }
}
