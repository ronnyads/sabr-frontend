import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-supplier-products',
  standalone: true,
  imports: [CommonModule],
  template: `<div style="padding: 2rem;"><h2>Meus Produtos</h2></div>`
})
export class SupplierProducts {}
