import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NbLayoutModule } from '@nebular/theme';
import { AuthService } from '../../core/services/auth.service';
import { PhubMenuItem } from '../../shared/phub-sidebar/phub-sidebar.component';
import { PhubShellLayoutComponent } from '../../shared/phub-shell-layout/phub-shell-layout.component';

@Component({
  selector: 'app-supplier-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, NbLayoutModule, PhubShellLayoutComponent],
  templateUrl: './supplier-shell.html',
  styleUrls: ['./supplier-shell.scss']
})
export class SupplierShell implements OnInit {
  readonly menuItems: PhubMenuItem[] = [
    { label: 'Dashboard', icon: 'home-outline', link: '/dashboard', exact: true },
    { label: 'Produtos', icon: 'cube-outline', link: '/products' },
    { label: 'Carteira', icon: 'credit-card-outline', link: '/wallet' },
    { label: 'Saques', icon: 'arrow-circle-down-outline', link: '/withdrawals' },
    { label: 'Configurações', icon: 'settings-2-outline', link: '/settings' }
  ];

  userName = '';

  constructor(private auth: AuthService) {}

  ngOnInit(): void {
    this.userName = this.auth.currentUser?.name ?? '';
  }

  logout(): void {
    this.auth.logout().subscribe();
  }
}
