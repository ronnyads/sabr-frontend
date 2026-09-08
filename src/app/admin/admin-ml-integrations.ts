import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NbButtonModule, NbToastrService } from '@nebular/theme';
import { Subject, finalize, takeUntil } from 'rxjs';
import { AdminMercadoLivreIntegrationService, MercadoLivreCatalogImportItem, MercadoLivreSellerCatalogItem } from '../core/services/admin-mercado-livre-integration.service';
import { AdminTenantContextService } from '../core/services/admin-tenant-context.service';
import { MercadoLivreIntegrationStatusResult } from '../core/services/mercado-livre-integration.service';
import { PageHeaderComponent } from '../shared/page-header/page-header.component';
import { UiStateComponent } from '../shared/ui-state/ui-state.component';

@Component({
  selector: 'app-admin-ml-integrations',
  standalone: true,
  imports: [CommonModule, FormsModule, NbButtonModule, PageHeaderComponent, UiStateComponent],
  templateUrl: './admin-ml-integrations.html',
  styleUrls: ['./admin-ml-integrations.scss']
})
export class AdminMlIntegrations implements OnInit, OnDestroy {
  tenantId = '';
  clientId = '';
  loading = false;
  errorMessage: string | null = null;
  status: MercadoLivreIntegrationStatusResult | null = null;
  importingCatalog = false;
  loadingCatalogPreview = false;
  catalogPreview: MercadoLivreCatalogImportItem[] = [];
  catalogSearch = '';
  selectedProductKeys = new Set<string>();
  sellerResearchId = '';
  sellerResearchQuery = '';
  sellerResearchLoading = false;
  sellerResearchItems: MercadoLivreSellerCatalogItem[] = [];

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly toastr: NbToastrService,
    private readonly tenantContext: AdminTenantContextService,
    private readonly integrationService: AdminMercadoLivreIntegrationService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const routeTenant = (params.get('tenantId') ?? '').trim().toLowerCase();
      const contextTenant = (this.tenantContext.get()?.tenantId ?? '').trim().toLowerCase();
      const tenantId = routeTenant || contextTenant;
      const clientId = (params.get('clientId') ?? '').trim();

      if (!tenantId || !clientId) {
        this.toastr.warning('Cliente obrigatório para acessar integrações.', 'Contexto ausente');
        void this.router.navigate(['/clients']);
        return;
      }

      this.tenantId = tenantId;
      this.clientId = clientId;
      this.tenantContext.set(tenantId, undefined, clientId);
      this.loadStatus();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get empty(): boolean {
    return !this.loading && !this.errorMessage && !this.status;
  }

  loadStatus(): void {
    this.loading = true;
    this.errorMessage = null;
    this.integrationService
      .getStatus(this.tenantId, this.clientId)
      .pipe(
        finalize(() => (this.loading = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          this.status = result;
        },
        error: (error: HttpErrorResponse) => {
          this.status = null;
          this.errorMessage = this.buildErrorMessage('Falha ao carregar status da integracao.', error);
        }
      });
  }

