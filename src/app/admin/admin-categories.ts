import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { NbButtonModule, NbCardModule, NbIconModule, NbInputModule, NbToastrService } from '@nebular/theme';
import { Subject, combineLatest, debounceTime, distinctUntilChanged, startWith, takeUntil } from 'rxjs';
import {
  AdminCategoriesService,
  AdminCategoryResult,
  AdminCategoryTreeNode,
  AdminCategoryUpsertRequest
} from '../core/services/admin-categories.service';
import { UiStateComponent } from '../shared/ui-state/ui-state.component';

type ActiveFilter = 'all' | 'active' | 'inactive';

interface FlatTreeNode {
  id: string;
  path: string;
  isActive: boolean;
}

interface CategoryIconOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-admin-categories',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NbCardModule, NbButtonModule, NbInputModule, NbIconModule, UiStateComponent],
  templateUrl: './admin-categories.html',
  styleUrls: ['./admin-categories.scss']
})
export class AdminCategories implements OnInit, OnDestroy {
  private static readonly slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  readonly iconOptions: ReadonlyArray<CategoryIconOption> = [
    { value: 'pricetags-outline', label: 'Etiqueta' },
    { value: 'cube-outline', label: 'Produto' },
    { value: 'archive-outline', label: 'Estoque' },
    { value: 'grid-outline', label: 'Catalogo' },
    { value: 'monitor-outline', label: 'Monitor' },
    { value: 'tv-outline', label: 'TV' },
    { value: 'smartphone-outline', label: 'Smartphone' },
    { value: 'tablet-outline', label: 'Tablet' },
    { value: 'laptop-outline', label: 'Notebook' },
    { value: 'hard-drive-outline', label: 'Armazenamento' },
    { value: 'camera-outline', label: 'Camera' },
    { value: 'video-outline', label: 'Video' },
    { value: 'radio-outline', label: 'Som' },
    { value: 'headphones-outline', label: 'Fone' },
    { value: 'speaker-outline', label: 'Caixa de Som' },
    { value: 'mic-outline', label: 'Microfone' },
    { value: 'printer-outline', label: 'Impressora' },
    { value: 'wifi-outline', label: 'Rede' },
    { value: 'bluetooth-outline', label: 'Bluetooth' },
    { value: 'flash-off-outline', label: 'Baixo Consumo' },
    { value: 'car-outline', label: 'Carro' },
    { value: 'bicycle-outline', label: 'Bicicleta' },
    { value: 'briefcase-outline', label: 'Escritorio' },
    { value: 'shopping-cart-outline', label: 'Carrinho' },
    { value: 'gift-outline', label: 'Presente' },
    { value: 'home-outline', label: 'Casa' },
    { value: 'sun-outline', label: 'Climatizacao' },
    { value: 'moon-outline', label: 'Dormitorio' },
    { value: 'droplet-outline', label: 'Refrigeracao' },
    { value: 'shopping-bag-outline', label: 'Sacola' },
    { value: 'flash-outline', label: 'Energia' },
    { value: 'shield-outline', label: 'Seguranca' },
    { value: 'lock-outline', label: 'Acesso' },
    { value: 'star-outline', label: 'Destaque' },
    { value: 'bookmark-outline', label: 'Favorito' },
    { value: 'checkmark-circle-2-outline', label: 'Aprovado' },
    { value: 'settings-2-outline', label: 'Configuracao' }
  ];

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly activeFilterControl = new FormControl<ActiveFilter>('all', { nonNullable: true });
  readonly iconSearchControl = new FormControl('', { nonNullable: true });

