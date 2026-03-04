import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
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
  PlatformUserCreateRequest,
  PlatformUserResult,
  PlatformUsersService,
  PlatformUserUpdateRequest
} from '../core/services/platform-users.service';
import { normalizeRole, roleLabelSystem } from '../core/utils/role-labels';

@Component({
  selector: 'app-platform-users',
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
  templateUrl: './platform-users.html',
  styleUrls: ['./platform-users.scss']
})
export class PlatformUsers implements OnInit {
  users: PlatformUserResult[] = [];
  loading = false;
  errorMessage = '';
  formError = '';
  formOpen = false;
  form: FormGroup;
  editingUserId: string | null = null;

  roleOptions = [
    { label: 'Admin (Sistema)', value: 1 },
    { label: 'Finance (Sistema)', value: 2 },
    { label: 'SuperAdmin (Sistema)', value: 4 }
  ];

  constructor(private usersService: PlatformUsersService, private fb: FormBuilder) {
    this.form = this.fb.group({
      name: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      role: [1, [Validators.required]],
      password: [''],
      isActive: [true]
    });
  }

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading = true;
    this.errorMessage = '';

    this.usersService
      .list()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.users = response.items ?? [];
        },
        error: () => {
          this.errorMessage = 'Falha ao carregar usuarios de plataforma.';
        }
      });
  }

  openCreate(): void {
    this.formOpen = true;
    this.editingUserId = null;
    this.formError = '';
    this.form.reset(
      {
        name: '',
        email: '',
        role: 1,
        password: '',
        isActive: true
      },
      { emitEvent: false }
    );
  }

  openEdit(user: PlatformUserResult): void {
    this.formOpen = true;
    this.editingUserId = user.id;
    this.formError = '';
    this.form.reset(
      {
        name: user.name,
        email: user.email,
        role: this.parseRole(user.role),
        password: '',
        isActive: user.isActive
      },
      { emitEvent: false }
    );
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
      role: Number(value.role ?? 1) as 1 | 2 | 4,
      isActive: value.isActive ?? true
    };

    this.loading = true;
    this.formError = '';

    if (!this.editingUserId) {
      const password = (value.password ?? '').toString();
      if (!password) {
        this.formError = 'Senha obrigatoria para criar usuario.';
        this.loading = false;
        return;
      }

      const payload: PlatformUserCreateRequest = {
        ...payloadBase,
        password
      };

      this.usersService
        .create(payload)
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

    const payload: PlatformUserUpdateRequest = payloadBase;

    this.usersService
      .update(this.editingUserId, payload)
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

  toggleStatus(user: PlatformUserResult): void {
    const nextStatus = !user.isActive;
    const action = nextStatus ? 'ativar' : 'inativar';
    if (!confirm(`Deseja ${action} ${user.name}?`)) {
      return;
    }

    this.loading = true;
    this.usersService
      .setStatus(user.id, nextStatus)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => this.loadUsers(),
        error: (err) => {
          this.errorMessage = err?.error?.errors?.[0]?.message ?? 'Erro ao alterar status.';
        }
      });
  }

  resetPassword(user: PlatformUserResult): void {
    const temporaryPassword = prompt(`Nova senha temporaria para ${user.name}:`, 'Temp#12345');
    if (!temporaryPassword) {
      return;
    }

    this.loading = true;
    this.usersService
      .resetPassword(user.id, temporaryPassword)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          alert('Senha redefinida com sucesso.');
        },
        error: (err) => {
          this.errorMessage = err?.error?.errors?.[0]?.message ?? 'Erro ao redefinir senha.';
        }
      });
  }

  roleLabel(role: string | number): string {
    return roleLabelSystem(role);
  }

  private parseRole(role: string | number): 1 | 2 | 4 {
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
}
