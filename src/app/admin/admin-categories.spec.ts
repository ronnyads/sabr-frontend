import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { NbThemeModule, NbToastrService } from '@nebular/theme';
import {
  AdminCategoriesService,
  AdminCategoryDetailResult,
  AdminCategoryResult,
  AdminCategoryUpsertRequest
} from '../core/services/admin-categories.service';
import { AdminCategories } from './admin-categories';

describe('AdminCategories', () => {
  let component: AdminCategories;
  let service: jasmine.SpyObj<AdminCategoriesService>;

  const baseResult: AdminCategoryResult = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Categoria',
    slug: 'categoria',
    parentId: null,
    parentSlug: null,
    icon: null,
    description: null,
    isActive: true,
    createdAt: '2026-02-16T10:00:00Z',
    updatedAt: '2026-02-16T10:00:00Z'
  };

  const mapToDetail = (request: AdminCategoryUpsertRequest): AdminCategoryDetailResult => ({
    ...baseResult,
    name: request.name,
    slug: request.slug,
    parentId: request.parentId ?? null,
    icon: request.icon ?? null,
    description: request.description ?? null,
    isActive: request.isActive,
    path: request.name
  });

  beforeEach(async () => {
    service = jasmine.createSpyObj<AdminCategoriesService>('AdminCategoriesService', [
      'list',
      'tree',
      'getById',
      'create',
      'update',
      'deactivate'
    ]);

    service.list.and.returnValue(of({ items: [], total: 0, skip: 0, limit: 20 }));
    service.tree.and.returnValue(of([]));
    service.getById.and.returnValue(of({ ...baseResult, path: baseResult.name }));
    service.create.and.callFake((request: AdminCategoryUpsertRequest) => of(mapToDetail(request)));
    service.update.and.callFake((_id: string, request: AdminCategoryUpsertRequest) => of(mapToDetail(request)));
    service.deactivate.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      imports: [AdminCategories, NbThemeModule.forRoot({ name: 'default' }), NoopAnimationsModule],
      providers: [
        { provide: AdminCategoriesService, useValue: service },
        {
          provide: NbToastrService,
          useValue: jasmine.createSpyObj<NbToastrService>('NbToastrService', ['success', 'danger'])
        }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(AdminCategories);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('slug auto from name with spaces and accents', () => {
    component.openCreate();
    component.form.controls.name.setValue('Eletro Dom\u00E9sticos');
    component.onNameInput();

    expect(component.form.controls.slug.value).toBe('eletro-domesticos');
  });

  it('slug auto from name with underscore and accents', () => {
    component.openCreate();
    component.form.controls.name.setValue('Eletro_Dom\u00E9sticos');
    component.onNameInput();

    expect(component.form.controls.slug.value).toBe('eletro-domesticos');
  });

  it('manual slug is normalized on submit', () => {
    component.openCreate();
    component.form.patchValue({
      name: 'Audio',
      slug: 'Eletro_Dom\u00E9sticos',
      parentId: '',
      icon: '',
      description: '',
      isActive: true
    });
    component.onSlugInput();

    component.saveCategory();

    expect(service.create).toHaveBeenCalled();
    const request = service.create.calls.mostRecent().args[0] as AdminCategoryUpsertRequest;
    expect(request.slug).toBe('eletro-domesticos');
  });

  it('sends icon as null when selecting sem icone', () => {
    component.openCreate();
    component.form.patchValue({
      name: 'Hardware',
      slug: 'hardware',
      parentId: '',
      icon: '',
      description: '',
      isActive: true
    });

    component.saveCategory();

    const request = service.create.calls.mostRecent().args[0] as AdminCategoryUpsertRequest;
    expect(request.icon).toBeNull();
  });

  it('legacy icon outside whitelist keeps form stable with fallback preview', () => {
    component.openEdit({
      ...baseResult,
      icon: 'legacy-custom-icon'
    });

    expect(component.isUnknownIconSelected).toBeTrue();
    expect(component.selectedIconPreview).toBe('question-mark-circle-outline');
    expect(component.resolvedIconOptions[0].value).toBe('legacy-custom-icon');
  });

  it('icon never derives from name', () => {
    component.openCreate();
    component.form.controls.icon.setValue('cube-outline');
    component.form.controls.name.setValue('Categoria Nova');
    component.onNameInput();

    expect(component.form.controls.icon.value).toBe('cube-outline');
  });
});