  forceDisconnect(sellerId?: string): void {
    const message = sellerId
      ? `Desconectar seller ${sellerId} permanentemente?`
      : 'Desconectar TODOS os sellers permanentemente?';
    if (!confirm(message)) return;

    this.integrationService
      .forceDisconnect(this.tenantId, this.clientId, sellerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success(
            'Integracao desconectada com sucesso.',
            'Force Disconnect'
          );
          this.loadStatus();
        },
        error: (error: HttpErrorResponse) => {
          const message = this.buildErrorMessage(
            'Falha ao desconectar integracao.',
            error
          );
          this.toastr.danger(message, 'Force Disconnect');
        }
      });
  }

  loadCatalogPreview(): void {
    this.loadingCatalogPreview = true;
    this.integrationService.importProducts(this.tenantId, this.clientId, true)
      .pipe(finalize(() => (this.loadingCatalogPreview = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.catalogPreview = result.items;
          this.selectedProductKeys.clear();
          if (result.warnings.length) this.toastr.warning(`${result.warnings.length} anúncio(s) sem SKU não poderão ser importados.`, 'Prévia carregada');
        },
        error: (error: HttpErrorResponse) => this.toastr.danger(this.buildErrorMessage('Falha ao buscar produtos.', error), 'Mercado Livre')
      });
  }

  get productGroups(): Array<{ key: string; sku: string | null; title: string; brand: string; thumbnailUrl: string | null; priceCents: number; itemIds: string[] }> {
    const groups = new Map<string, { key: string; sku: string | null; title: string; brand: string; thumbnailUrl: string | null; priceCents: number; itemIds: string[] }>();
    const term = this.catalogSearch.trim().toLowerCase();
    for (const item of this.catalogPreview) {
      if (term && !`${item.title} ${item.sku ?? ''} ${item.brand}`.toLowerCase().includes(term)) continue;
      const key = item.sku || item.itemId;
      const existing = groups.get(key);
      if (existing) existing.itemIds.push(item.itemId);
      else groups.set(key, { key, sku: item.sku, title: item.title, brand: item.brand || '-', thumbnailUrl: item.thumbnailUrl, priceCents: item.catalogPriceCents, itemIds: [item.itemId] });
    }
    return [...groups.values()];
  }

  toggleProduct(key: string, checked: boolean): void {
    checked ? this.selectedProductKeys.add(key) : this.selectedProductKeys.delete(key);
  }

  selectAllVisible(): void {
    const rows = this.productGroups.filter(row => !!row.sku);
    const allSelected = rows.length > 0 && rows.every(row => this.selectedProductKeys.has(row.key));
    rows.forEach(row => allSelected ? this.selectedProductKeys.delete(row.key) : this.selectedProductKeys.add(row.key));
  }

  importProducts(): void {
    const itemIds = this.productGroups.filter(row => row.sku && this.selectedProductKeys.has(row.key)).flatMap(row => row.itemIds);
    if (itemIds.length === 0) {
      this.toastr.warning('Selecione ao menos um produto com SKU.', 'Importação');
      return;
    }
    this.importingCatalog = true;
    this.integrationService.importProducts(this.tenantId, this.clientId, false, itemIds)
      .pipe(finalize(() => (this.importingCatalog = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          const detail = `${result.productsCreated} produtos criados, ${result.productsUpdated} atualizados e ${result.mappingsCreated} anúncios vinculados.`;
          result.warnings.length ? this.toastr.warning(`${detail} ${result.warnings.length} aviso(s).`, 'Importação concluída') : this.toastr.success(detail, 'Importação concluída');
          this.loadStatus();
          this.loadCatalogPreview();
        },
        error: (error: HttpErrorResponse) => this.toastr.danger(this.buildErrorMessage('Falha ao importar catálogo.', error), 'Importação')
      });
  }

  searchSellerCatalog(): void {
    if (!/^\d+$/.test(this.sellerResearchId.trim())) {
      this.toastr.warning('Informe o Seller ID numérico.', 'Pesquisa de seller');
      return;
    }
    this.sellerResearchLoading = true;
    this.integrationService.searchSellerCatalog(this.tenantId, this.clientId, this.sellerResearchId, this.sellerResearchQuery)
      .pipe(finalize(() => (this.sellerResearchLoading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: items => (this.sellerResearchItems = items),
        error: (error: HttpErrorResponse) => this.toastr.danger(this.buildErrorMessage('Falha ao consultar o seller.', error), 'Pesquisa de seller')
      });
  }

  private buildErrorMessage(baseMessage: string, error: HttpErrorResponse): string {
    const apiMessage = typeof error.error?.message === 'string' ? error.error.message : null;
    const traceId =
      (typeof error.error?.traceId === 'string' ? error.error.traceId : null) ||
      error.headers?.get('X-Correlation-Id');

    const message = apiMessage && apiMessage.trim() ? apiMessage.trim() : baseMessage;
    return traceId ? `${message} (traceId: ${traceId})` : message;
  }
}
