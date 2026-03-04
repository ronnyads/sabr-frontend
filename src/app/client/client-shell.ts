import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NbLayoutModule, NbOverlayContainerAdapter } from '@nebular/theme';
import { AuthService } from '../core/services/auth.service';
import { ClientProfileService } from '../core/services/client-profile.service';
import { ClientStatus } from '../core/utils/client-status.constants';
import { SabrShellLayoutComponent } from '../shared/sabr-shell-layout/sabr-shell-layout.component';
import { SabrMenuItem } from '../shared/sabr-sidebar/sabr-sidebar.component';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-client-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, NbLayoutModule, SabrShellLayoutComponent],
  templateUrl: './client-shell.html',
  styleUrls: ['./client-shell.scss']
})
export class ClientShell implements OnInit, AfterViewInit {
  readonly menuItems: SabrMenuItem[] = this.buildMenuItems();

  constructor(
    private auth: AuthService,
    private profileService: ClientProfileService,
    private readonly host: ElementRef<HTMLElement>,
    private readonly overlayContainer: NbOverlayContainerAdapter
  ) {}

  ngOnInit(): void {
    this.profileService.getProfile().subscribe({
      next: (profile) => {
        const status = Number(profile.status);
        if (Number.isFinite(status)) {
          this.auth.updateCurrentUser({ status });
        }
      },
      error: () => {
        // Ignore refresh failures and keep current local status.
      }
    });
  }

  ngAfterViewInit(): void {
    const layout = this.host.nativeElement.querySelector('nb-layout');
    if (layout) {
      this.overlayContainer.setContainer(layout as HTMLElement);
    }
  }

  get currentUserName(): string {
    return this.auth.currentUser?.name ?? 'Cliente';
  }

  get statusLabel(): string {
    const status = this.auth.currentUser?.status;
    switch (status) {
      case ClientStatus.PendingProfile:
        return 'Cadastro incompleto';
      case ClientStatus.PendingAdminApproval:
        return 'Aguardando aprovacao';
      case ClientStatus.PendingDocuments:
        return 'Pend. documentos';
      case ClientStatus.UnderReview:
        return 'Em analise';
      case ClientStatus.Approved:
        return 'Aprovado';
      case ClientStatus.Rejected:
        return 'Rejeitado';
      case ClientStatus.Inactive:
        return 'Inativo';
      default:
        return 'Status indefinido';
    }
  }

  get accessLabel(): string {
    const status = this.auth.currentUser?.status;
    switch (status) {
      case ClientStatus.PendingDocuments:
      case ClientStatus.UnderReview:
      case ClientStatus.Rejected:
        return 'Acesso parcial';
      case ClientStatus.Approved:
        return 'Acesso total';
      case ClientStatus.Inactive:
        return 'Sem acesso (bloqueado no proximo login/refresh)';
      default:
        return '';
    }
  }

  get profileSubtitle(): string {
    return this.accessLabel || this.statusLabel;
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => this.auth.redirectToLogin(),
      error: () => this.auth.redirectToLogin()
    });
  }

  private buildMenuItems(): SabrMenuItem[] {
    const menu: SabrMenuItem[] = [
      { label: 'Dashboard', icon: 'home-outline', link: '/client/dashboard', exact: true },
      { label: 'Catalogo', icon: 'book-open-outline', link: '/client/catalog' },
      { label: 'Meus Produtos', icon: 'cube-outline', link: '/client/my-products' },
      { label: 'Integracoes', icon: 'link-2-outline', link: '/client/integrations/mercadolivre' }
    ];
    if (environment.ui?.publicationsEnabled) {
      menu.splice(3, 0, { label: 'Publicacoes', icon: 'layers-outline', link: '/client/publications' });
    }

    return menu;
  }
}
