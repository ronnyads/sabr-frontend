import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NbButtonModule, NbIconModule, NbToastrService } from '@nebular/theme';
import { Subject, debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs';
import {
  AdminIntegrationsHubService,
  IntegrationClient
} from '../core/services/admin-integrations-hub.service';

@Component({
  selector: 'app-admin-integrations-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, NbButtonModule, NbIconModule],
  templateUrl: './admin-integrations-detail.html',
  styleUrls: ['./admin-integrations-detail.scss']
})
export class AdminIntegrationsDetail implements OnInit, OnDestroy {
  provider = '';
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
    this.provider = this.route.snapshot.paramMap.get('provider') ?? '';
    this.providerName = this.provider === 'mercadolivre' ? 'Mercado Livre' : 'Tiny ERP';

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

    const obs =
      this.provider === 'mercadolivre'
        ? this.service.listMlClients(this.skip, this.limit, this.search)
        : this.service.listTinyClients(this.skip, this.limit, this.search);

    obs
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
    if (this.skip === 0) return;
    this.skip = Math.max(0, this.skip - this.limit);
    this.load();
  }

  nextPage(): void {
    if (this.skip + this.limit >= this.total) return;
    this.skip += this.limit;
    this.load();
  }

  toggleConfirmReset(clientId: string): void {
    this.confirmReset[clientId] = !this.confirmReset[clientId];
  }

  resetIntegration(client: IntegrationClient): void {
    this.resetting[client.clientId] = true;

    const obs =
      this.provider === 'mercadolivre'
        ? this.service.disconnectMl(client.clientId)
        : this.service.disconnectTiny(client.clientId);

    obs
      .pipe(
        finalize(() => (this.resetting[client.clientId] = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
          delete this.confirmReset[client.clientId];
          this.toastr.success(`Integração de ${client.clientName} removida com sucesso.`, 'Reset concluído');
          this.load();
        },
        error: () => {
          this.toastr.danger(`Falha ao resetar integração de ${client.clientName}.`, 'Erro');
        }
      });
  }

  viewDetails(client: IntegrationClient): void {
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
}
