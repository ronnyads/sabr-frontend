import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  NbButtonModule,
  NbCardModule,
  NbCheckboxModule,
  NbIconModule,
  NbInputModule,
  NbSpinnerModule,
  NbTabsetModule,
  NbToastrService
} from '@nebular/theme';
import { Subject, combineLatest, debounceTime, distinctUntilChanged, forkJoin, startWith, takeUntil } from 'rxjs';
import { AdminCategoriesService, AdminCategoryTreeNode } from '../core/services/admin-categories.service';
import { AdminCatalogResult, AdminCatalogsService } from '../core/services/admin-catalogs.service';
import { AdminProductImageResult, AdminProductResult, AdminProductsService } from '../core/services/admin-products.service';
import { AdminProductImagesService } from '../core/services/admin-product-images.service';
import { AdminProductVariantResult, AdminProductVariantsService } from '../core/services/admin-product-variants.service';
import { AdminTenantContextService } from '../core/services/admin-tenant-context.service';
import { formatBrlFromCents, parseBrlToCents } from '../core/utils/money.utils';
import { normalizeSkuUppercase } from '../core/utils/sku.utils';
import { UiStateComponent } from '../shared/ui-state/ui-state.component';

type ActiveFilter = 'all' | 'active' | 'inactive';

interface CategoryOption {
  id: string;
  slug: string;
  path: string;
  isActive: boolean;
}

interface VariantRow extends AdminProductVariantResult {
  editName: string;
  editCostPriceBrl: string;
  editCatalogPriceBrl: string;
  editPhysicalStock: number;
  editReservedStock: number;
  editIsActive: boolean;
  isDirty: boolean;
  isSaving: boolean;
  isDeactivating: boolean;
}

@Component({
  selector: 'app-admin-products',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NbCardModule,
    NbButtonModule,
    NbInputModule,
    NbIconModule,
    NbSpinnerModule,
    NbTabsetModule,
    NbCheckboxModule,
    UiStateComponent
  ],
  templateUrl: './admin-products.html',
  styleUrls: ['./admin-products.scss']
})
export class AdminProducts implements OnInit, OnDestroy {
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly activeFilterControl = new FormControl<ActiveFilter>('all', { nonNullable: true });

  private readonly fb = inject(FormBuilder);
  readonly form = this.fb.nonNullable.group({
    sku: ['', [Validators.required, Validators.maxLength(64)]],
    name: ['', [Validators.required, Validators.maxLength(250)]],
    brand: ['', [Validators.required, Validators.maxLength(120)]],
    ncm: ['', [Validators.pattern(/^\d{8}$/)]],
    categoryId: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', [Validators.maxLength(4000)]],
    ean: ['', [Validators.pattern(/^(?:\d{8}|\d{12}|\d{13}|\d{14})?$/)]],
    requiresAnatel: [false],
    anatelHomologationNumber: ['', [Validators.maxLength(32)]],
    anatelDocumentId: [''],
    widthCm: [0],
    heightCm: [0],
    lengthCm: [0],
    weightKg: [0],
    costPriceBrl: ['0,00', [Validators.required]],
    catalogPriceBrl: ['0,00', [Validators.required]],
    thumbnailUrl: ['', [Validators.maxLength(500)]],
    isActive: [false]
  });

  products: AdminProductResult[] = [];
  loading = false;
  errorMessage: string | null = null;

  formOpen = false;
  formError: string | null = null;
  saving = false;
  editingSku: string | null = null;

  currentImages: AdminProductImageResult[] = [];
  uploadInProgress = false;
  imageError: string | null = null;
  selectedUploadName: string | null = null;

  tenantSlug: string | null = null;
  catalogs: AdminCatalogResult[] = [];
  selectedCatalogIds: string[] = [];
  catalogsLoading = false;
  categoryOptions: CategoryOption[] = [];
  categoriesLoading = false;

