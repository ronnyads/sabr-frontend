import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NbButtonModule, NbCardModule } from '@nebular/theme';
import { AuthService } from '../core/services/auth.service';
import { ClientDocumentResult, ClientDocumentsService } from '../core/services/client-documents.service';
import { ClientProfileService } from '../core/services/client-profile.service';
import { ClientStatus } from '../core/utils/client-status.constants';
import {
  DocumentStatus,
  REQUIRED_PJ_DOCUMENT_TYPES,
  normalizeDocumentStatus
} from '../core/utils/document-status.constants';

type DocsUiState =
  | 'DOCS_PENDING'
  | 'DOCS_UNDER_REVIEW'
  | 'DOCS_REJECTED'
  | 'DOCS_ALL_APPROVED'
  | 'DOCS_UNKNOWN';

@Component({
  selector: 'app-client-dashboard',
  standalone: true,
  imports: [CommonModule, NbCardModule, NbButtonModule],
  templateUrl: './client-dashboard.html',
  styleUrls: ['./client-dashboard.scss']
})
export class ClientDashboard implements OnInit {
  docsUiState: DocsUiState = 'DOCS_UNKNOWN';
  private docsByType: Partial<Record<number, ClientDocumentResult>> = {};

  constructor(
    private auth: AuthService,
    private router: Router,
    private documentsService: ClientDocumentsService,
    private profileService: ClientProfileService
  ) {}

  ngOnInit(): void {
    this.refreshClientStatus();
    this.loadDocumentsState();
  }

  get userName(): string {
    return this.auth.currentUser?.name ?? 'Cliente';
  }

