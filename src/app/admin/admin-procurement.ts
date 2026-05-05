import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { NbButtonModule, NbIconModule } from '@nebular/theme';
import { Subject, takeUntil } from 'rxjs';
import { AdminOrdersService, AdminProcurementOrderResult } from '../core/services/admin-orders.service';

@Component({
  selector: 'app-admin-procurement',
  standalone: true,
  imports: [CommonModule, NbButtonModule, NbIconModule],
  templateUrl: './admin-procurement.html',
  styleUrls: ['./admin-procurement.scss']
})
export class AdminProcurement implements OnInit, OnDestroy {
  orders: AdminProcurementOrderResult[] = [];
  total = 0;
  skip = 0;
  limit = 20;
  loading = false;
  error: string | null = null;

  private destroy$ = new Subject<void>();

  constructor(private readonly ordersService: AdminOrdersService) {}

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
    this.ordersService.listProcurement(this.skip, this.limit)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.orders = result.items ?? [];
          this.total = result.total ?? 0;
          this.loading = false;
        },
        error: () => {
          this.error = 'Erro ao carregar fila de compras.';
          this.loading = false;
        }
      });
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

  inventoryStatusLabel(value?: string | null): string {
    switch (value) {
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
      case 'partial':
        return 'Estoque parcial';
      case 'out_of_stock':
        return 'Sem estoque';
      default:
        return 'Sem mapeamento';
    }
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

  get currentPage(): number {
    return Math.floor(this.skip / this.limit) + 1;
  }

  get totalPages(): number {
    return Math.ceil(this.total / this.limit);
  }
}
