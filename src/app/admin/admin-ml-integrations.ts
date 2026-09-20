import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NbButtonModule, NbCheckboxModule, NbToastrService } from '@nebular/theme';
import { Subject, finalize, takeUntil } from 'rxjs';
import { AdminMercadoLivreIntegrationService, CatalogSkuAssignment, FinancialCapabilityResult, MercadoLivreCatalogImportItem, MercadoLivreSellerCatalogItem } from '../core/services/admin-mercado-livre-integration.service';
import { AdminTenantContextService } from '../core/services/admin-tenant-context.service';
import { MercadoLivreIntegrationStatusResult } from '../core/services/mercado-livre-integration.service';
import { PageHeaderComponent } from '../shared/page-header/page-header.component';
import { UiStateComponent } from '../shared/ui-state/ui-state.component';

@Component({
  selector: 'app-admin-ml-integrations',
  standalone: true,
  imports: [CommonModule, FormsModule, NbButtonModule, NbCheckboxModule, PageHeaderComponent, UiStateComponent],
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
  importPhysicalStock = 1000;
  importCatalogPrice = 0;
  selectedProductKeys = new Set<string>();
  internalSkuByKey: Record<string, string> = {};
  createNewByKey: Record<string, boolean> = {};
  catalogCostByKey: Record<string, number> = {};
  sellerResearchId = '';
  sellerResearchQuery = '';
  sellerResearchLoading = false;
  sellerResearchItems: MercadoLivreSellerCatalogItem[] = [];
  financialCapabilities: FinancialCapabilityResult[] = [];
  probingFinancialCapabilities = false;
  financialProbeError: string | null = null;

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
      const itemId = this.route.snapshot.queryParamMap.get('itemId');
      if (itemId && /^MLB\d+$/i.test(itemId)) {
        this.catalogSearch = itemId.toUpperCase();
        this.loadCatalogPreview();
      }
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
          this.internalSkuByKey = {};
          this.createNewByKey = {};
          this.catalogCostByKey = {};
          for (const row of this.allProductGroups) this.createNewByKey[row.key] = false;
        },
        error: (error: HttpErrorResponse) => this.toastr.danger(this.buildErrorMessage('Falha ao buscar produtos.', error), 'Mercado Livre')
      });
  }

  get productGroups(): Array<{ key: string; sku: string | null; title: string; brand: string; thumbnailUrl: string | null; priceCents: number; entries: MercadoLivreCatalogImportItem[] }> {
    return this.buildProductGroups(this.catalogSearch.trim().toLowerCase());
  }

  private get allProductGroups(): ReturnType<AdminMlIntegrations['buildProductGroups']> {
    return this.buildProductGroups('');
  }

  private buildProductGroups(term: string): Array<{ key: string; sku: string | null; title: string; brand: string; thumbnailUrl: string | null; priceCents: number; entries: MercadoLivreCatalogImportItem[] }> {
    const groups = new Map<string, { key: string; sku: string | null; title: string; brand: string; thumbnailUrl: string | null; priceCents: number; entries: MercadoLivreCatalogImportItem[] }>();
    for (const item of this.catalogPreview) {
      if (term && !`${item.title} ${item.sku ?? ''} ${item.brand} ${item.itemId}`.toLowerCase().includes(term)) continue;
      const key = item.sku || `${item.itemId}|${item.variationId ?? ''}`;
      const existing = groups.get(key);
      if (existing) existing.entries.push(item);
      else groups.set(key, { key, sku: item.sku, title: item.title, brand: item.brand || '-', thumbnailUrl: item.thumbnailUrl, priceCents: item.catalogPriceCents, entries: [item] });
    }
    return [...groups.values()];
  }

  toggleProduct(key: string, checked: boolean): void {
    const next = new Set(this.selectedProductKeys);
    checked ? next.add(key) : next.delete(key);
    this.selectedProductKeys = next;
  }

  toggleRow(key: string): void {
    this.toggleProduct(key, !this.selectedProductKeys.has(key));
  }

  selectAllVisible(): void {
    const rows = this.productGroups;
    const allSelected = rows.length > 0 && rows.every(row => this.selectedProductKeys.has(row.key));
    const next = new Set(this.selectedProductKeys);
    rows.forEach(row => allSelected ? next.delete(row.key) : next.add(row.key));
    this.selectedProductKeys = next;
  }

  get canImportSelected(): boolean {
    return this.selectedProductKeys.size > 0 && this.allProductGroups
      .filter(row => this.selectedProductKeys.has(row.key))
      .every(row => /^[A-Z0-9][A-Z0-9\-_/]{0,63}$/.test((this.internalSkuByKey[row.key] ?? '').trim().toUpperCase())
        && !/^MLB\d+$/.test((this.internalSkuByKey[row.key] ?? '').trim().toUpperCase())
        && (!this.createNewByKey[row.key] || Number(this.catalogCostByKey[row.key] ?? this.importCatalogPrice) > 0));
  }

  importProducts(): void {
    const selectedRows = this.allProductGroups.filter(row => this.selectedProductKeys.has(row.key));
    const itemIds = [...new Set(selectedRows.flatMap(row => row.entries.map(entry => entry.itemId)))];
    if (itemIds.length === 0) {
      this.toastr.warning('Selecione ao menos um produto.', 'Importação');
      return;
    }
    if (!this.canImportSelected) {
      this.toastr.warning('Informe um SKU interno válido e, para produtos novos, um custo do seller maior que zero.', 'Importação');
      return;
    }
    const skuAssignments: CatalogSkuAssignment[] = selectedRows.flatMap(row => row.entries.map(entry => ({
      itemId: entry.itemId,
      variationId: entry.variationId ?? null,
      internalSku: this.internalSkuByKey[row.key].trim().toUpperCase(),
      createNewProduct: !!this.createNewByKey[row.key],
      catalogPriceCents: Math.round(Math.max(0, Number(this.catalogCostByKey[row.key] ?? this.importCatalogPrice) || 0) * 100)
    })));
    this.importingCatalog = true;
    const physicalStock = Math.max(0, Math.trunc(Number(this.importPhysicalStock) || 0));
    const catalogPriceCents = Math.round(Math.max(0, Number(this.importCatalogPrice) || 0) * 100);
    this.integrationService.importProducts(this.tenantId, this.clientId, false, itemIds, physicalStock, catalogPriceCents, skuAssignments)
      .pipe(finalize(() => (this.importingCatalog = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          const detail = `${result.productsCreated} produtos criados, ${result.productsLinkedExisting} SKUs existentes usados, ${result.mappingsCreated} vínculos novos e ${result.mappingsUpdated} remapeados.`;
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

  probeFinancialCapabilities(): void {
    this.probingFinancialCapabilities = true;
    this.financialProbeError = null;
    this.integrationService.probeFinancialCapabilities(this.tenantId, this.clientId)
      .pipe(finalize(() => (this.probingFinancialCapabilities = false)), takeUntil(this.destroy$))
      .subscribe({
        next: capabilities => {
          this.financialCapabilities = capabilities;
          if (capabilities.some(item => item.billingMercadoLivre)) {
            this.toastr.success('Acesso Billing ML verificado para pelo menos um seller.', 'Saúde financeira');
          } else {
            this.toastr.warning('Billing ML ainda não está autorizado. Valores permanecem estimados.', 'Saúde financeira');
          }
        },
        error: (error: HttpErrorResponse) => {
          this.financialProbeError = this.buildErrorMessage('Não foi possível verificar o acesso Billing.', error);
          this.toastr.danger(this.financialProbeError, 'Saúde financeira');
        }
      });
  }

  financialCapabilityLabel(item: FinancialCapabilityResult): string {
    if (item.billingMercadoLivre) return 'Billing ML verificado';
    if (item.pending.some(code => code.includes('RATE_LIMITED')))
      return 'Limite temporário do Mercado Livre; tente novamente em alguns minutos';
    if (item.pending.some(code => code.includes('UNAVAILABLE') || code.includes('PROBE_FAILED')))
      return 'Verificação temporariamente indisponível';
    return 'Billing ML não autorizado';
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
