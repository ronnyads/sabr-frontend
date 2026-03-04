import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NbButtonModule, NbInputModule, NbSelectModule, NbToastrService } from '@nebular/theme';
import { Subject, finalize, takeUntil } from 'rxjs';
import {
  ListingPublicationItemResult,
  ListingPublicationsQueryResult,
  PublicationsService
} from '../../core/services/publications.service';
import { MercadoLivreIntegrationService } from '../../core/services/mercado-livre-integration.service';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { UiStateComponent } from '../../shared/ui-state/ui-state.component';

@Component({
  selector: 'app-client-publications-page',
  standalone: true,
  imports: [CommonModule, FormsModule, NbButtonModule, NbInputModule, NbSelectModule, PageHeaderComponent, UiStateComponent],
  templateUrl: './client-publications.page.html',
  styleUrls: ['./client-publications.page.scss']
})
export class ClientPublicationsPage implements OnInit, OnDestroy {
  loading = false;
  errorMessage: string | null = null;
  items: ListingPublicationItemResult[] = [];
  total = 0;
  skip = 0;
  limit = 20;

  selectedSellerId = '';
  statusFilter = '';
  search = '';

  sellers: string[] = [];

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly publicationsService: PublicationsService,
    private readonly integrationService: MercadoLivreIntegrationService,
    private readonly router: Router,
    private readonly toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    this.loadSellers();
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get empty(): boolean {
    return !this.loading && !this.errorMessage && this.items.length === 0;
  }

  get hasPreviousPage(): boolean {
    return this.skip > 0;
  }

  get hasNextPage(): boolean {
    return this.skip + this.limit < this.total;
  }

  trackByDraft(_: number, item: ListingPublicationItemResult): string {
    return item.draftId;
  }

  applyFilters(): void {
    this.skip = 0;
    this.load();
  }

  clearFilters(): void {
    this.selectedSellerId = '';
    this.statusFilter = '';
    this.search = '';
    this.skip = 0;
    this.load();
  }

  previousPage(): void {
    if (!this.hasPreviousPage) {
      return;
    }

    this.skip = Math.max(0, this.skip - this.limit);
    this.load();
  }

  nextPage(): void {
    if (!this.hasNextPage) {
      return;
    }

    this.skip += this.limit;
    this.load();
  }

  openNewDraft(): void {
    void this.router.navigate(['/client/publications/new'], {
      queryParams: { channel: 'mercadolivre' }
    });
  }

  edit(item: ListingPublicationItemResult): void {
    void this.router.navigate(['/client/publications', item.draftId], {
      queryParams: {
        variantSku: item.sabrVariantSku,
        sellerId: item.sellerId,
        channel: 'mercadolivre'
      }
    });
  }

  openPublished(item: ListingPublicationItemResult): void {
    const link = (item.publishedPermalink ?? '').trim();
    if (!link) {
      this.toastr.warning('Publicacao sem permalink.', 'Publicacoes');
      return;
    }

    window.open(link, '_blank', 'noopener');
  }

  private loadSellers(): void {
    this.integrationService
      .status()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (status) => {
          this.sellers = status.connections?.map((item) => item.sellerId) ?? [];
          if (!this.selectedSellerId && this.sellers.length > 0) {
            this.selectedSellerId = this.sellers[0];
          }
        },
        error: () => {
          this.sellers = [];
        }
      });
  }

  private load(): void {
    this.loading = true;
    this.errorMessage = null;

    this.publicationsService
      .queryPublications({
        channel: 'mercadolivre',
        sellerId: this.selectedSellerId || null,
        status: this.statusFilter || null,
        search: this.search || null,
        skip: this.skip,
        limit: this.limit
      })
      .pipe(
        finalize(() => (this.loading = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result: ListingPublicationsQueryResult) => {
          this.items = result.items ?? [];
          this.total = result.total ?? 0;
        },
        error: (error) => {
          this.items = [];
          this.total = 0;
          this.errorMessage = this.buildErrorMessage('Falha ao carregar publicacoes.', error);
        }
      });
  }

  private buildErrorMessage(base: string, error: { error?: { message?: string; traceId?: string }; headers?: { get: (name: string) => string | null } }): string {
    const apiMessage = typeof error.error?.message === 'string' ? error.error.message : null;
    const traceId =
      (typeof error.error?.traceId === 'string' ? error.error.traceId : null) ||
      error.headers?.get?.('X-Correlation-Id');
    const message = apiMessage && apiMessage.trim() ? apiMessage.trim() : base;
    return traceId ? `${message} (traceId: ${traceId})` : message;
  }
}
