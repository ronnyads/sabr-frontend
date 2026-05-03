import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-supplier-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding: 2rem;">
      <h2>Dashboard</h2>
      <p>Bem-vindo ao painel do fornecedor.</p>
    </div>
  `
})
export class SupplierDashboard {}
