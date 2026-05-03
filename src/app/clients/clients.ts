import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, combineLatest, debounceTime, distinctUntilChanged, finalize, startWith, takeUntil } from 'rxjs';
import {
  NbButtonModule,
  NbInputModule,
  NbSpinnerModule,
  NbToastrService
} from '@nebular/theme';
import { ClientsService, ClientResult, ClientSeedRequest } from '../core/services/clients.service';
import { ClientDocumentResult, ClientDocumentsService } from '../core/services/client-documents.service';
import { AdminTenantContextService } from '../core/services/admin-tenant-context.service';
import { PageHeaderComponent } from '../shared/page-header/page-header.component';
import { SearchToolbarComponent, SearchToolbarFilter } from '../shared/search-toolbar/search-toolbar.component';
import { RowActionMenuAction, RowActionsMenuComponent } from '../shared/row-actions-menu/row-actions-menu.component';

@Component({
  selector: 'app-clients',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NbInputModule,
    NbButtonModule,
    NbSpinnerModule,
    PageHeaderComponent,
    SearchToolbarComponent,
    RowActionsMenuComponent
  ],
  templateUrl: './clients.html',
  styleUrls: ['./clients.scss']
})
export class Clients implements OnInit, OnDestroy {
  private readonly lastTenantKey = 'phub:admin:lastTenantId';
  private readonly lastTenantContextKey = 'phub:admin:lastTenantContext';
  private readonly clientStatusPendingAdminApproval = 1;
  private readonly clientStatusPendingDocuments = 2;
  private readonly clientStatusUnderReview = 3;
  private readonly clientStatusRejected = 5;
  private readonly clientStatusInactive = 6;
  private readonly documentStatusUnderReview = 4;
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly statusFilterControl = new FormControl<'all' | 'approved' | 'pending' | 'inactive'>('all', { nonNullable: true });
  readonly toolbarFilters: SearchToolbarFilter[] = [
    {
      id: 'status',
      label: 'Status',
      value: 'all',
      options: [
        { label: 'Todos', value: 'all' },
        { label: 'Aprovados', value: 'approved' },
        { label: 'Pendentes', value: 'pending' },
        { label: 'Inativos', value: 'inactive' }
      ]
    }
  ];
  clients: ClientResult[] = [];
  filteredClients: ClientResult[] = [];
  clientActionsById: Record<string, RowActionMenuAction[]> = {};
  loading = false;
  errorMessage = '';
  successMessage = '';
  formError = '';
  formOpen = false;
  documentsOpen = false;
  documentsLoading = false;
  documentsError = '';
  selectedClient: ClientResult | null = null;
  selectedClientDocuments: ClientDocumentResult[] = [];
  form: FormGroup;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private clientsService: ClientsService,
    private documentsService: ClientDocumentsService,
    private fb: FormBuilder,
    private router: Router,
    private adminTenantContext: AdminTenantContextService,
    private toastr: NbToastrService
  ) {
    this.form = this.fb.group({
      accountName: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      temporaryPassword: ['', [Validators.required, Validators.minLength(8)]]
    });
  }

  ngOnInit(): void {
    this.adminTenantContext.clear();
    combineLatest([
      this.searchControl.valueChanges.pipe(startWith(this.searchControl.value), debounceTime(250), distinctUntilChanged()),
      this.statusFilterControl.valueChanges.pipe(startWith(this.statusFilterControl.value), distinctUntilChanged())
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateToolbarFilters();
        this.applyFilters();
      });

    this.loadClients();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onToolbarSearchChange(value: string): void {
    const nextValue = value ?? '';
    if (nextValue === this.searchControl.value) {
      return;
    }

    this.searchControl.setValue(nextValue);
  }

  onToolbarFilterChange(change: { id: string; value: string }): void {
    if (change.id !== 'status') {
      return;
    }

    const nextValue = this.normalizeStatusFilter(change.value);
    const currentValue = this.statusFilterControl.value;
    if (this.normalizeFilterValue(nextValue) === this.normalizeFilterValue(currentValue)) {
      return;
    }

    this.statusFilterControl.setValue(nextValue, { emitEvent: false });
    this.updateToolbarFilters();
    this.applyFilters();
  }

  clearToolbar(): void {
    let changed = false;

    if (this.searchControl.value !== '') {
      this.searchControl.setValue('', { emitEvent: false });
      changed = true;
    }

    if (this.statusFilterControl.value !== 'all') {
      this.statusFilterControl.setValue('all', { emitEvent: false });
      changed = true;
    }

    this.updateToolbarFilters();
    if (changed) {
      this.applyFilters();
    }
  }

  trackClient(_: number, client: ClientResult): string {
    return client.id;
  }

  trackDocument(_: number, document: ClientDocumentResult): string {
    return document.id;
  }

  onClientAction(client: ClientResult, actionId: string): void {
    switch (actionId) {
      case 'users':
        this.manageUsers(client);
        return;
      case 'catalogs':
        this.openCatalogs(client);
        return;
      case 'plans':
        this.openPlans(client);
        return;
      case 'integrations':
        this.openIntegrations(client);
        return;
      case 'documents':
        this.openDocuments(client);
        return;
      case 'reset-password':
        this.resetPassword(client);
        return;
      case 'approve':
        this.approve(client);
        return;
      case 'reject':
        this.reject(client);
        return;
      case 'deactivate':
        this.deactivate(client);
        return;
      default:
        return;
    }
  }

  loadClients(): void {
    this.loading = true;
    this.errorMessage = '';

    this.clientsService
      .list()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.clients = response.items ?? [];
          this.applyFilters();
        },
        error: (err) => {
          this.errorMessage = this.resolveErrorMessage(err, 'Falha ao carregar clientes.');
        }
      });
  }

  openCreate(): void {
    this.formOpen = true;
    this.formError = '';
    this.form.reset({
      accountName: '',
      email: '',
      temporaryPassword: ''
    });
  }

  cancelForm(): void {
    this.formOpen = false;
  }

  saveClient(): void {
    if (this.form.invalid || this.loading) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.value;
    const payload: ClientSeedRequest = {
      accountName: value.accountName ?? '',
      email: value.email ?? '',
      temporaryPassword: value.temporaryPassword ?? ''
    };

    this.loading = true;
    this.formError = '';

    this.clientsService
      .create(payload)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.formOpen = false;
          this.loadClients();
        },
        error: (err) => {
          this.formError = err?.error?.errors?.[0]?.message ?? 'Erro ao criar cliente.';
        }
      });
  }

  approve(client: ClientResult): void {
    if (!this.canApproveClient(client) || this.loading) {
      return;
    }

    if (!confirm(`Aprovar ${client.accountName}?`)) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.loading = true;
    this.clientsService
      .approve(client.tenantId, client.id)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => {
          const newStatus = Number(result?.status);
          if (Number.isFinite(newStatus)) {
            client.status = newStatus;
          }

          this.successMessage = `${client.accountName} aprovado com sucesso.`;
          this.loadClients();
        },
        error: (err) => {
          this.errorMessage = this.resolveErrorMessage(err, 'Erro ao aprovar cliente.');
        }
      });
  }

  reject(client: ClientResult): void {
    if (!this.canRejectClient(client) || this.loading) {
      return;
    }

    const reason = prompt(`Motivo da rejeicao para ${client.accountName}:`);
    if (!reason) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.loading = true;
    this.clientsService
      .reject(client.tenantId, client.id, reason)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => this.loadClients(),
        error: (err) => {
          this.errorMessage = this.resolveErrorMessage(err, 'Erro ao rejeitar cliente.');
        }
      });
  }

  deactivate(client: ClientResult): void {
    if (!this.canDeactivateClient(client) || this.loading) {
      return;
    }

    if (!confirm(`Inativar ${client.accountName}?`)) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.loading = true;
    this.clientsService
      .deactivate(client.tenantId, client.id)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => this.loadClients(),
        error: (err) => {
          this.errorMessage = this.resolveErrorMessage(err, 'Erro ao inativar cliente.');
        }
      });
  }

  resetPassword(client: ClientResult): void {
    if (!this.canResetPassword(client) || this.loading) {
      return;
    }

    if (!confirm(`Resetar senha de ${client.accountName}?`)) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.loading = true;
    this.clientsService
      .resetPassword(client.tenantId, client.id)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.successMessage = `Senha de ${client.accountName} resetada com sucesso.`;
          alert(`Senha temporaria: ${response.temporaryPassword}`);
        },
        error: (err) => {
          this.errorMessage = this.resolveErrorMessage(err, 'Erro ao resetar senha.');
        }
      });
  }

  manageUsers(client: ClientResult): void {
    if (!this.canManageUsers(client)) {
      return;
    }

    const tenantSlug = (client.tenantSlug ?? '').trim().toLowerCase();
    if (!tenantSlug) {
      this.toastr.warning('Cliente sem tenant slug ativo para abrir usuarios.', 'Tenant ausente');
      return;
    }

    this.adminTenantContext.set(tenantSlug, client.accountName, client.id);
    void this.router.navigate([`/t/${tenantSlug}/users`]);
  }

  openCatalogs(client: ClientResult): void {
    this.adminTenantContext.set(client.tenantSlug ?? client.tenantId, client.accountName, client.id);
    void this.router.navigate(['/admin/catalogs']);
  }

  openPlans(client: ClientResult): void {
    const tenantSlug = (client.tenantSlug ?? '').trim().toLowerCase();
    if (!tenantSlug) {
      this.toastr.warning('Cliente sem tenant slug ativo para abrir planos.', 'Tenant ausente');
      return;
    }

    this.adminTenantContext.set(tenantSlug, client.accountName, client.id);
    void this.router.navigate([`/admin/clients/${client.id}/subscriptions`]);
  }

  openIntegrations(client: ClientResult): void {
    const tenantSlug = (client.tenantSlug ?? '').trim().toLowerCase();
    if (!tenantSlug) {
      this.toastr.warning('Cliente sem tenant slug ativo para abrir integracoes.', 'Tenant ausente');
      return;
    }

    this.adminTenantContext.set(tenantSlug, client.accountName, client.id);
    void this.router.navigate([`/admin/clients/${client.id}/integrations/mercadolivre`]);
  }

  openDocuments(client: ClientResult): void {
    if (!this.canOpenDocuments(client)) {
      return;
    }

    this.selectedClient = client;
    this.documentsOpen = true;
    this.documentsError = '';
    this.successMessage = '';
    this.selectedClientDocuments = [];
    this.loadClientDocuments();
  }

  closeDocuments(): void {
    this.documentsOpen = false;
    this.selectedClient = null;
    this.selectedClientDocuments = [];
    this.documentsError = '';
    this.successMessage = '';
  }

  loadClientDocuments(): void {
    if (!this.selectedClient) {
      return;
    }

    this.documentsLoading = true;
    this.documentsError = '';

    this.documentsService
      .list(this.selectedClient.id)
      .pipe(finalize(() => (this.documentsLoading = false)))
      .subscribe({
        next: (response) => {
          this.selectedClientDocuments = response.items ?? [];
        },
        error: (err) => {
          if (err?.status === 401 || err?.status === 403) {
            this.documentsError = 'Sem permissao para carregar documentos. Recarregue o admin e tente novamente.';
            return;
          }

          this.documentsError = this.resolveErrorMessage(err, 'Falha ao carregar documentos.');
        }
      });
  }

  viewDocument(doc: ClientDocumentResult): void {
    if (!this.selectedClient) {
      return;
    }

    this.documentsError = '';
    const popup = window.open('', '_blank');
    this.documentsService.download(this.selectedClient.id, doc.id).subscribe({
      next: (blob) => {
        const objectUrl = URL.createObjectURL(blob);

        if (popup) {
          popup.location.href = objectUrl;
          popup.focus();
        } else {
          const anchor = window.document.createElement('a');
          anchor.href = objectUrl;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          anchor.click();
        }

        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      },
      error: (err) => {
        if (popup && !popup.closed) {
          popup.close();
        }

        this.documentsError = this.resolveErrorMessage(err, 'Falha ao obter URL do documento.');
      }
    });
  }

  approveDocument(document: ClientDocumentResult): void {
    if (!this.selectedClient || this.documentsLoading || !this.canReviewDocument(document)) {
      return;
    }

    this.documentsError = '';
    this.successMessage = '';
    this.documentsLoading = true;
    this.documentsService
      .approve(this.selectedClient.id, document.id)
      .pipe(finalize(() => (this.documentsLoading = false)))
      .subscribe({
        next: () => {
          this.successMessage = 'Documento aprovado com sucesso.';
          this.loadClientDocuments();
        },
        error: (err) => {
          this.documentsError = this.resolveErrorMessage(err, 'Erro ao aprovar documento.');
        }
      });
  }

  rejectDocument(document: ClientDocumentResult): void {
    if (!this.selectedClient || this.documentsLoading || !this.canReviewDocument(document)) {
      return;
    }

    const reason = prompt(`Motivo da rejeicao para ${this.documentTypeLabel(document.documentType)}:`);
    if (!reason || !reason.trim()) {
      return;
    }

    this.documentsError = '';
    this.successMessage = '';
    this.documentsLoading = true;
    this.documentsService
      .reject(this.selectedClient.id, document.id, reason.trim())
      .pipe(finalize(() => (this.documentsLoading = false)))
      .subscribe({
        next: () => {
          this.successMessage = 'Documento rejeitado com sucesso.';
          this.loadClientDocuments();
        },
        error: (err) => {
          this.documentsError = this.resolveErrorMessage(err, 'Erro ao rejeitar documento.');
        }
      });
  }

  canManageUsers(client: ClientResult): boolean {
    return !!client.tenantId;
  }

  canOpenDocuments(client: ClientResult): boolean {
    return client.status !== this.clientStatusInactive;
  }

  canResetPassword(client: ClientResult): boolean {
    return client.status !== this.clientStatusInactive;
  }

  canApproveClient(client: ClientResult): boolean {
    return (
      client.status === this.clientStatusPendingAdminApproval ||
      client.status === this.clientStatusPendingDocuments ||
      client.status === this.clientStatusUnderReview ||
      client.status === this.clientStatusRejected
    );
  }

  canRejectClient(client: ClientResult): boolean {
    return client.status !== this.clientStatusInactive;
  }

  canDeactivateClient(client: ClientResult): boolean {
    return client.status !== this.clientStatusInactive;
  }

  canReviewDocument(document: ClientDocumentResult): boolean {
    return document.status === this.documentStatusUnderReview;
  }

  get showFinalApprovalHint(): boolean {
    return (
      (this.selectedClient?.status ?? -1) !== 4 &&
      this.selectedClientDocuments.length > 0 &&
      this.selectedClientDocuments.every((doc) => doc.status === 2)
    );
  }

  documentActionStateLabel(document: ClientDocumentResult): string {
    switch (document.status) {
      case 2:
        return 'Aprovado';
      case 3:
        return 'Rejeitado';
      case 1:
        return 'Aguardando revisao';
      default:
        return 'Indisponivel';
    }
  }

  documentActionStateClass(document: ClientDocumentResult): string {
    switch (document.status) {
      case 2:
        return 'state-approved';
      case 3:
        return 'state-rejected';
      case 1:
        return 'state-pending';
      default:
        return 'state-disabled';
    }
  }

  documentTypeLabel(type: number): string {
    switch (type) {
      case 1:
        return 'Certidao CNPJ';
      case 2:
        return 'Contrato Social';
      case 3:
        return 'Comprovante de Endereco';
      case 4:
        return 'Documento do Responsavel';
      default:
        return `Tipo ${type}`;
    }
  }

  documentStatusLabel(status: number): string {
    switch (status) {
      case 1:
        return 'Enviado';
      case 2:
        return 'Aprovado';
      case 3:
        return 'Rejeitado';
      case 4:
        return 'Em analise';
      default:
        return 'Desconhecido';
    }
  }

  statusLabel(status: number): string {
    switch (status) {
      case 0:
        return 'Cadastro incompleto';
      case 1:
        return 'Aguardando aprovacao';
      case 2:
        return 'Pend. documentos';
      case 3:
        return 'Em analise';
      case 4:
        return 'Aprovado';
      case 5:
        return 'Rejeitado';
      case 6:
        return 'Inativo';
      default:
        return 'Desconhecido';
    }
  }

  private resolveErrorMessage(err: any, fallback: string): string {
    return err?.error?.errors?.[0]?.message ?? err?.error?.error ?? fallback;
  }

  private applyFilters(): void {
    const query = this.searchControl.value.trim().toLowerCase();
    const statusFilter = this.statusFilterControl.value;

    this.filteredClients = this.clients.filter((client) => {
      if (statusFilter === 'approved' && client.status !== 4) {
        return false;
      }

      if (statusFilter === 'pending' && ![1, 2, 3].includes(client.status)) {
        return false;
      }

      if (statusFilter === 'inactive' && client.status !== this.clientStatusInactive) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [client.accountName, client.email, client.protheusCode, client.tenantSlug ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query);
    });

    this.rebuildClientActions();
  }

  private updateToolbarFilters(): void {
    this.toolbarFilters[0].value = this.statusFilterControl.value;
  }

  private normalizeFilterValue(value: unknown): string {
    return String(value ?? '')
      .trim()
      .toLowerCase();
  }

  private normalizeStatusFilter(value: unknown): 'all' | 'approved' | 'pending' | 'inactive' {
    const normalized = this.normalizeFilterValue(value);
    switch (normalized) {
      case 'approved':
      case 'pending':
      case 'inactive':
      case 'all':
        return normalized;
      default:
        return 'all';
    }
  }

  private rebuildClientActions(): void {
    const nextActions: Record<string, RowActionMenuAction[]> = {};
    for (const client of this.filteredClients) {
      nextActions[client.id] = this.buildClientActions(client);
    }

    this.clientActionsById = nextActions;
  }

  private buildClientActions(client: ClientResult): RowActionMenuAction[] {
    return [
      { id: 'users', label: 'Equipe', icon: 'people-outline', disabled: !this.canManageUsers(client) },
      { id: 'catalogs', label: 'Catalogos', icon: 'grid-outline' },
      { id: 'plans', label: 'Planos', icon: 'layers-outline' },
      { id: 'integrations', label: 'Integracoes', icon: 'link-2-outline' },
      { id: 'documents', label: 'Documentos', icon: 'file-text-outline', disabled: !this.canOpenDocuments(client) },
      { id: 'reset-password', label: 'Resetar senha', icon: 'lock-outline', disabled: !this.canResetPassword(client) },
      { id: 'approve', label: 'Aprovar', icon: 'checkmark-outline', disabled: !this.canApproveClient(client) },
      { id: 'reject', label: 'Rejeitar', icon: 'slash-outline', disabled: !this.canRejectClient(client) },
      { id: 'deactivate', label: 'Inativar', icon: 'close-circle-outline', danger: true, disabled: !this.canDeactivateClient(client) }
    ];
  }
}