  variantRows: VariantRow[] = [];
  variantsLoading = false;
  variantError: string | null = null;
  variantCreateSaving = false;
  readonly variantCreateForm = this.fb.nonNullable.group({
    variantSku: ['', [Validators.required, Validators.maxLength(64)]],
    name: ['', [Validators.maxLength(250)]],
    costPriceBrl: ['0,00', [Validators.required]],
    catalogPriceBrl: ['0,00', [Validators.required]],
    physicalStock: [0, [Validators.min(0)]],
    reservedStock: [0, [Validators.min(0)]],
    isActive: [true]
  });

  skip = 0;
  limit = 20;
  total = 0;

  private readonly destroy$ = new Subject<void>();
  private readonly anatelPatternValidator = Validators.pattern(/^[0-9/-]{6,32}$/);

  constructor(
    private readonly productsService: AdminProductsService,
    private readonly productImagesService: AdminProductImagesService,
    private readonly productVariantsService: AdminProductVariantsService,
    private readonly categoriesService: AdminCategoriesService,
    private readonly catalogsService: AdminCatalogsService,
    private readonly tenantContext: AdminTenantContextService,
    private readonly toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    this.tenantSlug = this.tenantContext.get()?.tenantId ?? null;
    this.loadCatalogs();
    this.loadCategories();

    this.form.controls.requiresAnatel.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((enabled) => {
      this.applyAnatelValidators(!!enabled);
    });
    this.applyAnatelValidators(!!this.form.controls.requiresAnatel.value);

    combineLatest([
      this.searchControl.valueChanges.pipe(startWith(this.searchControl.value), debounceTime(300), distinctUntilChanged()),
      this.activeFilterControl.valueChanges.pipe(startWith(this.activeFilterControl.value), distinctUntilChanged())
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.skip = 0;
        this.loadProducts();
      });

    this.loadProducts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get empty(): boolean {
    return !this.loading && !this.errorMessage && this.products.length === 0;
  }

  get hasPreviousPage(): boolean {
    return this.skip > 0;
  }

  get hasNextPage(): boolean {
    return this.skip + this.limit < this.total;
  }

  get canUploadImages(): boolean {
    return !!this.editingSku;
  }

  get activeWithoutCatalogs(): boolean {
    return !!this.form.controls.isActive.value && this.selectedCatalogIds.length === 0;
  }

productTrackBy(_: number, item: AdminProductResult): string {
    return item.sku;
  }

  imageTrackBy(_: number, item: AdminProductImageResult): string {
    return item.id;
  }

  variantTrackBy(_: number, item: VariantRow): string {
    return item.variantSku;
  }

  get canManageVariants(): boolean {
    return !!this.editingSku;
  }

  categoryLabel(slug: string | null | undefined): string {
    if (!slug) {
      return '-';
    }

    const option = this.categoryOptions.find((item) => item.slug === slug);
    return option?.path ?? slug;
  }

  openCreate(): void {
    this.formOpen = true;
    this.formError = null;
    this.imageError = null;
    this.editingSku = null;
    this.currentImages = [];
    this.selectedCatalogIds = [];
    this.selectedUploadName = null;
    this.variantRows = [];
    this.variantError = null;
    this.variantCreateForm.reset({
      variantSku: '',
      name: '',
      costPriceBrl: '0,00',
      catalogPriceBrl: '0,00',
      physicalStock: 0,
      reservedStock: 0,
      isActive: true
    });
    this.form.reset({
      sku: '',
      name: '',
      brand: '',
      ncm: '',
      categoryId: this.getDefaultCategorySlug(),
      description: '',
      ean: '',
      requiresAnatel: false,
      anatelHomologationNumber: '',
      anatelDocumentId: '',
      widthCm: 0,
      heightCm: 0,
      lengthCm: 0,
      weightKg: 0,
      costPriceBrl: '0,00',
      catalogPriceBrl: '0,00',
      thumbnailUrl: '',
      isActive: false
    });
    this.form.controls.sku.enable({ emitEvent: false });
  }

  openEdit(product: AdminProductResult): void {
    this.formOpen = true;
    this.formError = null;
    this.imageError = null;
    this.editingSku = product.sku;
    this.selectedUploadName = null;

    this.form.reset({
      sku: product.sku,
      name: product.name,
      brand: product.brand ?? '',
      ncm: product.ncm ?? '',
      categoryId: product.categoryId ?? this.getDefaultCategorySlug(),
      description: product.description ?? '',
      ean: product.ean ?? '',
      requiresAnatel: product.requiresAnatel ?? false,
      anatelHomologationNumber: product.anatelHomologationNumber ?? '',
      anatelDocumentId: product.anatelDocumentId ?? '',
      widthCm: product.widthCm ?? 0,
      heightCm: product.heightCm ?? 0,
      lengthCm: product.lengthCm ?? 0,
      weightKg: product.weightKg ?? 0,
      costPriceBrl: this.formatBrlInput(product.costPriceCents),
      catalogPriceBrl: this.formatBrlInput(product.catalogPriceCents),
      thumbnailUrl: product.thumbnailUrl ?? '',
      isActive: product.isActive
    });
    this.form.controls.sku.disable({ emitEvent: false });

    this.currentImages = [];
    this.productsService
      .getBySku(product.sku)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (full) => {
          this.currentImages = [...(full.images ?? [])];
        },
        error: () => {
          this.currentImages = [];
        }
      });
    this.loadVariants(product.sku);
    this.catalogsLoading = true;
    this.productsService
      .getCatalogLinks(product.sku)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (links) => {
          this.catalogsLoading = false;
          this.selectedCatalogIds = [...(links.catalogIds ?? [])];
        },
        error: (error: HttpErrorResponse) => {
          this.catalogsLoading = false;
          this.selectedCatalogIds = [];
          this.toastr.danger(this.buildErrorMessage('Falha ao carregar catalogos vinculados.', error), 'Erro');
        }
      });
  }

  cancelForm(): void {
    this.formOpen = false;
    this.formError = null;
    this.imageError = null;
    this.editingSku = null;
    this.currentImages = [];
    this.selectedCatalogIds = [];
    this.selectedUploadName = null;
    this.variantRows = [];
    this.variantError = null;
  }

  save(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      if (this.form.invalid) {
        const firstInvalidField = this.getFirstInvalidFieldLabel();
        this.formError = firstInvalidField
          ? `Preencha corretamente o campo obrigatorio: ${firstInvalidField}.`
          : 'Formulario invalido. Revise os campos obrigatorios.';
      }
      return;
    }

    if (this.form.controls.requiresAnatel.value && !this.form.controls.anatelHomologationNumber.value.trim()) {
      this.formError = 'Homologacao ANATEL e obrigatoria quando a opcao esta habilitada.';
      return;
    }

    if (this.form.controls.isActive.value && this.selectedCatalogIds.length === 0) {
      this.formError = 'Produto ativo precisa de pelo menos um catalogo vinculado.';
      return;
    }

    const raw = this.form.getRawValue();
    const sku = normalizeSkuUppercase(raw.sku);
    const intendedActive = !!raw.isActive;
    const baseRequest = {
      name: raw.name.trim(),
      brand: raw.brand.trim(),
      ncm: raw.ncm.trim() || null,
      ean: raw.ean.trim() || null,
      description: raw.description.trim() || null,
      categoryId: raw.categoryId.trim() || this.getDefaultCategorySlug() || null,
      thumbnailUrl: raw.thumbnailUrl.trim() || null,
      widthCm: Number(raw.widthCm) >= 0 ? Number(raw.widthCm) : 0,
      heightCm: Number(raw.heightCm) >= 0 ? Number(raw.heightCm) : 0,
      lengthCm: Number(raw.lengthCm) >= 0 ? Number(raw.lengthCm) : 0,
      weightKg: Number(raw.weightKg) >= 0 ? Number(raw.weightKg) : 0,
      requiresAnatel: !!raw.requiresAnatel,
      anatelHomologationNumber: raw.anatelHomologationNumber.trim() || null,
      anatelDocumentId: raw.anatelDocumentId.trim() || null,
      tenantSlug: this.tenantSlug,
      costPriceCents: parseBrlToCents(raw.costPriceBrl),
      catalogPriceCents: parseBrlToCents(raw.catalogPriceBrl)
    };

    this.saving = true;
    this.formError = null;

    if (!this.editingSku) {
      this.productsService
        .create({
          ...baseRequest,
          sku,
          isActive: false
        })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.afterBaseSave(sku, intendedActive);
          },
          error: (error: HttpErrorResponse) => {
            this.saving = false;
            this.formError = this.buildErrorMessage('Falha ao criar produto.', error);
          }
        });
      return;
    }

    this.productsService
      .update(this.editingSku, {
        ...baseRequest,
        isActive: intendedActive && this.selectedCatalogIds.length === 0 ? false : raw.isActive
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.afterBaseSave(this.editingSku!, intendedActive);
        },
        error: (error: HttpErrorResponse) => {
          this.saving = false;
          this.formError = this.buildErrorMessage('Falha ao atualizar produto.', error);
        }
      });
  }

  deactivate(product: AdminProductResult): void {
    if (this.loading || this.saving) {
      return;
    }

    if (!confirm(`Inativar SKU ${product.sku}?`)) {
      return;
    }

    this.productsService
      .deactivate(product.sku)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success('Produto inativado.', 'Sucesso');
          this.loadProducts();
        },
        error: (error: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao inativar produto.', error), 'Erro');
        }
      });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.selectedUploadName = file?.name ?? null;
    if (!file || !this.editingSku) {
      return;
    }

    const allowedTypes = ['image/svg+xml', 'image/png', 'image/jpeg'];
    const extension = file.name.toLowerCase();
    const allowedExtension = extension.endsWith('.svg') || extension.endsWith('.png') || extension.endsWith('.jpg') || extension.endsWith('.jpeg');
    if (!allowedTypes.includes(file.type) || !allowedExtension) {
      this.imageError = 'Formato invalido. Envie apenas SVG, PNG ou JPEG.';
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.imageError = 'Arquivo excede 5MB.';
      input.value = '';
      return;
    }

    this.uploadInProgress = true;
    this.imageError = null;

    this.productImagesService
      .upload(this.editingSku, file)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (image) => {
          this.uploadInProgress = false;
          this.currentImages = [...this.currentImages, image].sort((a, b) => a.sortOrder - b.sortOrder);
          this.toastr.success('Imagem enviada com sucesso.', 'Sucesso');
          input.value = '';
        },
        error: (error: HttpErrorResponse) => {
          this.uploadInProgress = false;
          this.imageError = this.buildErrorMessage('Falha ao enviar imagem.', error);
          input.value = '';
        }
      });
  }

  markPrimary(image: AdminProductImageResult): void {
    if (!this.editingSku) {
      return;
    }

    this.productImagesService
      .setPrimary(this.editingSku, image.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (primary) => {
          this.currentImages = this.currentImages.map((item) => ({ ...item, isPrimary: item.id === primary.id }));
          this.toastr.success('Imagem principal atualizada.', 'Sucesso');
        },
        error: (error: HttpErrorResponse) => {
          this.imageError = this.buildErrorMessage('Falha ao atualizar imagem principal.', error);
        }
      });
  }

  removeImage(image: AdminProductImageResult): void {
    if (!this.editingSku) {
      return;
    }

    this.productImagesService
      .delete(this.editingSku, image.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.currentImages = this.currentImages.filter((item) => item.id !== image.id);
          this.toastr.success('Imagem removida.', 'Sucesso');
        },
        error: (error: HttpErrorResponse) => {
          this.imageError = this.buildErrorMessage('Falha ao remover imagem.', error);
        }
      });
  }

  toggleCatalog(catalogId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false;
    if (checked) {
      if (!this.selectedCatalogIds.includes(catalogId)) {
        this.selectedCatalogIds = [...this.selectedCatalogIds, catalogId];
      }
      return;
    }

    this.selectedCatalogIds = this.selectedCatalogIds.filter((item) => item !== catalogId);
  }

  isCatalogSelected(catalogId: string): boolean {
    return this.selectedCatalogIds.includes(catalogId);
  }

  previousPage(): void {
    if (!this.hasPreviousPage) {
      return;
    }

    this.skip = Math.max(this.skip - this.limit, 0);
    this.loadProducts();
  }

  nextPage(): void {
    if (!this.hasNextPage) {
      return;
    }

    this.skip += this.limit;
    this.loadProducts();
  }

  retry(): void {
    this.loadProducts();
  }

  formatMoney(cents: number): string {
    return formatBrlFromCents(cents);
  }

  resolveImageUrl(url?: string | null): string | null {
    const raw = (url ?? '').trim();
    if (!raw) {
      return null;
    }

    if (/^(?:https?:)?\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
      return raw;
    }

    return raw.startsWith('/') ? raw : `/${raw}`;
  }

  private afterBaseSave(sku: string, intendedActive: boolean): void {
    const catalogIds = [...new Set(this.selectedCatalogIds)];
    this.productsService
      .replaceCatalogLinks(sku, catalogIds)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          if (!intendedActive || catalogIds.length === 0) {
            this.finishSave('Produto salvo com sucesso.');
            return;
          }

          this.productsService
            .update(sku, { isActive: true })
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => this.finishSave('Produto salvo com sucesso.'),
              error: (error: HttpErrorResponse) => {
                this.saving = false;
                this.formError = this.buildErrorMessage('Falha ao ativar produto apos vincular catalogos.', error);
              }
            });
        },
        error: (error: HttpErrorResponse) => {
          this.saving = false;
          this.formError = this.buildErrorMessage('Falha ao salvar vinculos de catalogo.', error);
        }
      });
  }

  private finishSave(message: string): void {
    this.saving = false;
    this.formOpen = false;
    this.toastr.success(message, 'Sucesso');
    this.loadProducts();
  }

  private loadProducts(): void {
    this.loading = true;
    this.errorMessage = null;

    const search = this.searchControl.value;
    const activeFilter = this.activeFilterControl.value;
    const isActive = activeFilter === 'all' ? null : activeFilter === 'active';

    this.productsService
      .list(this.skip, this.limit, search, isActive)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.products = response.items ?? [];
          this.total = response.total ?? 0;
          this.loading = false;
        },
        error: (error: HttpErrorResponse) => {
          this.loading = false;
          this.errorMessage = this.buildErrorMessage('Falha ao carregar produtos.', error);
        }
      });
  }

  private loadCatalogs(): void {
    this.catalogsLoading = true;
    this.catalogsService
      .list(0, 200, undefined, true)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.catalogsLoading = false;
          this.catalogs = response.items ?? [];
        },
        error: (error: HttpErrorResponse) => {
          this.catalogsLoading = false;
          this.catalogs = [];
          this.toastr.danger(this.buildErrorMessage('Falha ao carregar catálogos do cliente.', error), 'Erro');
        }
      });
  }

  private loadCategories(): void {
    this.categoriesLoading = true;
    this.categoriesService
      .tree()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (tree) => {
          this.categoriesLoading = false;
          this.categoryOptions = this.flattenCategoryTree(tree);
          const current = (this.form.controls.categoryId.value ?? '').trim();
          if (!current && this.categoryOptions.length > 0) {
            this.form.controls.categoryId.setValue(this.getDefaultCategorySlug(), { emitEvent: false });
          }
        },
        error: (error: HttpErrorResponse) => {
          this.categoriesLoading = false;
          this.categoryOptions = [];
          this.toastr.danger(this.buildErrorMessage('Falha ao carregar categorias.', error), 'Erro');
        }
      });
  }

  private flattenCategoryTree(nodes: AdminCategoryTreeNode[]): CategoryOption[] {
    const result: CategoryOption[] = [];
    const walk = (items: AdminCategoryTreeNode[]) => {
      for (const item of items) {
        result.push({
          id: item.id,
          slug: item.slug,
          path: item.path,
          isActive: item.isActive
        });

        if (item.children?.length) {
          walk(item.children);
        }
      }
    };

    walk(nodes ?? []);
    return result.sort((a, b) => a.path.localeCompare(b.path, 'pt-BR'));
  }

  private getDefaultCategorySlug(): string {
    const uncategorized = this.categoryOptions.find((item) => item.slug === 'uncategorized');
    if (uncategorized) {
      return uncategorized.slug;
    }

    return this.categoryOptions[0]?.slug ?? 'uncategorized';
  }

  private loadVariants(sku: string): void {
    this.variantsLoading = true;
    this.variantError = null;

    this.productVariantsService
      .list(sku)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (variants) => {
          this.variantsLoading = false;
          this.variantRows = (variants ?? []).map((item) => this.toVariantRow(item));
          this.variantCreateForm.reset({
            variantSku: '',
            name: '',
            costPriceBrl: this.formatBrlInput(parseBrlToCents(this.form.controls.costPriceBrl.value || '0')),
            catalogPriceBrl: this.formatBrlInput(parseBrlToCents(this.form.controls.catalogPriceBrl.value || '0')),
            physicalStock: 0,
            reservedStock: 0,
            isActive: true
          });
        },
        error: (error: HttpErrorResponse) => {
          this.variantsLoading = false;
          this.variantRows = [];
          this.variantError = this.buildErrorMessage('Falha ao carregar variacoes.', error);
        }
      });
  }

  createVariant(): void {
    if (!this.editingSku || this.variantCreateForm.invalid || this.variantCreateSaving) {
      this.variantCreateForm.markAllAsTouched();
      return;
    }

    const raw = this.variantCreateForm.getRawValue();
    const request = {
      variantSku: normalizeSkuUppercase(raw.variantSku),
      name: raw.name.trim() || null,
      costPriceCents: parseBrlToCents(raw.costPriceBrl),
      catalogPriceCents: parseBrlToCents(raw.catalogPriceBrl),
      physicalStock: Math.max(0, Number(raw.physicalStock) || 0),
      reservedStock: Math.max(0, Number(raw.reservedStock) || 0),
      isActive: !!raw.isActive
    };

    this.variantCreateSaving = true;
    this.productVariantsService
      .create(this.editingSku, request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (variant) => {
          this.variantCreateSaving = false;
          this.variantRows = [...this.variantRows, this.toVariantRow(variant)].sort((a, b) => a.variantSku.localeCompare(b.variantSku));
          this.variantCreateForm.reset({
            variantSku: '',
            name: '',
            costPriceBrl: this.formatBrlInput(variant.costPriceCents),
            catalogPriceBrl: this.formatBrlInput(variant.catalogPriceCents),
            physicalStock: 0,
            reservedStock: 0,
            isActive: true
          });
          this.toastr.success('Variacao criada com sucesso.', 'Sucesso');
        },
        error: (error: HttpErrorResponse) => {
          this.variantCreateSaving = false;
          this.variantError = this.buildErrorMessage('Falha ao criar variacao.', error);
        }
      });
  }

  onVariantChanged(row: VariantRow): void {
    row.isDirty = true;
  }

  saveVariant(row: VariantRow): void {
    if (!this.editingSku || row.isSaving) {
      return;
    }

    row.isSaving = true;
    const request = {
      name: row.editName.trim(),
      costPriceCents: parseBrlToCents(row.editCostPriceBrl),
      catalogPriceCents: parseBrlToCents(row.editCatalogPriceBrl),
      physicalStock: Math.max(0, Number(row.editPhysicalStock) || 0),
      reservedStock: Math.max(0, Number(row.editReservedStock) || 0),
      isActive: !!row.editIsActive
    };

    this.productVariantsService
      .update(this.editingSku, row.variantSku, request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          row.isSaving = false;
          row.isDirty = false;
          this.applyVariantRow(row, updated);
          this.toastr.success('Variacao atualizada.', 'Sucesso');
        },
        error: (error: HttpErrorResponse) => {
          row.isSaving = false;
          this.variantError = this.buildErrorMessage('Falha ao atualizar variacao.', error);
        }
      });
  }

  deactivateVariant(row: VariantRow): void {
    if (!this.editingSku || row.isDeactivating || !row.isActive) {
      return;
    }

    row.isDeactivating = true;
    this.productVariantsService
      .deactivate(this.editingSku, row.variantSku)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          row.isDeactivating = false;
          row.isActive = false;
          row.editIsActive = false;
          row.isDirty = false;
          this.toastr.success('Variacao inativada.', 'Sucesso');
        },
        error: (error: HttpErrorResponse) => {
          row.isDeactivating = false;
          this.variantError = this.buildErrorMessage('Falha ao inativar variacao.', error);
        }
      });
  }

  private toVariantRow(item: AdminProductVariantResult): VariantRow {
    return {
      ...item,
      editName: item.name,
      editCostPriceBrl: this.formatBrlInput(item.costPriceCents),
      editCatalogPriceBrl: this.formatBrlInput(item.catalogPriceCents),
      editPhysicalStock: item.physicalStock,
      editReservedStock: item.reservedStock,
      editIsActive: item.isActive,
      isDirty: false,
      isSaving: false,
      isDeactivating: false
    };
  }

  private applyVariantRow(target: VariantRow, source: AdminProductVariantResult): void {
    target.name = source.name;
    target.costPriceCents = source.costPriceCents;
    target.catalogPriceCents = source.catalogPriceCents;
    target.physicalStock = source.physicalStock;
    target.reservedStock = source.reservedStock;
    target.availableStock = source.availableStock;
    target.isActive = source.isActive;
    target.updatedAt = source.updatedAt;

    target.editName = source.name;
    target.editCostPriceBrl = this.formatBrlInput(source.costPriceCents);
    target.editCatalogPriceBrl = this.formatBrlInput(source.catalogPriceCents);
    target.editPhysicalStock = source.physicalStock;
    target.editReservedStock = source.reservedStock;
    target.editIsActive = source.isActive;
  }

  private formatBrlInput(cents: number): string {
    const value = (Number(cents) || 0) / 100;
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private buildErrorMessage(baseMessage: string, error: HttpErrorResponse): string {
    const apiMessage = typeof error.error?.message === 'string' ? error.error.message : null;
    const traceId =
      (typeof error.error?.traceId === 'string' ? error.error.traceId : null) ||
      error.headers?.get('X-Correlation-Id');

    const message = apiMessage && apiMessage.trim() ? apiMessage.trim() : baseMessage;
    return traceId ? `${message} (traceId: ${traceId})` : message;
  }

  private applyAnatelValidators(enabled: boolean): void {
    const control = this.form.controls.anatelHomologationNumber;
    if (enabled) {
      control.enable({ emitEvent: false });
      control.setValidators([Validators.required, Validators.maxLength(32), this.anatelPatternValidator]);
    } else {
      control.clearValidators();
      control.disable({ emitEvent: false });
    }
    control.updateValueAndValidity({ emitEvent: false });
  }

  private getFirstInvalidFieldLabel(): string | null {
    const labels: Record<string, string> = {
      sku: 'SKU',
      name: 'Nome',
      brand: 'Marca',
      categoryId: 'Categoria',
      ncm: 'NCM',
      ean: 'EAN/GTIN',
      anatelHomologationNumber: 'Numero Homologacao ANATEL',
      costPriceBrl: 'Custo (R$)',
      catalogPriceBrl: 'Preco Catalogo (R$)'
    };

    const entries = Object.entries(this.form.controls) as Array<[string, { invalid: boolean }]>;
    const first = entries.find(([, control]) => control.invalid);
    if (!first) {
      return null;
    }

    return labels[first[0]] ?? first[0];
  }
}
