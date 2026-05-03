import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NbLayoutModule, NbOverlayContainerAdapter } from '@nebular/theme';
import { AuthService } from '../core/services/auth.service';
import { ClientProfileService } from '../core/services/client-profile.service';
import { ClientDocumentsService } from '../core/services/client-documents.service';
import { ClientStatus } from '../core/utils/client-status.constants';
import { DocumentStatus, REQUIRED_PJ_DOCUMENT_TYPES } from '../core/utils/document-status.constants';
import { PhubShellLayoutComponent } from '../shared/phub-shell-layout/phub-shell-layout.component';
import { PhubMenuItem } from '../shared/phub-sidebar/phub-sidebar.component';
import { environment } from '../../environments/environment';

const DOCUMENT_TYPE_LABELS: Record<number, string> = {
  [REQUIRED_PJ_DOCUMENT_TYPES[0]]: 'Certidao CNPJ',
  [REQUIRED_PJ_DOCUMENT_TYPES[1]]: 'Contrato Social',
  [REQUIRED_PJ_DOCUMENT_TYPES[2]]: 'Comprovante de Endereco',
  [REQUIRED_PJ_DOCUMENT_TYPES[3]]: 'Documento do Responsavel'
};

@Component({
  selector: 'app-client-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, NbLayoutModule, PhubShellLayoutComponent],
  templateUrl: './client-shell.html',
  styleUrls: ['./client-shell.scss']
})
export class ClientShell implements OnInit, AfterViewInit {
  readonly shellRedesignV1 = !!environment.ui?.redesignShellV1;
  readonly darkModeEnabled = !!environment.ui?.darkModeV1;

  rejectedDocumentLabels: string[] = [];

  // ── Static menu (same for all users in the shell) ─────────────────────────
  // Access restriction is handled inside each page component / guard.
  // The menu shows all items; restricted ones redirect to dashboard with a notice.
  readonly menuItems: PhubMenuItem[] = this.buildMenuItems();

  constructor(
    private auth: AuthService,
    private profileService: ClientProfileService,
    private documentsService: ClientDocumentsService,
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
        this.loadRejectedDocumentsIfNeeded();
      },
      error: () => {
        this.loadRejectedDocumentsIfNeeded();
      }
    });
  }

  ngAfterViewInit(): void {
    const layout = this.host.nativeElement.querySelector('nb-layout');
    if (layout) {
      this.overlayContainer.setContainer(layout as HTMLElement);
    }
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  private get status(): number {
    return this.auth.currentUser?.status ?? ClientStatus.PendingProfile;
  }

  get isPartialAccess(): boolean {
    return (
      this.status === ClientStatus.UnderReview ||
      this.status === ClientStatus.PendingDocuments ||
      this.status === ClientStatus.Rejected
    );
  }

  get isUnderReview(): boolean {
    return this.status === ClientStatus.UnderReview;
  }

  get isRejected(): boolean {
    return this.status === ClientStatus.Rejected;
  }

  // ── Profile display ────────────────────────────────────────────────────────

  get currentUserName(): string {
    return this.auth.currentUser?.name ?? 'Cliente';
  }

  get statusLabel(): string {
    switch (this.status) {
      case ClientStatus.PendingProfile:        return 'Cadastro incompleto';
      case ClientStatus.PendingAdminApproval:  return 'Aguardando aprovacao';
      case ClientStatus.PendingDocuments:      return 'Pend. documentos';
      case ClientStatus.UnderReview:           return 'Em analise';
      case ClientStatus.Approved:              return 'Aprovado';
      case ClientStatus.Rejected:              return 'Rejeitado';
      case ClientStatus.Inactive:              return 'Inativo';
      default:                                 return 'Status indefinido';
    }
  }

  get accessLabel(): string {
    switch (this.status) {
      case ClientStatus.PendingDocuments:
      case ClientStatus.UnderReview:
      case ClientStatus.Rejected:
        return 'Acesso parcial';
      case ClientStatus.Approved:
        return 'Acesso total';
      case ClientStatus.Inactive:
        return 'Sem acesso';
      default:
        return '';
    }
  }

  get profileSubtitle(): string {
    return this.accessLabel || this.statusLabel;
  }

  // ── Rejected documents ─────────────────────────────────────────────────────

  private loadRejectedDocumentsIfNeeded(): void {
    if (this.status !== ClientStatus.Rejected) {
      this.rejectedDocumentLabels = [];
      return;
    }

    const clientId = this.auth.currentUser?.id;
    if (!clientId) return;

    this.documentsService.list(clientId).subscribe({
      next: (response) => {
        const latest = this.mapLatestByType(response.items ?? []);
        this.rejectedDocumentLabels = REQUIRED_PJ_DOCUMENT_TYPES
          .filter((type) => latest[type]?.status === DocumentStatus.Rejected)
          .map((type) => {
            const doc = latest[type]!;
            const label = DOCUMENT_TYPE_LABELS[type] ?? `Tipo ${type}`;
            const reason = doc.reviewReason?.trim();
            return reason ? `${label} (${reason})` : label;
          });
      },
      error: () => { /* best-effort */ }
    });
  }

  private mapLatestByType(items: any[]): Record<number, any> {
    const result: Record<number, any> = {};
    for (const item of items) {
      const existing = result[item.documentType];
      const ts = Date.parse(item.reviewedAt ?? item.updatedAt ?? item.createdAt ?? '') || 0;
      const existTs = existing
        ? Date.parse(existing.reviewedAt ?? existing.updatedAt ?? existing.createdAt ?? '') || 0
        : -1;
      if (!existing || ts >= existTs) result[item.documentType] = item;
    }
    return result;
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  logout(): void {
    this.auth.logout().subscribe({
      next: () => this.auth.redirectToLogin(),
      error: () => this.auth.redirectToLogin()
    });
  }

  // ── Menu ───────────────────────────────────────────────────────────────────

  private buildMenuItems(): PhubMenuItem[] {
    const menu: PhubMenuItem[] = [
      { label: 'Dashboard', icon: 'home-outline', link: '/client/dashboard', exact: true },
      { label: 'Catalogo', icon: 'book-open-outline', link: '/client/catalog' },
      { label: 'Meus Produtos', icon: 'cube-outline', link: '/client/my-products' },
      { label: 'Integrações', icon: 'link-2-outline', link: '/client/integrations' },
      { label: 'Meus Pedidos', icon: 'shopping-bag-outline', link: '/client/orders' }
    ];
    if (environment.ui?.publicationsEnabled) {
      menu.splice(3, 0, { label: 'Publicacoes', icon: 'layers-outline', link: '/client/publications' });
    }
    return menu;
  }
}
