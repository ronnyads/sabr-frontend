import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Subject, finalize, takeUntil, timer } from 'rxjs';
import {
  MercadoLivreHistorySellerStatusResult,
  MercadoLivreHistorySyncStatusResult,
  MercadoLivreIntegrationService
} from '../core/services/mercado-livre-integration.service';
import { presentHistoryCoverage } from './client-ml-history-coverage.presenter';

@Component({
  selector: 'app-client-ml-history-coverage',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './client-ml-history-coverage.html',
  styleUrls: ['./client-ml-history-coverage.scss']
})
export class ClientMlHistoryCoverage implements OnInit, OnDestroy {
  @Input() compact = false;
  @Input() selectedSellerId = '';

  loading = true;
  errorMessage = '';
  status: MercadoLivreHistorySyncStatusResult | null = null;

  private readonly destroy$ = new Subject<void>();
  private pollScheduled = false;

  constructor(private readonly integration: MercadoLivreIntegrationService) {}

  ngOnInit(): void {
    this.loadStatus();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get sellers(): MercadoLivreHistorySellerStatusResult[] {
    const sellers = this.status?.sellers ?? [];
    const selected = this.selectedSellerId.trim();
    return selected ? sellers.filter((seller) => String(seller.sellerId) === selected) : sellers;
  }

  get hasActiveBackfill(): boolean {
    return this.sellers.some((seller) =>
      ['INITIAL_PENDING', 'BACKFILLING'].includes((seller.status ?? '').toUpperCase()));
  }

  presentation(seller: MercadoLivreHistorySellerStatusResult) {
    return presentHistoryCoverage(seller);
  }

  trackSeller(_: number, seller: MercadoLivreHistorySellerStatusResult): string {
    return String(seller.sellerId);
  }

  loadStatus(silent = false): void {
    if (!silent) this.loading = true;
    this.errorMessage = '';
    this.integration.historySyncStatus()
      .pipe(finalize(() => (this.loading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.status = result;
          this.schedulePoll(this.hasActiveBackfill);
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage = this.errorFrom(error, 'Não foi possível consultar a cobertura histórica.');
        }
      });
  }

  private schedulePoll(active: boolean): void {
    if (!active || this.pollScheduled) return;
    this.pollScheduled = true;
    timer(5000).pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.pollScheduled = false;
      this.loadStatus(true);
    });
  }

  private errorFrom(error: HttpErrorResponse, fallback: string): string {
    const message = typeof error.error?.message === 'string' ? error.error.message.trim() : '';
    return message || fallback;
  }
}
