import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { NbButtonModule } from '@nebular/theme';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-supplier-settings',
  standalone: true,
  imports: [CommonModule, NbButtonModule],
  template: `
    <section class="phub-page supplier-settings-page">
      <div class="phub-page-header">
        <div>
          <h2>Configurações</h2>
          <p class="phub-subtitle">Informações da sua conta de fornecedor.</p>
        </div>
      </div>
      <div class="phub-card panel">
        <p><strong>Nome:</strong> {{ user?.name }}</p>
        <p><strong>E-mail:</strong> {{ user?.email }}</p>
        <p><strong>Tipo:</strong> Fornecedor</p>
        <div style="margin-top: 1.5rem;">
          <button nbButton status="danger" size="small" (click)="logout()">Sair</button>
        </div>
      </div>
    </section>
  `
})
export class SupplierSettings {
  get user() { return this.auth.currentUser; }
  constructor(private auth: AuthService) {}
  logout(): void { this.auth.logout().subscribe(); }
}