  private readonly unknownIconFallback = 'question-mark-circle-outline';
  private readonly fb = inject(FormBuilder);
  private readonly destroy$ = new Subject<void>();

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    slug: ['', [Validators.required, Validators.maxLength(120), Validators.pattern(AdminCategories.slugPattern)]],
    parentId: [''],
    icon: ['', [Validators.maxLength(120)]],
    description: ['', [Validators.maxLength(600)]],
    isActive: [true]
  });

  categories: AdminCategoryResult[] = [];
  categoryTree: FlatTreeNode[] = [];
  resolvedIconOptions: ReadonlyArray<CategoryIconOption> = this.iconOptions;
  filteredIconOptions: ReadonlyArray<CategoryIconOption> = this.iconOptions;

  loading = false;
  errorMessage: string | null = null;
  formOpen = false;
  formError: string | null = null;
  saving = false;
  editingCategoryId: string | null = null;

  skip = 0;
  limit = 20;
  total = 0;

  private categoryLabelById = new Map<string, string>();
  private slugManuallyEdited = false;
  private unknownIconFromLegacy: string | null = null;

  constructor(private readonly categoriesService: AdminCategoriesService, private readonly toastr: NbToastrService) {}

  ngOnInit(): void {
    combineLatest([
      this.searchControl.valueChanges.pipe(startWith(this.searchControl.value), debounceTime(300), distinctUntilChanged()),
      this.activeFilterControl.valueChanges.pipe(startWith(this.activeFilterControl.value), distinctUntilChanged())
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.skip = 0;
        this.loadCategories();
      });

    this.loadTree();
    this.loadCategories();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get empty(): boolean {
    return !this.loading && !this.errorMessage && this.categories.length === 0;
  }

  get hasPreviousPage(): boolean {
    return this.skip > 0;
  }

  get hasNextPage(): boolean {
    return this.skip + this.limit < this.total;
  }

  get selectedIconPreview(): string {
    const icon = this.normalizeOptional(this.form.controls.icon.value);
    if (!icon) {
      return 'pricetags-outline';
    }

    return this.isAllowedIcon(icon) ? icon : this.unknownIconFallback;
  }

  get isUnknownIconSelected(): boolean {
    const icon = this.normalizeOptional(this.form.controls.icon.value);
    return !!icon && !this.isAllowedIcon(icon);
  }

  trackByCategory(_: number, item: AdminCategoryResult): string {
    return item.id;
  }

  trackByIconOption(_: number, item: CategoryIconOption): string {
    return item.value;
  }

  resolveParentLabel(category: AdminCategoryResult): string {
    if (!category.parentId) {
      return 'Raiz';
    }

    const parentPath = this.categoryLabelById.get(category.parentId);
    if (parentPath?.trim()) {
      return this.formatPath(parentPath);
    }

    const parentName = (category as AdminCategoryResult & { parentName?: string | null }).parentName;
    if (typeof parentName === 'string' && parentName.trim()) {
      return parentName.trim();
    }

    if (typeof category.parentSlug === 'string' && category.parentSlug.trim()) {
      return category.parentSlug.trim();
    }

    return 'Pai nao encontrado';
  }

  resolveParentHint(category: AdminCategoryResult): string {
    return category.parentId ? this.resolveParentLabel(category) : 'Sem categoria pai';
  }

  onNameInput(): void {
    if (this.slugManuallyEdited) {
      return;
    }

    const generated = this.slugifyCategoryName(this.form.controls.name.value);
    this.form.controls.slug.setValue(generated, { emitEvent: false });
  }

  onSlugInput(): void {
    const normalized = this.slugifyCategoryName(this.form.controls.slug.value);
    if (normalized !== this.form.controls.slug.value) {
      this.form.controls.slug.setValue(normalized, { emitEvent: false });
    }

    const expected = this.slugifyCategoryName(this.form.controls.name.value);
    this.slugManuallyEdited = normalized !== expected;
  }

  onIconSearchInput(): void {
    this.applyIconFilter();
  }

  openCreate(): void {
    this.formOpen = true;
    this.formError = null;
    this.editingCategoryId = null;
    this.slugManuallyEdited = false;
    this.unknownIconFromLegacy = null;
    this.iconSearchControl.setValue('', { emitEvent: false });

    this.form.reset({
      name: '',
      slug: '',
      parentId: '',
      icon: '',
      description: '',
      isActive: true
    });

    this.refreshResolvedIconOptions();
  }

  openEdit(category: AdminCategoryResult): void {
    this.formOpen = true;
    this.formError = null;
    this.editingCategoryId = category.id;

    const normalizedSlug = this.slugifyCategoryName(category.slug || category.name);
    const nameBasedSlug = this.slugifyCategoryName(category.name);
    const normalizedIcon = this.normalizeOptional(category.icon) ?? '';

    this.slugManuallyEdited = normalizedSlug !== nameBasedSlug;
    this.unknownIconFromLegacy = normalizedIcon && !this.isAllowedIcon(normalizedIcon) ? normalizedIcon : null;
    this.iconSearchControl.setValue('', { emitEvent: false });

    this.form.patchValue({
      name: category.name,
      slug: normalizedSlug,
      parentId: category.parentId ?? '',
      icon: normalizedIcon,
      description: category.description ?? '',
      isActive: category.isActive
    });

    this.refreshResolvedIconOptions();
  }

  cancelForm(): void {
    this.formOpen = false;
    this.formError = null;
    this.editingCategoryId = null;
  }

  saveCategory(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const normalizedSlug = this.slugifyCategoryName(raw.slug);
    if (!normalizedSlug) {
      this.form.controls.slug.setErrors({ required: true });
      this.form.controls.slug.markAsTouched();
      this.formError = 'Slug invalido. Use letras, numeros e hifen.';
      return;
    }

    const request: AdminCategoryUpsertRequest = {
      name: raw.name.trim(),
      slug: normalizedSlug,
      parentId: raw.parentId.trim() || null,
      icon: this.normalizeOptional(raw.icon),
      description: raw.description.trim() || null,
      isActive: !!raw.isActive
    };

    this.saving = true;
    this.formError = null;

    const request$ = this.editingCategoryId
      ? this.categoriesService.update(this.editingCategoryId, request)
      : this.categoriesService.create(request);

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.formOpen = false;
        this.toastr.success('Categoria salva com sucesso.', 'Sucesso');
        this.loadTree();
        this.loadCategories();
      },
      error: (error: HttpErrorResponse) => {
        this.saving = false;
        if (error.error?.code === 'CATEGORY_SLUG_ALREADY_EXISTS') {
          this.form.controls.slug.setErrors({ duplicate: true });
        }
        this.formError = this.buildErrorMessage('Falha ao salvar categoria.', error);
      }
    });
  }

  deactivate(category: AdminCategoryResult): void {
    if (!category.isActive) {
      return;
    }

    if (!confirm(`Inativar categoria ${category.name}?`)) {
      return;
    }

    this.categoriesService
      .deactivate(category.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success('Categoria inativada.', 'Sucesso');
          this.loadTree();
          this.loadCategories();
        },
        error: (error: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao inativar categoria.', error), 'Erro');
        }
      });
  }

  retry(): void {
    this.loadTree();
    this.loadCategories();
  }

  previousPage(): void {
    if (!this.hasPreviousPage) {
      return;
    }

    this.skip = Math.max(0, this.skip - this.limit);
    this.loadCategories();
  }

  nextPage(): void {
    if (!this.hasNextPage) {
      return;
    }

    this.skip += this.limit;
    this.loadCategories();
  }

  private loadCategories(): void {
    this.loading = true;
    this.errorMessage = null;

    const activeFilter = this.activeFilterControl.value;
    const isActive = activeFilter === 'all' ? null : activeFilter === 'active';

    this.categoriesService
      .list(this.skip, this.limit, this.searchControl.value, isActive)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.categories = response.items ?? [];
          this.total = response.total ?? 0;
          this.loading = false;
        },
        error: (error: HttpErrorResponse) => {
          this.loading = false;
          this.errorMessage = this.buildErrorMessage('Falha ao carregar categorias.', error);
        }
      });
  }

  private loadTree(): void {
    this.categoriesService
      .tree()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (tree) => {
          this.categoryTree = this.flattenTree(tree);
          this.categoryLabelById = new Map(this.categoryTree.map((node) => [node.id, node.path]));
        },
        error: () => {
          this.categoryTree = [];
          this.categoryLabelById.clear();
        }
      });
  }

  private flattenTree(tree: AdminCategoryTreeNode[]): FlatTreeNode[] {
    const items: FlatTreeNode[] = [];

    const walk = (nodes: AdminCategoryTreeNode[]) => {
      for (const node of nodes) {
        items.push({ id: node.id, path: node.path, isActive: node.isActive });
        if (node.children?.length) {
          walk(node.children);
        }
      }
    };

    walk(tree);
    return items;
  }

  private buildErrorMessage(baseMessage: string, error: HttpErrorResponse): string {
    const apiMessage = typeof error.error?.message === 'string' ? error.error.message : null;
    const traceId =
      (typeof error.error?.traceId === 'string' ? error.error.traceId : null) ||
      error.headers?.get('X-Correlation-Id');

    const message = apiMessage && apiMessage.trim() ? apiMessage.trim() : baseMessage;
    return traceId ? `${message} (traceId: ${traceId})` : message;
  }

  private formatPath(path: string): string {
    return path.split(' / ').join(' > ');
  }

  private slugifyCategoryName(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[_\s]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);
  }

  private normalizeOptional(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private isAllowedIcon(icon: string): boolean {
    return this.iconOptions.some((item) => item.value === icon);
  }

  private refreshResolvedIconOptions(): void {
    if (!this.unknownIconFromLegacy) {
      this.resolvedIconOptions = this.iconOptions;
      this.applyIconFilter();
      return;
    }

    if (this.iconOptions.some((item) => item.value === this.unknownIconFromLegacy)) {
      this.resolvedIconOptions = this.iconOptions;
      this.applyIconFilter();
      return;
    }

    this.resolvedIconOptions = [
      { value: this.unknownIconFromLegacy, label: `Icone desconhecido: ${this.unknownIconFromLegacy}` },
      ...this.iconOptions
    ];
    this.applyIconFilter();
  }

  private applyIconFilter(): void {
    const term = this.iconSearchControl.value.trim().toLowerCase();
    const selectedIcon = this.normalizeOptional(this.form.controls.icon.value);

    const filtered =
      term.length === 0
        ? this.resolvedIconOptions
        : this.resolvedIconOptions.filter((item) => {
            return item.label.toLowerCase().includes(term) || item.value.toLowerCase().includes(term);
          });

    if (selectedIcon && !filtered.some((item) => item.value === selectedIcon)) {
      const selectedOption = this.resolvedIconOptions.find((item) => item.value === selectedIcon);
      if (selectedOption) {
        this.filteredIconOptions = [selectedOption, ...filtered];
        return;
      }
    }

    this.filteredIconOptions = filtered;
  }
}
