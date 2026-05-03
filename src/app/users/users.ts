import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import {
  NbButtonModule,
  NbCardModule,
  NbCheckboxModule,
  NbIconModule,
  NbInputModule,
  NbSelectModule,
  NbSpinnerModule
} from '@nebular/theme';
import {
  UserCreateRequest,
  UserResult,
  UserUpdateRequest,
  UsersService
} from '../core/services/users.service';
import { ClientsService } from '../core/services/clients.service';
import { normalizeRole, roleLabelTenant } from '../core/utils/role-labels';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NbCardModule,
    NbButtonModule,
    NbInputModule,
    NbSelectModule,
    NbCheckboxModule,
    NbIconModule,
    NbSpinnerModule
  ],
  templateUrl: './users.html',
  styleUrls: ['./users.scss'],
})
export class Users implements OnInit {
  private readonly lastTenantKey = 'phub:admin:lastTenantId';
  private readonly lastTenantContextKey = 'phub:admin:lastTenantContext';
  users: UserResult[] = [];
  loading = false;
  errorMessage = '';
  formError = '';
  formOpen = false;
  form: FormGroup;
  editingUserId: string | null = null;
  tenantId = '';
  clientName = '';
  clientCode = '';

  roleOptions = [
    { label: 'Admin (Cliente)', value: 1 },
    { label: 'Financeiro (Cliente)', value: 2 },
    { label: 'Owner (Cliente)', value: 4 }
  ];

  constructor(
    private usersService: UsersService,
    private clientsService: ClientsService,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      role: [1, [Validators.required]],
      password: [''],
      isActive: [true]
    });
  }

  ngOnInit(): void {
    const tenantId = this.route.snapshot.paramMap.get('tenantId') ?? '';
    if (!tenantId) {
      void this.router.navigate(['/clients']);
      return;
    }

    this.tenantId = tenantId;
    localStorage.setItem(this.lastTenantKey, tenantId);
    this.resolveClientContext(tenantId);
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading = true;
    this.errorMessage = '';

    this.usersService
      .list(this.tenantId)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.users = response.items ?? [];
        },
        error: () => {
          this.errorMessage = 'Falha ao carregar usuarios.';
        }
      });
  }


  openCreate(): void {
    this.formOpen = true;
    this.editingUserId = null;
    this.formError = '';
    this.form.reset({
      name: '',
      email: '',
      role: 1,
      password: '',
      isActive: true
    }, { emitEvent: false });
  }

  openEdit(user: UserResult): void {
    this.formOpen = true;
    this.editingUserId = user.id;
    this.formError = '';
    this.form.reset({
      name: user.name,
      email: user.email,
      role: this.parseRole(user.role),
      password: '',
      isActive: user.isActive
    }, { emitEvent: false });
  }

  cancelForm(): void {
    this.formOpen = false;
    this.editingUserId = null;
  }

  saveUser(): void {
    if (this.form.invalid || this.loading) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.value;
    const payloadBase = {
      name: value.name ?? '',
      email: value.email ?? '',
      role: Number(value.role ?? 1),
      isActive: value.isActive ?? true
    };

    this.loading = true;
    this.formError = '';

    if (!this.editingUserId) {
      const password = value.password ?? '';
      if (!password) {
        this.formError = 'Senha obrigatoria para criar usuario.';
        this.loading = false;
        return;
      }

      const payload: UserCreateRequest = {
        ...payloadBase,
        password
      };

      this.usersService
        .create(this.tenantId, payload)
        .pipe(finalize(() => (this.loading = false)))
        .subscribe({
          next: () => {
            this.formOpen = false;
            this.loadUsers();
          },
          error: (err) => {
            this.formError = err?.error?.errors?.[0]?.message ?? 'Erro ao criar usuario.';
          }
        });
      return;
    }

    const payload: UserUpdateRequest = {
      ...payloadBase,
      password: value.password || null
    };

    this.usersService
      .update(this.tenantId, this.editingUserId, payload)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.formOpen = false;
          this.loadUsers();
        },
        error: (err) => {
          this.formError = err?.error?.errors?.[0]?.message ?? 'Erro ao atualizar usuario.';
        }
      });
  }

  deactivate(user: UserResult): void {
    if (!confirm(`Inativar ${user.name}?`)) {
      return;
    }

    this.loading = true;
    this.usersService
      .deactivate(this.tenantId, user.id)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => this.loadUsers(),
        error: () => {
          this.errorMessage = 'Erro ao inativar usuario.';
        }
      });
  }

  roleLabel(role: string | number): string {
    return roleLabelTenant(role);
  }

  private parseRole(role: string | number): number {
    const normalized = normalizeRole(role);
    if ((normalized & 4) === 4) {
      return 4;
    }

    if ((normalized & 1) === 1) {
      return 1;
    }

    if ((normalized & 2) === 2) {
      return 2;
    }

    return 1;
  }

  private resolveClientContext(tenantId: string): void {
    try {
      const raw = localStorage.getItem(this.lastTenantContextKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { tenantId?: string; accountName?: string; protheusCode?: string };
        if (parsed.tenantId === tenantId) {
          this.clientName = parsed.accountName?.trim() ?? '';
          this.clientCode = parsed.protheusCode?.trim() ?? '';
          if (this.clientName || this.clientCode) {
            return;
          }
        }
      }
    } catch {
      // Ignore malformed local storage and fallback to API lookup.
    }

    this.clientsService.list(0, 200).subscribe({
      next: (response) => {
        const match = (response.items ?? []).find((item) => item.tenantId === tenantId);
        this.clientName = match?.accountName ?? '';
        this.clientCode = match?.protheusCode ?? '';
      },
      error: () => {
        this.clientName = '';
        this.clientCode = '';
      }
    });
  }

  get pageTitle(): string {
    if (this.clientName && this.clientCode) {
      return `Equipe do Cliente: ${this.clientName} (ID ${this.clientCode})`;
    }
    if (this.clientName) {
      return `Equipe do Cliente: ${this.clientName}`;
    }
    return `Equipe do Cliente (Tenant ${this.tenantId})`;
  }

  get breadcrumbClientLabel(): string {
    return this.clientName || this.tenantId || 'Cliente';
  }
}
