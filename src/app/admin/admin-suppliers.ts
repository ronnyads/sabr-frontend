import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import {
  NbButtonModule,
  NbCardModule,
  NbIconModule,
  NbInputModule,
  NbSpinnerModule
} from '@nebular/theme';
import {
  AdminSuppliersService,
  AdminCreateSupplierRequest,
  SupplierResult
} from '../core/services/admin-suppliers.service';

@Component({
  selector: 'app-admin-suppliers',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NbCardModule,
    NbButtonModule,
    NbInputModule,
    NbIconModule,
    NbSpinnerModule
  ],
  templateUrl: './admin-suppliers.html'
})
export class AdminSuppliers implements OnInit {
  suppliers: SupplierResult[] = [];
  loading = false;
  errorMessage = '';
  formError = '';
  formOpen = false;
  form: FormGroup;

  constructor(private svc: AdminSuppliersService, private fb: FormBuilder) {
    this.form = this.fb.group({
      name: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      companyName: [''],
      document: [''],
      phone: ['']
    });
  }

  ngOnInit(): void {
    this.loadSuppliers();
  }

  loadSuppliers(): void {
    this.loading = true;
    this.errorMessage = '';
    this.svc.list()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (data: any) => {
          this.suppliers = Array.isArray(data) ? data : (data?.items ?? []);
        },
        error: () => {
          this.errorMessage = 'Falha ao carregar fornecedores.';
        }
      });
  }

  openCreate(): void {
    this.formOpen = true;
    this.formError = '';
    this.form.reset({ name: '', email: '', password: '', companyName: '', document: '', phone: '' });
  }

  cancelForm(): void {
    this.formOpen = false;
  }

  saveSupplier(): void {
    if (this.form.invalid || this.loading) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.value;
    const payload: AdminCreateSupplierRequest = {
      name: v.name,
      email: v.email,
      password: v.password,
      companyName: v.companyName || undefined,
      document: v.document || undefined,
      phone: v.phone || undefined
    };
    this.loading = true;
    this.formError = '';
    this.svc.create(payload)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => { this.formOpen = false; this.loadSuppliers(); },
        error: (err: any) => {
          this.formError = err?.error?.errors?.[0]?.message ?? 'Erro ao criar fornecedor.';
        }
      });
  }

  toggleStatus(supplier: SupplierResult): void {
    const activate = !supplier.isActive;
    if (!confirm(`Deseja ${activate ? 'ativar' : 'suspender'} ${supplier.name}?`)) return;
    this.loading = true;
    const action = activate ? this.svc.activate(supplier.id) : this.svc.suspend(supplier.id);
    action.pipe(finalize(() => (this.loading = false))).subscribe({
      next: () => this.loadSuppliers(),
      error: (err: any) => {
        this.errorMessage = err?.error?.errors?.[0]?.message ?? 'Erro ao alterar status.';
      }
    });
  }

  statusLabel(s: SupplierResult): string {
    const map: Record<string, string> = {
      Active: 'Ativo',
      Suspended: 'Suspenso',
      PendingApproval: 'Pendente',
      Rejected: 'Rejeitado'
    };
    return map[s.status] ?? s.status;
  }
}
