import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NbButtonModule, NbSelectModule, NbSpinnerModule } from '@nebular/theme';
import { finalize } from 'rxjs';
import { ClientResult, ClientsService } from '../core/services/clients.service';
import { AdminTenantContextService } from '../core/services/admin-tenant-context.service';

@Component({
  selector: 'app-admin-plans-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, NbButtonModule, NbSelectModule, NbSpinnerModule],
  template: `
    <section class="sabr-page admin-entry-page">
      <div class="sabr-card panel entry-panel">
        <div *ngIf="loading" class="entry-loading">
          <nb-spinner size="small"></nb-spinner>
          <span>Carregando clientes...</span>
        </div>

        <div *ngIf="!loading && clients.length > 0" class="entry-picker">
          <h3>Selecione o cliente para acessar Planos</h3>
          <div class="entry-form">
            <label>
              Cliente
              <select [(ngModel)]="selectedClientId" class="form-control">
                <option value="">Escolha um cliente...</option>
                <option *ngFor="let client of clients" [value]="client.id">
                  {{ client.accountName }}
                </option>
              </select>
            </label>
            <button nbButton status="primary" (click)="confirm()" [disabled]="!selectedClientId">
              Acessar Planos
            </button>
          </div>
        </div>

        <div *ngIf="!loading && clients.length === 0" class="entry-empty">
          <p>Nenhum cliente encontrado.</p>
        </div>

        <div *ngIf="!loading && errorMessage" class="entry-error">
          <p>{{ errorMessage }}</p>
          <button nbButton status="basic" size="small" (click)="retry()">Tentar novamente</button>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .admin-entry-page {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 50vh;
      padding: 2rem;
    }

    .entry-panel {
      width: 100%;
      max-width: 400px;
    }

    .entry-loading,
    .entry-empty,
    .entry-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 2rem;
      text-align: center;
    }

    .entry-loading {
      gap: 1rem;
    }

    .entry-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 2rem 0;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      font-weight: 600;
      text-align: left;
    }

    select {
      padding: 0.5rem;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      font-size: 1rem;
    }

    h3 {
      margin-bottom: 1rem;
    }
  `]
})
export class AdminPlansEntry implements OnInit {
  clients: ClientResult[] = [];
  selectedClientId = '';
  loading = false;
  errorMessage: string | null = null;

  constructor(
    private readonly tenantContext: AdminTenantContextService,
    private readonly router: Router,
    private readonly clientsService: ClientsService
  ) {}

  ngOnInit(): void {
    this.tenantContext.clear();
    this.loadClients();
  }

  private loadClients(): void {
    this.loading = true;
    this.errorMessage = null;

    this.clientsService
      .list(0, 100)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.clients = response.items;

          if (response.items.length === 1) {
            const client = response.items[0];
            this.tenantContext.set(client.tenantSlug ?? client.tenantId, client.accountName, client.id);
            void this.router.navigate(['/plans/detail'], { replaceUrl: true });
          } else if (response.items.length === 0) {
            this.errorMessage = 'Nenhum cliente disponível.';
          }
        },
        error: () => {
          this.errorMessage = 'Erro ao carregar clientes. Tente novamente.';
        }
      });
  }

  confirm(): void {
    const client = this.clients.find((c) => c.id === this.selectedClientId);
    if (!client) return;

    this.tenantContext.set(client.tenantSlug ?? client.tenantId, client.accountName, client.id);
    void this.router.navigate(['/plans/detail'], { replaceUrl: true });
  }

  retry(): void {
    this.loadClients();
  }
}
