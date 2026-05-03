import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NbButtonModule, NbInputModule, NbSpinnerModule, NbToastrService } from '@nebular/theme';
import { SupplierProductResult, SupplierProductUpsertRequest, SupplierProductsService } from '../../core/services/supplier-products.service';

const STATUS_LABELS: Record<string, string> = {
  Draft: 'Rascunho',
  PendingReview: 'Aguardando Revisão',
  Approved: 'Aprovado',
  Rejected: 'Rejeitado',
  AdjustmentRequested: 'Ajuste Solicitado',
  Inactive: 'Inativo'
};

@Component({
  selector: 'app-supplier-products',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NbButtonModule, NbInputModule, NbSpinnerModule],
  templateUrl: './supplier-products.html'
})
export class SupplierProducts implements OnInit {
  products: SupplierProductResult[] = [];
  loading = false;
  error = '';
  formOpen = false;
  saving = false;
  editingId: string | null = null;
  form!: FormGroup;

  constructor(
    private svc: SupplierProductsService,
    private fb: FormBuilder,
    private toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.load();
  }

  private buildForm(): void {
    this.form = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      brand: [''],
      ncm: [''],
      ean: [''],
      costPriceCents: [0, [Validators.required, Validators.min(1)]],
      widthCm: [null],
      heightCm: [null],
      lengthCm: [null],
      weightKg: [null]
    });
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.svc.list().subscribe({
      next: (items) => { this.products = items; this.loading = false; },
      error: () => { this.error = 'Erro ao carregar produtos.'; this.loading = false; }
    });
  }

  openCreate(): void {
    this.editingId = null;
    this.form.reset({ costPriceCents: 0 });
    this.formOpen = true;
  }

  openEdit(p: SupplierProductResult): void {
    if (p.status !== 'Draft' && p.status !== 'AdjustmentRequested') return;
    this.editingId = p.id;
    this.form.patchValue(p);
    this.formOpen = true;
  }

  cancelForm(): void {
    this.formOpen = false;
    this.editingId = null;
  }

  save(): void {
    if (this.form.invalid) return;
    this.saving = true;
    const req: SupplierProductUpsertRequest = this.form.value;
    const obs = this.editingId
      ? this.svc.update(this.editingId, req)
      : this.svc.create(req);

    obs.subscribe({
      next: () => { this.saving = false; this.formOpen = false; this.load(); },
      error: () => { this.saving = false; this.toastr.danger('Erro ao salvar produto.', 'Erro'); }
    });
  }

  submit(p: SupplierProductResult): void {
    this.svc.submit(p.id).subscribe({
      next: () => { this.toastr.success('Produto enviado para revisão.', 'Sucesso'); this.load(); },
      error: () => this.toastr.danger('Erro ao submeter produto.', 'Erro')
    });
  }

  remove(p: SupplierProductResult): void {
    if (!confirm(`Remover "${p.name}"?`)) return;
    this.svc.delete(p.id).subscribe({
      next: () => { this.toastr.success('Produto removido.', 'Sucesso'); this.load(); },
      error: () => this.toastr.danger('Erro ao remover produto.', 'Erro')
    });
  }

  statusLabel(s: string): string { return STATUS_LABELS[s] ?? s; }

  trackProduct(_: number, p: SupplierProductResult): string { return p.id; }
}