  get statusLabel(): string {
    const status = this.status;
    if (status !== ClientStatus.Approved) {
      if (this.docsUiState === 'DOCS_ALL_APPROVED') {
        return 'Docs aprovados';
      }

      if (this.docsUiState === 'DOCS_UNDER_REVIEW') {
        return 'Em analise';
      }

      if (this.docsUiState === 'DOCS_REJECTED') {
        return 'Rejeitado';
      }

      if (this.docsUiState === 'DOCS_PENDING') {
        return 'Pend. documentos';
      }
    }

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

  get status(): number {
    return this.auth.currentUser?.status ?? ClientStatus.PendingProfile;
  }

  get mustChangePassword(): boolean {
    return !!this.auth.currentUser?.mustChangePassword;
  }

  get showCompleteProfileCta(): boolean {
    return this.mustChangePassword || this.status === ClientStatus.PendingProfile;
  }

  get showDocumentsCta(): boolean {
    if (this.showCompleteProfileCta || this.status === ClientStatus.Inactive) {
      return false;
    }

    if (this.docsUiState === 'DOCS_ALL_APPROVED') {
      return false;
    }

    if (this.docsUiState === 'DOCS_UNKNOWN') {
      return (
        this.status === ClientStatus.PendingDocuments ||
        this.status === ClientStatus.UnderReview ||
        this.status === ClientStatus.Rejected
      );
    }

    return true;
  }

  get bannerMessage(): string {
    if (this.showCompleteProfileCta) {
      return 'Cadastro pendente. Conclua seu cadastro para liberar recursos do painel.';
    }

    switch (this.docsUiState) {
      case 'DOCS_PENDING':
        return 'Documentos pendentes. Envie os documentos para liberar as integracoes.';
      case 'DOCS_UNDER_REVIEW':
        return 'Documentos em analise. As integracoes serao liberadas apos aprovacao.';
      case 'DOCS_REJECTED':
        return 'Documentos rejeitados. Reenvie documentos ou informacoes corrigidas.';
      case 'DOCS_ALL_APPROVED':
        if (this.status !== ClientStatus.Approved) {
          return 'Documentos aprovados. Aguardando aprovacao final do admin.';
        }

        return '';
      default:
        if (this.status === ClientStatus.PendingDocuments) {
          return 'Documentos pendentes. Envie os documentos para liberar as integracoes.';
        }

        if (this.status === ClientStatus.UnderReview) {
          return 'Documentos em analise. As integracoes serao liberadas apos aprovacao.';
        }

        if (this.status === ClientStatus.Rejected) {
          return 'Documentos rejeitados. Reenvie documentos ou informacoes corrigidas.';
        }

        return '';
    }
  }

  get accessMessage(): string {
    switch (this.status) {
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

  get ctaLabel(): string {
    if (this.showCompleteProfileCta) return 'Completar cadastro';

    switch (this.docsUiState) {
      case 'DOCS_PENDING':
        return 'Enviar documentos';
      case 'DOCS_UNDER_REVIEW':
        return 'Acompanhar documentos';
      case 'DOCS_REJECTED':
        return 'Reenviar documentos/informacoes';
      case 'DOCS_ALL_APPROVED':
        return '';
      default:
        if (this.status === ClientStatus.PendingDocuments) return 'Enviar documentos';
        if (this.status === ClientStatus.UnderReview) return 'Acompanhar documentos';
        if (this.status === ClientStatus.Rejected) return 'Reenviar documentos/informacoes';
        return '';
    }
  }

  goToCta(): void {
    if (this.showCompleteProfileCta) {
      void this.router.navigate(['/client/onboarding']);
      return;
    }

    if (!this.showDocumentsCta) {
      return;
    }

    void this.router
      .navigate(['/client/onboarding'], { queryParams: { step: 3 } })
      .catch(() => this.router.navigate(['/client/onboarding']));
  }

  private refreshClientStatus(): void {
    this.profileService.getProfile().subscribe({
      next: (profile) => {
        const status = Number(profile.status);
        if (Number.isFinite(status)) {
          this.auth.updateCurrentUser({ status });
        }
      },
      error: () => {
        // Keep current session status when profile cannot be refreshed.
      }
    });
  }

  private loadDocumentsState(): void {
    const clientId = this.auth.currentUser?.id;
    if (!clientId) {
      this.applyFallbackDocsStateByClientStatus();
      return;
    }

    this.documentsService.list(clientId, 0, 200).subscribe({
      next: (response) => {
        this.docsByType = this.buildLatestDocsByType(response.items ?? []);
        this.docsUiState = this.computeDocsUiState(this.docsByType);
      },
      error: () => {
        this.applyFallbackDocsStateByClientStatus();
      }
    });
  }

  private applyFallbackDocsStateByClientStatus(): void {
    switch (this.status) {
      case ClientStatus.Rejected:
        this.docsUiState = 'DOCS_REJECTED';
        break;
      case ClientStatus.PendingDocuments:
        this.docsUiState = 'DOCS_PENDING';
        break;
      case ClientStatus.UnderReview:
        this.docsUiState = 'DOCS_UNDER_REVIEW';
        break;
      case ClientStatus.Approved:
        this.docsUiState = 'DOCS_ALL_APPROVED';
        break;
      default:
        this.docsUiState = 'DOCS_UNKNOWN';
        break;
    }
  }

  private buildLatestDocsByType(items: ClientDocumentResult[]): Partial<Record<number, ClientDocumentResult>> {
    const byType: Partial<Record<number, ClientDocumentResult>> = {};

    for (const item of items) {
      const type = Number(item.documentType);
      if (!Number.isFinite(type) || type <= 0) {
        continue;
      }

      const current = byType[type];
      if (!current || this.effectiveDocDate(item) >= this.effectiveDocDate(current)) {
        byType[type] = item;
      }
    }

    return byType;
  }

  private computeDocsUiState(byType: Partial<Record<number, ClientDocumentResult>>): DocsUiState {
    let hasRejected = false;
    let hasMissingOrPending = false;
    let hasUnderReview = false;
    let allApproved = true;

    for (const docType of REQUIRED_PJ_DOCUMENT_TYPES) {
      const doc = byType[docType];
      if (!doc) {
        hasMissingOrPending = true;
        allApproved = false;
        continue;
      }

      const status = normalizeDocumentStatus(doc.status);
      switch (status) {
        case DocumentStatus.Rejected:
          hasRejected = true;
          allApproved = false;
          break;
        case DocumentStatus.Pending:
          hasMissingOrPending = true;
          allApproved = false;
          break;
        case DocumentStatus.UnderReview:
          hasUnderReview = true;
          allApproved = false;
          break;
        case DocumentStatus.Approved:
          break;
        default:
          allApproved = false;
          break;
      }
    }

    if (hasRejected) return 'DOCS_REJECTED';
    if (hasMissingOrPending) return 'DOCS_PENDING';
    if (hasUnderReview) return 'DOCS_UNDER_REVIEW';
    if (allApproved) return 'DOCS_ALL_APPROVED';
    return 'DOCS_UNKNOWN';
  }

  private effectiveDocDate(doc: ClientDocumentResult): number {
    const dynamicDoc = doc as unknown as Record<string, unknown>;
    const timestamps = [
      this.parseDateSafe(dynamicDoc['submittedAt']),
      this.parseDateSafe(dynamicDoc['updatedAt']),
      this.parseDateSafe(dynamicDoc['createdAt']),
      this.parseDateSafe(dynamicDoc['requestedAt']),
      this.parseDateSafe(dynamicDoc['reviewedAt'])
    ];

    return Math.max(...timestamps);
  }

  private parseDateSafe(value: unknown): number {
    if (value == null) {
      return 0;
    }

    const raw = String(value).trim();
    if (!raw) {
      return 0;
    }

    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
}
