import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NbButtonModule, NbIconModule, NbToastrService } from '@nebular/theme';
import { Subject, debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs';
import {
  AdminIntegrationsHubService,
  IntegrationClient,
  IntegrationProviderSlug
} from '../core/services/admin-integrations-hub.service';

type ProviderConfig = {
  name: string;
  supportsClientDetails: boolean;
};

const PROVIDER_CONFIG: Record<IntegrationProviderSlug, ProviderConfig> = {
  mercadolivre: { name: 'Mercado Livre', supportsClientDetails: true },
  tinyerp: { name: 'Tiny ERP', supportsClientDetails: true },
  shopify: { name: 'Shopify', supportsClientDetails: false },
  tiktokshop: { name: 'TikTok Shop', supportsClientDetails: true }
};

@Component({
  selector: 'app-admin-integrations-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, NbButtonModule, NbIconModule],
  templateUrl: './admin-integrations-detail.html',
  styleUrls: ['./admin-integrations-detail.scss']
})
export class AdminIntegrationsDetail implements OnInit, OnDestroy {
  provider: IntegrationProviderSlug = 'mercadolivre';
  providerName = '';

  clients: IntegrationClient[] = [];
  total = 0;
  skip = 0;
  limit = 20;
  search = '';
  loading = false;
  error: string | null = null;

  confirmReset: Record<string, boolean> = {};
  resetting: Record<string, boolean> = {};

  private readonly destroy$ = new Subject<void>();
  private readonly searchSubject$ = new Subject<string>();

  constructor(
    private readonly service: AdminIntegrationsHubService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    this.provider = this.resolveProvider(this.route.snapshot.paramMap.get('provider'));
    this.providerName = PROVIDER_CONFIG[this.provider].name;

    this.searchSubject$
      .pipe(debounceTime(400), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.skip = 0;
        this.load();
      });

    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.error = null;

    this.service
      .listClients(this.provider, this.skip, this.limit, this.search)
      .pipe(
        finalize(() => (this.loading = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          this.clients = result.items;
          this.total = result.total;
        },
        error: () => {
          this.error = 'Falha ao carregar clientes. Tente novamente.';
        }
      });
  }

  onSearch(): void {
    this.searchSubject$.next(this.search);
  }

  get currentPage(): number {
    return Math.floor(this.skip / this.limit) + 1;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.limit));
  }

  prevPage(): void {
    if (this.skip === 0) {
      return;
    }

    this.skip = Math.max(0, this.skip - this.limit);
    this.load();
  }

  nextPage(): void {
    if (this.skip + this.limit >= this.total) {
      return;
    }

    this.skip += this.limit;
    this.load();
  }

  toggleConfirmReset(clientId: string): void {
    this.confirmReset[clientId] = !this.confirmReset[clientId];
  }

  resetIntegration(client: IntegrationClient): void {
    this.resetting[client.clientId] = true;

    this.service
      .disconnect(this.provider, client.clientId)
      .pipe(
        finalize(() => (this.resetting[client.clientId] = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
          delete this.confirmReset[client.clientId];
          this.toastr.success(`Integracao de ${client.clientName} removida com sucesso.`, 'Reset concluido');
          this.load();
        },
        error: () => {
          this.toastr.danger(`Falha ao resetar integracao de ${client.clientName}.`, 'Erro');
        }
      });
  }

  canViewDetails(): boolean {
    return PROVIDER_CONFIG[this.provider].supportsClientDetails;
  }

  viewDetails(client: IntegrationClient): void {
    if (!this.canViewDetails()) {
      return;
    }

    void this.router.navigate([
      '/t',
      client.tenantSlug,
      'clients',
      client.clientId,
      'integrations',
      this.provider
    ]);
  }

  back(): void {
    void this.router.navigate(['/integrations']);
  }

  private resolveProvider(provider: string | null): IntegrationProviderSlug {
    if (provider === 'tinyerp' || provider === 'shopify' || provider === 'tiktokshop') {
      return provider;
    }

    return 'mercadolivre';
  }
}
