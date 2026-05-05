import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NbButtonModule, NbIconModule, NbToastrService } from '@nebular/theme';
import { Subject, takeUntil } from 'rxjs';
import {
  AdminFulfillmentOrderResult,
  AdminOrdersService,
  MarketplaceInternalFulfillmentSummaryResult,
  MarketplaceShipmentMilestonesResult,
  MarketplaceShipmentResult
} from '../core/services/admin-orders.service';

@Component({
  selector: 'app-admin-fulfillment',
  standalone: true,
  imports: [CommonModule, FormsModule, NbButtonModule, NbIconModule],
  templateUrl: './admin-fulfillment.html',
  styleUrls: ['./admin-fulfillment.scss']
})
export class AdminFulfillment implements OnInit, OnDestroy {
  orders: AdminFulfillmentOrderResult[] = [];
  total = 0;
  skip = 0;
  limit = 20;
  loading = false;
  error: string | null = null;
  scanValue = '';
  scanLoading = false;

  actionLoading: Record<string, boolean> = {};

  private destroy$ = new Subject<void>();

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
    this.ordersService.listFulfillment(this.skip, this.limit)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.orders = result.items ?? [];
          this.total = result.total ?? 0;
          this.loading = false;
        },
        error: () => {
          this.error = 'Erro ao carregar pedidos para expedicao.';
          this.loading = false;
        }
      });
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

  deadlineClass(order: AdminFulfillmentOrderResult): string {
    if (!order.shipByDeadlineAt) return '';
    const diff = new Date(order.shipByDeadlineAt).getTime() - Date.now();
    if (diff < 0) return 'deadline-overdue';
    if (diff < 4 * 60 * 60 * 1000) return 'deadline-urgent';
    if (diff < 24 * 60 * 60 * 1000) return 'deadline-warning';
    return 'deadline-ok';
  }

  fulfillmentStageClass(summary?: MarketplaceInternalFulfillmentSummaryResult | null): string {
    switch (summary?.stage) {
      case 'dispatched':
      case 'separated':
        return 'label-ready';
      case 'label_printed':
        return 'label-warning';
      default:
        return 'label-neutral';
    }
  }

  channelStatusClass(stage?: string | null): string {
    switch (stage) {
      case 'channel_dispatched':
      case 'delivered':
        return 'label-ready';
      case 'cancelled':
      case 'refunded':
        return 'label-no-label';
      default:
        return 'label-neutral';
    }
  }

  labelAvailabilityLabel(value?: string | null): string {
    switch (value) {
      case 'available_cached':
        return 'Etiqueta cacheada';
      case 'available_remote':
        return 'Etiqueta remota';
      default:
        return 'Etiqueta pendente';
    }
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

  downloadLabel(order: AdminFulfillmentOrderResult, shipment: MarketplaceShipmentResult): void {
    const key = `${order.id}_${shipment.shipmentId}_label`;
    this.actionLoading[key] = true;
    this.ordersService.getLabelByShipment(order.id, shipment.shipmentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `etiqueta-${order.mlOrderId}-${shipment.shipmentId}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => {
          this.toastr.danger('Etiqueta nao disponivel.', 'Erro');
        },
        complete: () => {
          this.actionLoading[key] = false;
        }
      });
  }

  pullLabel(order: AdminFulfillmentOrderResult, shipment: MarketplaceShipmentResult): void {
    const key = `${order.id}_${shipment.shipmentId}_pull`;
    this.actionLoading[key] = true;
    this.ordersService.pullLabel(order.id, shipment.shipmentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.toastr.success(result.message, 'Etiqueta');
          this.load();
        },
        error: (err) => {
          this.toastr.danger(err?.error?.message ?? 'Falha ao puxar etiqueta.', 'Etiqueta');
          this.actionLoading[key] = false;
        },
        complete: () => {
          this.actionLoading[key] = false;
        }
      });
  }

  printPackingLabel(order: AdminFulfillmentOrderResult, shipment: MarketplaceShipmentResult): void {
    const key = `${order.id}_${shipment.shipmentId}_packing`;
    this.actionLoading[key] = true;
    this.ordersService.getPackingLabel(order.id, shipment.shipmentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `packing-${order.internalOrderNumber || order.mlOrderId}-${shipment.shipmentId}.html`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: (err) => {
          this.toastr.danger(err?.error?.message ?? 'Falha ao gerar packing label.', 'Expedicao');
          this.actionLoading[key] = false;
        },
        complete: () => {
          this.actionLoading[key] = false;
        }
      });
  }

  submitScan(): void {
    const value = this.scanValue.trim();
    if (!value || this.scanLoading) {
      return;
    }

    this.scanLoading = true;
    this.ordersService.scanShipment(value)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.toastr.success(result.message, 'Expedicao');
          this.scanValue = '';
          this.load();
        },
        error: (err) => {
          this.toastr.danger(err?.error?.message ?? 'Falha ao processar bipagem.', 'Expedicao');
          this.scanLoading = false;
        },
        complete: () => {
          this.scanLoading = false;
        }
      });
  }

  advanceMilestone(order: AdminFulfillmentOrderResult, shipment: MarketplaceShipmentResult, milestone: string): void {
    const key = `${order.id}_${shipment.shipmentId}_${milestone}`;
    this.actionLoading[key] = true;
    this.ordersService.advanceShipmentMilestone(order.id, shipment.shipmentId, milestone)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success(`Pacote ${shipment.shipmentId} atualizado.`, 'Expedicao');
          this.load();
        },
        error: (err) => {
          this.toastr.danger(err?.error?.message ?? 'Erro ao atualizar expedicao.', 'Erro');
        },
        complete: () => {
          this.actionLoading[key] = false;
        }
      });
  }

  isActionLoading(order: AdminFulfillmentOrderResult, shipment: MarketplaceShipmentResult, action: string): boolean {
    return !!this.actionLoading[`${order.id}_${shipment.shipmentId}_${action}`];
  }

  isLabelLoading(order: AdminFulfillmentOrderResult, shipment: MarketplaceShipmentResult): boolean {
    return !!this.actionLoading[`${order.id}_${shipment.shipmentId}_label`];
  }

  isPullLabelLoading(order: AdminFulfillmentOrderResult, shipment: MarketplaceShipmentResult): boolean {
    return !!this.actionLoading[`${order.id}_${shipment.shipmentId}_pull`];
  }

  isPackingLabelLoading(order: AdminFulfillmentOrderResult, shipment: MarketplaceShipmentResult): boolean {
    return !!this.actionLoading[`${order.id}_${shipment.shipmentId}_packing`];
  }

  milestoneEntries(milestones: MarketplaceShipmentMilestonesResult): Array<{ label: string; value?: string | null }> {
    return [
      { label: 'Recebido', value: milestones.receivedAt },
      { label: 'Pago', value: milestones.paidAt },
      { label: 'Processamento', value: milestones.processingStartedAt },
      { label: 'Etiqueta impressa', value: milestones.labelPrintedAt },
      { label: 'Separado', value: milestones.separatedAt },
      { label: 'Enviado', value: milestones.dispatchedAt }
    ];
  }

  approveCancellation(order: AdminFulfillmentOrderResult): void {
    this.actionLoading[`${order.id}_approve_cancel`] = true;
    this.ordersService.approveCancellationRequest(order.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success('Cancelamento aprovado.', 'Pedidos');
          this.load();
        },
        error: (err) => {
          this.toastr.danger(err?.error?.message ?? 'Erro ao aprovar cancelamento.', 'Erro');
          this.actionLoading[`${order.id}_approve_cancel`] = false;
        },
        complete: () => { this.actionLoading[`${order.id}_approve_cancel`] = false; }
      });
  }

  rejectCancellation(order: AdminFulfillmentOrderResult): void {
    this.actionLoading[`${order.id}_reject_cancel`] = true;
    this.ordersService.rejectCancellationRequest(order.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success('Solicitacao recusada.', 'Pedidos');
          this.load();
        },
        error: (err) => {
          this.toastr.danger(err?.error?.message ?? 'Erro ao recusar cancelamento.', 'Erro');
          this.actionLoading[`${order.id}_reject_cancel`] = false;
        },
        complete: () => { this.actionLoading[`${order.id}_reject_cancel`] = false; }
      });
  }

  get urgentCount(): number {
    return this.orders.filter((order) => order.isUrgent).length;
  }

  get currentPage(): number {
    return Math.floor(this.skip / this.limit) + 1;
  }

  get totalPages(): number {
    return Math.ceil(this.total / this.limit);
  }
}
