import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NbButtonModule, NbSpinnerModule } from '@nebular/theme';
import { forkJoin } from 'rxjs';
import { SupplierProductsService } from '../../core/services/supplier-products.service';
import { SupplierWalletService, SupplierWalletSummary } from '../../core/services/supplier-wallet.service';

@Component({
  selector: 'app-supplier-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, NbButtonModule, NbSpinnerModule],
  templateUrl: './supplier-dashboard.html'
})
export class SupplierDashboard implements OnInit {
  loading = true;
  totalProducts = 0;
  pendingProducts = 0;
  approvedProducts = 0;
  wallet: SupplierWalletSummary | null = null;

  constructor(
    private productsSvc: SupplierProductsService,
    private walletSvc: SupplierWalletService
  ) {}

  ngOnInit(): void {
    forkJoin({
      products: this.productsSvc.list(),
      wallet: this.walletSvc.getSummary()
    }).subscribe({
      next: ({ products, wallet }) => {
        this.totalProducts = products.length;
        this.pendingProducts = products.filter(p => p.status === 'PendingReview').length;
        this.approvedProducts = products.filter(p => p.status === 'Approved').length;
        this.wallet = wallet;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }
}
