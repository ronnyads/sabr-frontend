import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators
} from '@angular/forms';
import { catchError, finalize, Subject, debounceTime, distinctUntilChanged, forkJoin, of, switchMap, takeUntil, tap } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import {
  NbButtonModule,
  NbCardModule,
  NbCheckboxModule,
  NbIconModule,
  NbInputModule,
  NbLayoutModule,
  NbSelectModule,
  NbSpinnerModule
} from '@nebular/theme';
import { AuthService } from '../core/services/auth.service';
import {
  ClientProfileService,
  ClientProfileView,
  ClientProfileUpdateRequest
} from '../core/services/client-profile.service';
import { CepService } from '../core/services/cep.service';
import { ClientDocumentResult, ClientDocumentsService } from '../core/services/client-documents.service';
import { formatCep, normalizeCep } from '../core/services/cep.service';
import { DocumentLookupService } from '../core/services/document-lookup.service';
import { formatIE, isValidIE } from '../core/validators/ie.validator';
import { ClientOnboardingProgressService } from '../core/services/client-onboarding-progress.service';
import { ClientStatus } from '../core/utils/client-status.constants';
import { DocumentStatus, REQUIRED_PJ_DOCUMENT_TYPES } from '../core/utils/document-status.constants';
import { environment } from '../../environments/environment';
import { ThemeService } from '../core/services/theme.service';

@Component({
  selector: 'app-client-onboarding',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NbLayoutModule,
    NbCardModule,
    NbInputModule,
    NbSelectModule,
    NbCheckboxModule,
    NbButtonModule,
    NbIconModule,
    NbSpinnerModule
  ],
  templateUrl: './client-onboarding.html',
  styleUrls: ['./client-onboarding.scss']
})
export class ClientOnboarding implements OnInit, OnDestroy {
  readonly redesignV1 = !!environment.ui?.redesignOnboardingV1;
  readonly darkModeEnabled = !!environment.ui?.darkModeV1;
  profileForm: FormGroup;
  passwordForm: FormGroup;

  steps = ['seguranca', 'empresa', 'contato', 'responsavel'];
  currentStep = 0;

  loadingProfile = false;
  loadingPassword = false;
  loadingCep = false;
  submittingDocuments = false;

  profileMessage = '';
  passwordMessage = '';
  documentMessage = '';
  profileError = '';
  submitErrorSummary = '';
  submitAttempted = false;
  passwordError = '';
  cepError = '';
  documentIsError = false;

  showCurrentPassword = false;
  showNewPassword = false;

  readonly requiredDocuments: Array<{ type: number; label: string }> = [
    { type: REQUIRED_PJ_DOCUMENT_TYPES[0], label: 'Certidao CNPJ' },
    { type: REQUIRED_PJ_DOCUMENT_TYPES[1], label: 'Contrato Social' },
    { type: REQUIRED_PJ_DOCUMENT_TYPES[2], label: 'Comprovante de Endereco' },
    { type: REQUIRED_PJ_DOCUMENT_TYPES[3], label: 'Documento do Responsavel' }
  ];

  documentByType: Partial<Record<number, ClientDocumentResult>> = {};
  selectedFilesByType: Partial<Record<number, File>> = {};
  selectedFileNamesByType: Partial<Record<number, string>> = {};
  uploadingByType: Partial<Record<number, boolean>> = {};

  private readonly destroy$ = new Subject<void>();
  private lastLookupDoc = '';
  private readonly ufList = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
    'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
    'SP', 'SE', 'TO'
  ];

  personTypeOptions = [
    { label: 'Pessoa Juridica (CNPJ)', value: 2 },
    { label: 'Pessoa Fisica (CPF)', value: 1 }
  ];

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private profileService: ClientProfileService,
    private cepService: CepService,
    private documentsService: ClientDocumentsService,
    private docLookupService: DocumentLookupService,
    private onboardingProgress: ClientOnboardingProgressService,
    private readonly themeService: ThemeService
  ) {
    this.profileForm = this.fb.group({
      personType: [2, [Validators.required]],
      legalName: ['', [Validators.required]],
      tradeName: [''],
      document: ['', [Validators.required]],
      stateRegistration: [''],
      isStateRegistrationExempt: [false],
      email: [{ value: '', disabled: true }, [Validators.required, Validators.email]],
      whatsapp: ['', [Validators.required, this.whatsappValidator()]],
      birthDate: [''],
      zipCode: ['', [Validators.required, this.cepValidator()]],
      street: ['', [Validators.required]],
      number: ['', [Validators.required]],
      district: ['', [Validators.required]],
      city: ['', [Validators.required]],
      state: ['', [Validators.required, this.ufValidator()]],
      complement: [''],
      responsibleName: ['', [Validators.required]],
      responsibleDocument: ['', [Validators.required, this.responsibleDocumentValidator()]]
    });

    this.passwordForm = this.fb.group({
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(8)]]
    });

    this.profileForm.get('document')?.setValidators([Validators.required, this.documentValidator()]);
    this.profileForm.get('document')?.updateValueAndValidity({ emitEvent: false });
    this.profileForm.get('stateRegistration')?.setValidators([this.stateRegistrationValidator()]);
    this.profileForm.get('stateRegistration')?.updateValueAndValidity({ emitEvent: false });
    this.profileForm.get('responsibleDocument')?.setValidators([Validators.required, this.responsibleDocumentValidator()]);
    this.profileForm.get('responsibleDocument')?.updateValueAndValidity({ emitEvent: false });
  }

  ngOnInit(): void {
    this.themeService.initialize(this.darkModeEnabled);

    // Busca o status atualizado do backend antes de decidir se o onboarding é necessário.
    // Evita que clientes aprovados fiquem presos por causa de status em cache stale.
    this.profileService.getProfile().pipe(takeUntil(this.destroy$)).subscribe({
      next: (profile) => {
        this.auth.updateCurrentUser({ status: profile.status });
        this.initOnboarding();
      },
      error: () => {
        // Fallback: usa o status em cache se a API falhar
        this.initOnboarding();
      }
    });
  }

  private initOnboarding(): void {
    // Se o perfil já foi submetido e está em análise/aprovado,
    // redirecionar para o dashboard (acesso parcial ou full).
    // O onboarding só faz sentido para PendingProfile ou troca de senha obrigatória.
    const status = this.auth.currentUser?.status ?? ClientStatus.PendingProfile;
    const needsOnboarding =
      this.mustChangePassword ||
      status === ClientStatus.PendingProfile ||
      status === ClientStatus.PendingDocuments;

    if (!needsOnboarding) {
      void this.router.navigate(['/client/dashboard']);
      return;
    }

    this.currentStep = this.computeInitialStep();

    this.patchInitialValues();
    this.setupProfileDraftAutoSave();
    this.setupCepLookup();
    this.setupDocumentFormatting();
    this.setupWhatsappFormatting();
    this.setupResponsibleDocumentFormatting();
    this.handlePersonTypeChanges();
    this.handleStateChanges();
    this.handleStateRegistrationToggle();
    this.toggleStateRegistration();

    if (this.currentStep === this.documentsStepIndex && this.canUploadDocuments) {
      this.loadDocuments();
    }
  }

  get themeIcon(): string {
    return this.themeService.isDark ? 'sun-outline' : 'moon-outline';
  }

  get themeLabel(): string {
    return this.themeService.isDark ? 'Tema claro' : 'Tema escuro';
  }

  get statusTone(): 'success' | 'warning' | 'danger' | 'info' {
    const status = this.auth.currentUser?.status ?? ClientStatus.PendingProfile;

    if (status === ClientStatus.Rejected || status === ClientStatus.Inactive) {
      return 'danger';
    }

    if (status === ClientStatus.Approved) {
      return 'success';
    }

    if (status === ClientStatus.UnderReview || status === ClientStatus.PendingAdminApproval) {
      return 'info';
    }

    return 'warning';
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get currentUser() {
    return this.auth.currentUser;
  }

  get mustChangePassword(): boolean {
    return !!this.auth.currentUser?.mustChangePassword;
  }

  /** True once the user has successfully saved the new password in this session */
  passwordSaved = false;

  get documentsStepIndex(): number {
    return this.steps.length - 1;
  }

  get canUploadDocuments(): boolean {
    const status = this.auth.currentUser?.status ?? ClientStatus.PendingProfile;
    return status >= ClientStatus.PendingDocuments && status !== ClientStatus.Inactive;
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

  get isCpf(): boolean {
    return Number(this.profileForm.get('personType')?.value ?? 2) === 1;
  }

  get isCnpj(): boolean {
    return !this.isCpf;
  }

  get progressPercent(): number {
    return ((this.currentStep + 1) / this.steps.length) * 100;
  }

  get isLastStep(): boolean {
    return this.currentStep === this.steps.length - 1;
  }

  private clampStep(step: number): number {
    if (!Number.isFinite(step)) return 0;
    return Math.max(0, Math.min(this.steps.length - 1, Math.trunc(step)));
  }

  private getStepStorageKey(): string | null {
    const u = this.auth.currentUser;
    if (!u?.id || !u?.tenantId) return null;
    return `sabr:onboardingStep:${u.tenantId}:${u.id}`;
  }

  private getProfileDraftStorageKey(): string | null {
    const u = this.auth.currentUser;
    if (!u?.id || !u?.tenantId) return null;
    return `sabr:onboardingDraft:${u.tenantId}:${u.id}`;
  }

  private loadStoredStep(): number | null {
    const key = this.getStepStorageKey();
    if (!key) return null;

    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      return this.clampStep(n);
    } catch {
      return null;
    }
  }

  private persistStep(step: number): void {
    const clamped = this.clampStep(step);
    const key = this.getStepStorageKey();

    if (key) {
      try {
        localStorage.setItem(key, String(clamped));
      } catch {
        // ignore storage errors
      }
    }

    // Best-effort backend persistence (resume across devices)
    this.onboardingProgress.setStep(clamped).subscribe({
      next: () => this.auth.updateCurrentUser({ onboardingStep: clamped }),
      error: () => {}
    });
  }

  private setupProfileDraftAutoSave(): void {
    this.profileForm.valueChanges
      .pipe(debounceTime(250), takeUntil(this.destroy$))
      .subscribe(() => this.persistProfileDraft());
  }

  private persistProfileDraft(): void {
    const key = this.getProfileDraftStorageKey();
    if (!key) {
      return;
    }

    try {
      const raw = this.profileForm.getRawValue();
      localStorage.setItem(key, JSON.stringify(raw));
    } catch {
      // ignore storage errors
    }
  }

  private loadProfileDraft(): Record<string, unknown> | null {
    const key = this.getProfileDraftStorageKey();
    if (!key) {
      return null;
    }

    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private computeInitialStep(): number {
    const user = this.auth.currentUser;
    const status = user?.status ?? ClientStatus.PendingProfile;

    // Query param overrides (deep-link to a specific step)
    const fromQueryRaw = this.route.snapshot.queryParamMap.get('step');
    const fromQuery = this.resolveQueryStep(fromQueryRaw);

    const fromLocal = this.loadStoredStep();
    const fromBackend = user?.onboardingStep ?? null;

    let step =
      (fromQuery != null && Number.isFinite(fromQuery) ? this.clampStep(fromQuery) : null) ??
      (fromLocal != null ? this.clampStep(fromLocal) : null) ??
      (fromBackend != null && Number.isFinite(fromBackend) ? this.clampStep(fromBackend) : null) ??
      (this.mustChangePassword ? 0 : 1);

    // Enforce domain rules:
    // - During docs workflow, always land on docs step.
    const isInDocumentsWorkflow =
      status === ClientStatus.PendingDocuments ||
      status === ClientStatus.UnderReview ||
      status === ClientStatus.Rejected;
    if (isInDocumentsWorkflow) {
      step = Math.max(step, this.documentsStepIndex);
    }

    // - If must change password, always start at step 0
    if (this.mustChangePassword) {
      step = 0;
    }

    // If query param was provided, persist it immediately (so returning without query still resumes)
    if (fromQuery != null && Number.isFinite(fromQuery)) {
      this.persistStep(step);
    }

    return this.clampStep(step);
  }

  private resolveQueryStep(raw: string | null): number | null {
    if (raw == null) {
      return null;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    // Backward-compatible deep-link convention: step=3 means documents step.
    if (parsed === 3) {
      return this.documentsStepIndex;
    }

    return this.clampStep(parsed);
  }

  logout(): void {
    this.auth
      .logout()
      .pipe(finalize(() => this.router.navigate(['/login'])))
      .subscribe({
        error: () => this.router.navigate(['/login'])
      });
  }

  nextStep(): void {
    // ao navegar, limpe mensagens de submit genéricas
    this.submitErrorSummary = '';
    this.submitAttempted = false;
    if (this.currentStep === 0) {
      if (this.mustChangePassword) {
        // Senha ainda nao foi salva: tentar salvar agora e so avancar no callback de sucesso
        if (!this.passwordSaved) {
          if (this.passwordForm.invalid) {
            this.passwordForm.markAllAsTouched();
            this.passwordError = 'Defina e salve sua nova senha antes de continuar.';
            return;
          }
          // Disparar save e avancar automaticamente ao concluir
          this.savePassword(() => {
            this.currentStep = 1;
            this.persistStep(this.currentStep);
          });
          return;
        }
      }
      this.currentStep = 1;
      this.persistStep(this.currentStep);
      return;
    }

    if (this.currentStep === 1) {
      if (!this.validateStepEmpresa()) return;
      this.currentStep = 2;
      this.persistStep(this.currentStep);
      return;
    }

    if (this.currentStep === 2) {
      if (!this.validateStepContato()) return;
      this.currentStep = this.documentsStepIndex;
      this.persistStep(this.currentStep);
      if (this.canUploadDocuments) {
        this.loadDocuments();
      }
      return;
    }

    if (this.isLastStep) {
      const status = this.auth.currentUser?.status ?? ClientStatus.PendingProfile;
      if (this.shouldSaveProfileBeforeDocuments(status)) {
        this.saveProfile(true);
      } else {
        this.sendDocumentsForReview();
      }
    }
  }

  private shouldSaveProfileBeforeDocuments(status: number): boolean {
    return (
      status === ClientStatus.PendingProfile ||
      status === ClientStatus.PendingAdminApproval ||
      status === ClientStatus.PendingDocuments
    );
  }

  prevStep(): void {
    this.submitErrorSummary = '';
    this.submitAttempted = false;
    if (this.currentStep > 0) {
      this.currentStep -= 1;
      this.persistStep(this.currentStep);
    }
  }

  goToStep(idx: number): void {
    this.submitErrorSummary = '';
    this.submitAttempted = false;
    // só permite voltar ou avançar se etapas anteriores válidas
    if (idx < this.currentStep) {
      this.currentStep = idx;
      this.persistStep(this.currentStep);
      return;
    }
    // avançar exige validação incremental
    while (this.currentStep < idx) {
      const before = this.currentStep;
      this.nextStep();
      if (this.currentStep === before) {
        break; // bloqueado por validação
      }
    }
  }

  savePassword(onSuccess?: () => void): void {
    if (this.passwordForm.invalid || this.loadingPassword) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const newPassword = this.passwordForm.value.newPassword ?? '';
    this.loadingPassword = true;
    this.passwordMessage = '';
    this.passwordError = '';

    this.auth
      .changePassword(newPassword)
      .pipe(finalize(() => (this.loadingPassword = false)))
      .subscribe({
        next: () => {
          this.auth.updateCurrentUser({ mustChangePassword: false });
          this.passwordSaved = true;
          this.passwordMessage = 'Senha atualizada com sucesso. Avancando...';
          this.passwordForm.reset();
          if (onSuccess) {
            onSuccess();
          }
        },
        error: (err) => {
          this.passwordError = err?.error?.errors?.[0]?.message ?? 'Erro ao atualizar senha.';
        }
      });
  }

  private validateStepEmpresa(): boolean {
    const controls = ['personType', 'document', 'legalName', 'state', 'stateRegistration'];
    controls.forEach((c) => this.profileForm.get(c)?.markAsTouched());

    // documento
    const rawDoc = this.onlyDigits(this.profileForm.value.document ?? '');
    if (this.isCpf && !this.isValidCpf(rawDoc)) {
      this.profileForm.get('document')?.setErrors({ cpf: true });
      return false;
    }
    if (this.isCnpj && !this.isValidCnpj(rawDoc)) {
      this.profileForm.get('document')?.setErrors({ cnpj: true });
      return false;
    }

    // IE obrigatória se PJ e não isento
    if (this.isCnpj) {
      const ctrlIE = this.profileForm.get('stateRegistration');
      const isExempt = !!this.profileForm.get('isStateRegistrationExempt')?.value;
      const rawState = (ctrlIE?.value || '').toString().trim().toUpperCase();
      if (!isExempt && rawState !== 'ISENTO' && (!rawState || !isValidIE(rawState, (this.profileForm.get('state')?.value || '').toString().toUpperCase()))) {
        ctrlIE?.setErrors({ ieInvalid: true });
        ctrlIE?.markAsTouched();
        return false;
      }
    }

    return true;
  }

  private validateStepContato(): boolean {
    const controls = ['email', 'whatsapp', 'zipCode', 'street', 'number', 'district', 'city', 'state'];
    controls.forEach((c) => this.profileForm.get(c)?.markAsTouched());

    if (this.profileForm.get('zipCode')?.invalid) return false;
    if (this.profileForm.get('whatsapp')?.invalid) return false;
    if (this.profileForm.get('email')?.invalid) return false;
    return !['street', 'number', 'district', 'city', 'state'].some((c) => this.profileForm.get(c)?.invalid);
  }

  saveProfile(submitDocumentsAfterSave = false): void {
    if (this.profileForm.invalid || this.loadingProfile) {
      this.profileForm.markAllAsTouched();
      return;
    }

    // valida documento antes de montar payload
    const rawDoc = this.onlyDigits(this.profileForm.value.document ?? '');
    const personType = Number(this.profileForm.get('personType')?.value ?? 2);
    const docControl = this.profileForm.get('document');
    if (personType === 1 && !this.isValidCpf(rawDoc)) {
      docControl?.setErrors({ cpf: true });
      docControl?.markAsTouched();
      return;
    }
    if (personType !== 1 && !this.isValidCnpj(rawDoc)) {
      docControl?.setErrors({ cnpj: true });
      docControl?.markAsTouched();
      return;
    }

    const raw = this.profileForm.getRawValue();
    const rawStateRegistration = (raw.stateRegistration ?? '').toString();
    const isStateRegistrationIsento = rawStateRegistration.trim().toUpperCase() === 'ISENTO';
    const isStateRegistrationExempt = !!raw.isStateRegistrationExempt || isStateRegistrationIsento;
    const responsibleDigits = this.onlyDigits(raw.responsibleDocument ?? '');
    const respCtrl = this.profileForm.get('responsibleDocument');
    if (!this.isValidCpf(responsibleDigits)) {
      respCtrl?.setErrors({ cpf: true });
      respCtrl?.markAsTouched();
      return;
    }

    const payload: ClientProfileUpdateRequest = {
      personType: Number(raw.personType ?? 2),
      legalName: raw.legalName ?? '',
      tradeName: raw.tradeName || null,
      document: rawDoc,
      stateRegistration: isStateRegistrationExempt ? 'ISENTO' : this.onlyDigits(rawStateRegistration),
      isStateRegistrationExempt,
      email: raw.email ?? '',
      whatsapp: this.onlyDigits(raw.whatsapp ?? ''),
      birthDate: raw.birthDate || null,
      zipCode: this.onlyDigits(raw.zipCode ?? ''),
      street: raw.street ?? '',
      number: raw.number ?? '',
      district: raw.district ?? '',
      city: raw.city ?? '',
      state: (raw.state ?? '').toUpperCase(),
      complement: raw.complement || null,
      responsibleName: raw.responsibleName ?? '',
      responsibleDocument: responsibleDigits
    };

    this.loadingProfile = true;
    this.profileMessage = '';
    this.profileError = '';
    this.cepError = '';
    this.submitErrorSummary = '';
    this.submitAttempted = false;

    this.profileService
      .updateProfile(payload)
      .pipe(finalize(() => (this.loadingProfile = false)))
      .subscribe({
        next: (result) => {
          this.auth.updateCurrentUser({ status: result.status });
          this.persistProfileDraft();
          this.profileMessage = 'Cadastro atualizado. Prossiga com o envio de documentos.';
          this.submitAttempted = false;
          if (this.canUploadDocuments) {
            this.loadDocuments();
          }
          if (submitDocumentsAfterSave) {
            this.sendDocumentsForReview();
          }
        },
        error: (err) => {
          // Preferir erros por campo vindos da API (errors[{field,message}]) para mostrar inline e navegar para a etapa correta.
          if (!this.applyProfileServerErrors(err)) {
            this.profileError =
              err?.error?.errors?.[0]?.message ?? err?.error?.error ?? 'Erro ao salvar cadastro.';
          }
        }
      });
  }

  private applyProfileServerErrors(err: any): boolean {
    const apiErrors = err?.error?.errors;
    if (!Array.isArray(apiErrors) || apiErrors.length === 0) {
      return false;
    }

    this.profileError = '';
    this.submitErrorSummary = 'Não foi possível salvar. Revise os campos destacados.';
    this.submitAttempted = true;

    const normalizeFieldName = (raw: string): string => {
      const v = (raw || '').trim();
      if (!v) return '';

      // snake_case -> camelCase
      if (v.includes('_')) {
        const parts = v
          .toLowerCase()
          .split('_')
          .filter(Boolean);
        return parts
          .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
          .join('');
      }

      // PascalCase -> camelCase (mantém camelCase intacto)
      return v.charAt(0).toLowerCase() + v.slice(1);
    };

    const mergeErrors = (ctrlName: string, errors: Record<string, any>) => {
      const ctrl = this.profileForm.get(ctrlName);
      if (!ctrl) return;
      ctrl.setErrors({ ...(ctrl.errors || {}), ...errors });
      ctrl.markAsTouched();
    };

    const stepForField = (field: string): number => {
      switch (field) {
        case 'document':
        case 'legalName':
        case 'tradeName':
        case 'personType':
        case 'stateRegistration':
          return 1; // Empresa
        case 'whatsapp':
        case 'zipCode':
        case 'street':
        case 'number':
        case 'district':
        case 'city':
        case 'state':
        case 'email':
          return 2; // Contato + Endereço
        case 'responsibleName':
        case 'responsibleDocument':
          return 3; // Responsável
        default:
          return 3;
      }
    };

    let targetStep = 3;

    for (const e of apiErrors) {
      const rawField = (e?.field ?? e?.Field ?? '').toString();
      const field = normalizeFieldName(rawField);
      const message = (e?.message ?? e?.Message ?? '').toString();
      if (!field) continue;

      targetStep = Math.min(targetStep, stepForField(field));

      // Mapear campos para controles do form.
      if (field === 'document') {
        if (/cpf/i.test(message)) mergeErrors('document', { cpf: true });
        else if (/cnpj/i.test(message)) mergeErrors('document', { cnpj: true });
        else mergeErrors('document', { server: true });
        continue;
      }

      if (field === 'stateRegistration') {
        // Evitar exibir a mensagem crua ("Invalid IE...") no passo 4. Mostra inline em PT-BR.
        if (/required/i.test(message)) mergeErrors('stateRegistration', { required: true });
        else mergeErrors('stateRegistration', { ieInvalid: true });
        continue;
      }

      if (field === 'zipCode') {
        // Mensagem do backend já é amigável (ex.: "CEP inexistente")
        this.cepError = message || 'CEP inválido.';
        mergeErrors('zipCode', { server: true });
        continue;
      }

      if (field === 'responsibleDocument') {
        mergeErrors('responsibleDocument', { cpf: true });
        continue;
      }

      if (this.profileForm.get(field)) {
        mergeErrors(field, { server: true });
      }
    }

    // Navegar automaticamente para a etapa onde está o problema.
    this.currentStep = Math.max(0, Math.min(this.steps.length - 1, targetStep));

    return true;
  }

  loadDocuments(): void {
    const clientId = this.auth.currentUser?.id;
    if (!clientId) {
      return;
    }

    this.documentsService.list(clientId).subscribe({
      next: (response) => {
        this.documentByType = this.mapLatestDocumentsByType(response.items ?? []);
      },
      error: (err) => {
        this.documentByType = {};
        this.documentIsError = true;
        this.documentMessage = this.getDocumentErrorMessage(err, 'Erro ao carregar documentos.');
      }
    });
  }

  onSelectDocumentFile(type: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      delete this.selectedFilesByType[type];
      delete this.selectedFileNamesByType[type];
      return;
    }

    this.selectedFilesByType[type] = input.files[0];
    this.selectedFileNamesByType[type] = input.files[0].name;
    this.documentMessage = '';
    this.documentIsError = false;
  }

  uploadDocumentByType(type: number): void {
    const file = this.selectedFilesByType[type];
    if (!file) {
      this.documentIsError = true;
      this.documentMessage = `Selecione um arquivo para ${this.documentTypeLabel(type)} antes de enviar.`;
      return;
    }

    const clientId = this.auth.currentUser?.id;
    if (!clientId) {
      this.documentIsError = true;
      this.documentMessage = 'Sessao expirada. Faca login novamente.';
      return;
    }

    this.uploadingByType[type] = true;
    this.documentMessage = '';
    this.documentIsError = false;

    this.documentsService
      .upload(clientId, type, file)
      .pipe(finalize(() => (this.uploadingByType[type] = false)))
      .subscribe({
        next: () => {
          this.documentIsError = false;
          this.documentMessage = `${this.documentTypeLabel(type)} enviado com sucesso.`;
          delete this.selectedFilesByType[type];
          delete this.selectedFileNamesByType[type];
          this.loadDocuments();
        },
        error: (err) => {
          this.documentIsError = true;
          this.documentMessage = this.getDocumentErrorMessage(err, 'Erro ao enviar documento.');
        }
      });
  }

  sendDocumentsForReview(): void {
    const clientId = this.auth.currentUser?.id;
    if (!clientId) {
      this.documentIsError = true;
      this.documentMessage = 'Sessao expirada. Faca login novamente.';
      return;
    }

    this.submittingDocuments = true;
    this.documentMessage = '';
    this.documentIsError = false;

    this.documentsService
      .list(clientId)
      .pipe(finalize(() => (this.submittingDocuments = false)))
      .subscribe({
        next: (response) => {
          this.documentByType = this.mapLatestDocumentsByType(response.items ?? []);

          const selectedNotUploadedLabels = this.requiredDocuments
            .filter((entry) => !this.documentByType[entry.type] && !!this.selectedFilesByType[entry.type])
            .map((entry) => entry.label);

          const trulyMissingLabels = this.requiredDocuments
            .filter((entry) => !this.documentByType[entry.type] && !this.selectedFilesByType[entry.type])
            .map((entry) => entry.label);

          if (selectedNotUploadedLabels.length > 0 || trulyMissingLabels.length > 0) {
            const messageParts: string[] = [];
            if (selectedNotUploadedLabels.length > 0) {
              messageParts.push(
                `Voce selecionou arquivo para: ${selectedNotUploadedLabels.join(', ')}. Clique em Enviar em cada documento antes de enviar para aprovacao.`
              );
            }
            if (trulyMissingLabels.length > 0) {
              messageParts.push(`Faltam: ${trulyMissingLabels.join(', ')}.`);
            }
            this.documentIsError = true;
            this.documentMessage = messageParts.join(' ');
            return;
          }

          const rejectedLabels = this.requiredDocuments
            .filter((entry) => this.documentByType[entry.type]?.status === DocumentStatus.Rejected)
            .map((entry) => entry.label);

          if (rejectedLabels.length > 0) {
            this.documentIsError = true;
            this.documentMessage = `Reenvie os documentos rejeitados: ${rejectedLabels.join(', ')}.`;
            return;
          }

          const pendingDocs = this.requiredDocuments
            .map((entry) => this.documentByType[entry.type]!)
            .filter((doc) => doc.status === DocumentStatus.Pending);

          if (pendingDocs.length === 0) {
            const requiredDocs = this.requiredDocuments
              .map((entry) => this.documentByType[entry.type])
              .filter((doc): doc is ClientDocumentResult => !!doc);
            const hasUnderReview = requiredDocs.some((doc) => doc.status === DocumentStatus.UnderReview);
            const allApproved =
              requiredDocs.length === this.requiredDocuments.length &&
              requiredDocs.every((doc) => doc.status === DocumentStatus.Approved);

            this.documentIsError = false;
            if (hasUnderReview) {
              this.documentMessage = 'Documentos ja enviados e em analise.';
            } else if (allApproved && (this.auth.currentUser?.status ?? ClientStatus.PendingProfile) !== ClientStatus.Approved) {
              this.documentMessage = 'Documentos aprovados. Aguardando validacao final.';
            } else {
              this.documentMessage = 'Documentos ja enviados.';
            }
            return;
          }

          this.submittingDocuments = true;
          forkJoin(pendingDocs.map((doc) => this.documentsService.requestReview(clientId, doc.id)))
            .pipe(finalize(() => (this.submittingDocuments = false)))
            .subscribe({
              next: () => {
                this.documentIsError = false;
                this.documentMessage = 'Documentos enviados para análise. Redirecionando...';
                this.loadDocuments();
                this.auth.updateCurrentUser({ status: ClientStatus.UnderReview });
                // Redirecionar para o dashboard com acesso parcial após confirmar
                setTimeout(() => {
                  void this.router.navigate(['/client/dashboard']);
                }, 1500);
              },
              error: (err) => {
                this.documentIsError = true;
                this.documentMessage = this.getDocumentErrorMessage(
                  err,
                  'Erro ao enviar documentos para analise.',
                  true
                );
              }
            });
        },
        error: (err) => {
          this.documentIsError = true;
          this.documentMessage = this.getDocumentErrorMessage(
            err,
            'Erro ao carregar documentos.',
            true
          );
        }
      });
  }

  documentTypeLabel(type: number): string {
    return this.requiredDocuments.find((entry) => entry.type === type)?.label ?? `Tipo ${type}`;
  }

  documentStatusLabel(type: number): string {
    const document = this.documentByType[type];
    const status = document?.status;
    switch (status) {
      case DocumentStatus.Pending:
        return 'Enviado';
      case DocumentStatus.Approved:
        return 'Aprovado';
      case DocumentStatus.Rejected:
        return 'Rejeitado';
      case DocumentStatus.UnderReview:
        return 'Em analise';
      default:
        if (!document && this.selectedFilesByType[type]) {
          return 'Selecionado (nao enviado)';
        }
        return 'Nao enviado';
    }
  }

  documentStatusTone(type: number): string {
    const document = this.documentByType[type];
    const status = document?.status;
    switch (status) {
      case DocumentStatus.Approved:    return 'success';
      case DocumentStatus.Rejected:    return 'danger';
      case DocumentStatus.UnderReview: return 'info';
      case DocumentStatus.Pending:     return 'warning';
      default:                         return 'info';
    }
  }


  isUploading(type: number): boolean {
    return this.uploadingByType[type] === true;
  }

  private mapLatestDocumentsByType(items: ClientDocumentResult[]): Partial<Record<number, ClientDocumentResult>> {
    const mapped: Partial<Record<number, ClientDocumentResult>> = {};
    for (const item of items) {
      const current = mapped[item.documentType];
      if (!current || this.effectiveDocDate(item) >= this.effectiveDocDate(current)) {
        mapped[item.documentType] = item;
      }
    }

    return mapped;
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

  private getDocumentErrorMessage(err: any, fallback: string, includeUploadHint = false): string {
    if (err?.status === 500) {
      const base = 'Nao foi possivel processar agora. Tente novamente em alguns segundos.';
      if (includeUploadHint) {
        return `${base} Se voce selecionou arquivos, clique em Enviar em cada documento antes de enviar para aprovacao.`;
      }

      return base;
    }

    return err?.error?.errors?.[0]?.message ?? err?.error?.error ?? fallback;
  }

  private patchInitialValues(): void {
    const user = this.auth.currentUser;

    const draft = this.loadProfileDraft();
    if (draft) {
      this.profileForm.patchValue(draft, { emitEvent: false });
    }

    if (user?.email) {
      this.profileForm.patchValue({ email: user.email });
    }

    if (user?.name && !this.profileForm.get('responsibleName')?.value) {
      this.profileForm.patchValue({ responsibleName: user.name }, { emitEvent: false });
    }

    this.loadProfileFromServer();
  }

  private loadProfileFromServer(): void {
    this.profileService
      .getProfile()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (profile) => {
          this.patchProfileFromServer(profile);

          const status = profile.status;
          if (status != null && Number.isFinite(Number(status))) {
            this.auth.updateCurrentUser({ status });
          }
        },
        error: () => {
          // keep local draft/auth fallback when profile endpoint is unavailable
        }
      });
  }

  private patchProfileFromServer(profile: ClientProfileView): void {
    const personTypeRaw = Number(profile.personType);
    const personType = personTypeRaw === 1 || personTypeRaw === 2
      ? personTypeRaw
      : Number(this.profileForm.get('personType')?.value ?? 2);

    const stateRaw = (profile.state ?? '').toString().trim().toUpperCase();
    const stateRegistrationRaw = (profile.stateRegistration ?? '').toString();
    const isStateRegistrationExempt =
      profile.isStateRegistrationExempt === true ||
      stateRegistrationRaw.trim().toUpperCase() === 'ISENTO';

    const documentDigits = this.onlyDigits(profile.document ?? '');
    const responsibleDocumentDigits = this.onlyDigits(profile.responsibleDocument ?? '');
    const whatsappDigits = this.onlyDigits(profile.whatsapp ?? '');
    const zipDigits = this.onlyDigits(profile.zipCode ?? '');

    const patch: Record<string, unknown> = {
      personType,
      legalName: profile.legalName ?? '',
      tradeName: profile.tradeName ?? '',
      document: documentDigits
        ? (personType === 1 ? this.formatCpf(documentDigits) : this.formatCnpj(documentDigits))
        : '',
      stateRegistration: isStateRegistrationExempt
        ? 'ISENTO'
        : formatIE(stateRegistrationRaw, stateRaw),
      isStateRegistrationExempt,
      email: profile.email ?? this.profileForm.get('email')?.value ?? '',
      whatsapp: whatsappDigits ? this.formatWhatsapp(whatsappDigits) : '',
      birthDate: this.normalizeBirthDateForInput(profile.birthDate),
      zipCode: zipDigits ? formatCep(zipDigits) : '',
      street: profile.street ?? '',
      number: profile.number ?? '',
      district: profile.district ?? '',
      city: profile.city ?? '',
      state: stateRaw,
      complement: profile.complement ?? '',
      responsibleName: profile.responsibleName ?? this.profileForm.get('responsibleName')?.value ?? '',
      responsibleDocument: responsibleDocumentDigits ? this.formatCpf(responsibleDocumentDigits) : ''
    };

    this.profileForm.patchValue(patch, { emitEvent: false });
    this.toggleStateRegistration();
  }

  private normalizeBirthDateForInput(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    const raw = value.trim();
    if (!raw) {
      return '';
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw;
    }

    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) {
      return '';
    }

    return new Date(parsed).toISOString().slice(0, 10);
  }

  private setupCepLookup(): void {
    const zipControl = this.profileForm.get('zipCode');
    if (!zipControl) {
      return;
    }

    zipControl.valueChanges
      .pipe(
        tap((value) => {
          const formatted = formatCep(value || '');
          if ((value || '') !== formatted) {
            zipControl.setValue(formatted, { emitEvent: false });
          }
        }),
        debounceTime(500),
        distinctUntilChanged(),
        takeUntil(this.destroy$),
        switchMap((value) => {
          const cep = normalizeCep(value ?? '');
          this.cepError = '';

          if (cep.length !== 8) {
            return of(null);
          }

          this.loadingCep = true;
          return this.cepService.lookup(cep).pipe(
            catchError((err) => {
              this.cepError = err?.error?.error ?? 'CEP nao encontrado.';
              return of(null);
            }),
            finalize(() => (this.loadingCep = false))
          );
        })
      )
      .subscribe({
        next: (result: any) => {
          if (!result) {
            return;
          }

          this.applyCepResult(result);
        }
      });
  }

  private setupDocumentFormatting(): void {
    const docControl = this.profileForm.get('document');
    if (!docControl) {
      return;
    }

    docControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((value) => {
        const digits = this.onlyDigits(value || '');
        // detecção automática sem travar digitação de CNPJ:
        // - força PJ apenas quando completar 14 dígitos
        // - força PF apenas se não estava PJ (evita flip no meio de digitar CNPJ)
        const currentType = Number(this.profileForm.get('personType')?.value ?? 2);
        if (digits.length === 14) {
          this.profileForm.get('personType')?.setValue(2, { emitEvent: false });
        } else if (digits.length <= 11 && currentType !== 2) {
          this.profileForm.get('personType')?.setValue(1, { emitEvent: false });
        }

        const personType = Number(this.profileForm.get('personType')?.value ?? 2);
        const formatted = personType === 1 ? this.formatCpf(digits) : this.formatCnpj(digits);

        if ((value || '') !== formatted) {
          docControl.setValue(formatted, { emitEvent: false });
        }

        // lookup automático quando DV é válido e mudou
        if (personType === 1) {
          if (digits.length === 11 && this.isValidCpf(digits)) {
            this.lookupDocument(digits);
          }
        } else {
          if (digits.length === 14 && this.isValidCnpj(digits)) {
            this.lookupDocument(digits);
          }
        }
      });
  }

  private setupWhatsappFormatting(): void {
    const whatsappControl = this.profileForm.get('whatsapp');
    if (!whatsappControl) return;

    whatsappControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
      const digits = this.onlyDigits(value || '');
      const formatted = this.formatWhatsapp(digits);
      if ((value || '') !== formatted) {
        whatsappControl.setValue(formatted, { emitEvent: false });
      }
    });
  }

  handleWhatsappInput(): void {
    const ctrl = this.profileForm.get('whatsapp');
    if (!ctrl) return;
    const digits = this.onlyDigits(ctrl.value || '');
    const formatted = this.formatWhatsapp(digits);
    ctrl.setValue(formatted, { emitEvent: false });
  }

  private setupResponsibleDocumentFormatting(): void {
    const ctrl = this.profileForm.get('responsibleDocument');
    if (!ctrl) return;

    ctrl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
      const digits = this.onlyDigits(value || '');
      const formatted = this.formatCpf(digits);
      if ((value || '') !== formatted) {
        ctrl.setValue(formatted, { emitEvent: false });
      }
    });
  }

  handleResponsibleDocumentInput(): void {
    const ctrl = this.profileForm.get('responsibleDocument');
    if (!ctrl) return;
    const digits = this.onlyDigits(ctrl.value || '');
    ctrl.setValue(this.formatCpf(digits), { emitEvent: false });
  }

  private handlePersonTypeChanges(): void {
    const personTypeControl = this.profileForm.get('personType');
    personTypeControl?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.isCpf) {
        this.profileForm.patchValue(
          { tradeName: '', isStateRegistrationExempt: false },
          { emitEvent: false }
        );
      }
      this.profileForm.get('document')?.updateValueAndValidity();
      this.profileForm.get('stateRegistration')?.updateValueAndValidity();
      this.toggleStateRegistration();
    });
  }

  private handleStateChanges(): void {
    const stateControl = this.profileForm.get('state');
    stateControl?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      const ctrl = this.profileForm.get('stateRegistration');
      ctrl?.updateValueAndValidity();
    });
  }

  private handleStateRegistrationToggle(): void {
    const exemptControl = this.profileForm.get('isStateRegistrationExempt');
    exemptControl?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.toggleStateRegistration();
    });
  }

  private toggleStateRegistration(): void {
    const personType = Number(this.profileForm.get('personType')?.value ?? 2);
    const exempt = !!this.profileForm.get('isStateRegistrationExempt')?.value;
    const control = this.profileForm.get('stateRegistration');

    if (!control) {
      return;
    }

    if (personType === 1) {
      control.disable({ emitEvent: false });
      control.setValue('', { emitEvent: false });
      control.updateValueAndValidity({ emitEvent: false });
      return;
    }

    if (exempt) {
      control.disable({ emitEvent: false });
      control.setValue('ISENTO', { emitEvent: false });
    } else {
      control.enable({ emitEvent: false });
      if (control.value === 'ISENTO') {
        control.setValue('', { emitEvent: false });
      }
    }

    control.updateValueAndValidity({ emitEvent: false });
  }

  private lookupDocument(digits: string): void {
    if (this.lastLookupDoc === digits) {
      return;
    }
    this.lastLookupDoc = digits;

    this.docLookupService.lookup(digits).subscribe({
      next: (result) => {
        // CPF retorna 204 No Content (sem body), então result pode ser null
        if (!result) {
          return;
        }

        const patch: any = {};
        if (result.legalName) {
          patch.legalName = result.legalName;
        }
        if (result.tradeName && this.isCnpj) {
          patch.tradeName = result.tradeName;
        }
        if (this.isCnpj) {
          if (result.stateRegistration) {
            patch.stateRegistration = formatIE(result.stateRegistration, this.profileForm.get('state')?.value || '');
          }
          if (result.isStateRegistrationExempt) {
            patch.isStateRegistrationExempt = true;
            this.profileForm.get('stateRegistration')?.disable({ emitEvent: false });
            patch.stateRegistration = 'ISENTO';
          }
        }

        const addr = result.address;
        if (addr) {
          if (addr.zipCode) patch.zipCode = formatCep(addr.zipCode);
          if (addr.street) patch.street = addr.street;
          if (addr.number) patch.number = addr.number;
          if (addr.district) patch.district = addr.district;
          if (addr.city) patch.city = addr.city;
          if (addr.state) patch.state = addr.state.toUpperCase();
          if (addr.complement) patch.complement = addr.complement;
        }

        this.profileForm.patchValue(patch, { emitEvent: false });
        this.toggleStateRegistration();
      },
      error: (err) => {
        // 404: documento não encontrado - permitir edição manual
        // 503: serviço indisponível - mostrar mensagem
        // Outros: permitir edição manual
        if (err.status === 503) {
          console.warn('[DocumentLookup] Serviço de validação indisponível (503). Preenchimento manual necessário.');
        }
      }
    });
  }

  private applyCepResult(result: any): void {
    const street = this.profileForm.get('street');
    const district = this.profileForm.get('district');
    const city = this.profileForm.get('city');
    const state = this.profileForm.get('state');
    const complement = this.profileForm.get('complement');

    if (street && !street.value) {
      street.setValue(result.street || '', { emitEvent: false });
    }
    if (district && !district.value) {
      district.setValue(result.district || '', { emitEvent: false });
    }
    if (city && !city.value) {
      city.setValue(result.city || '', { emitEvent: false });
    }
    if (state && !state.value) {
      state.setValue(result.state || '', { emitEvent: false });
    }
    if (complement && !complement.value && result.complement) {
      complement.setValue(result.complement, { emitEvent: false });
    }
  }

  private formatWhatsapp(digits: string): string {
    if (digits.length === 0) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length === 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    // 11+ (padrão celular)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  }

  onStateRegistrationBlur(): void {
    const ctrl = this.profileForm.get('stateRegistration');
    const state = (this.profileForm.get('state')?.value || '').toString().toUpperCase();
    if (!ctrl || ctrl.disabled) return;
    const val = (ctrl.value || '').toString();
    if (!val.trim() || val.toUpperCase() === 'ISENTO') return;
    ctrl.setValue(formatIE(val, state), { emitEvent: false });
  }

  private documentValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      const personType = Number(this.profileForm.get('personType')?.value ?? 2);
      if (!value) {
        return null;
      }
      const digits = this.onlyDigits(value);
      if (personType === 1) {
        return this.isValidCpf(digits) ? null : { cpf: true };
      }
      return this.isValidCnpj(digits) ? null : { cnpj: true };
    };
  }

  private stateRegistrationValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const personType = Number(this.profileForm.get('personType')?.value ?? 2);
      const exempt = !!this.profileForm.get('isStateRegistrationExempt')?.value;
      if (personType === 1 || exempt) {
        return null;
      }
      const uf = (this.profileForm.get('state')?.value || '').toString().toUpperCase();
      const value = (control.value || '').toString();
      if (!value.trim()) return { required: true };
      return isValidIE(value, uf, false) ? null : { ieInvalid: true };
    };
  }

  private whatsappValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = this.onlyDigits(control.value || '');
      if (!value) {
        return null;
      }
      return value.length >= 10 && value.length <= 13 ? null : { whatsapp: true };
    };
  }

  private responsibleDocumentValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value || '';
      const digits = this.onlyDigits(value);
      if (!digits) return null;
      return this.isValidCpf(digits) ? null : { cpf: true };
    };
  }

  private cepValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = normalizeCep(control.value || '');
      if (!value) {
        return null;
      }
      return value.length === 8 ? null : { cep: true };
    };
  }

  private ufValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = (control.value || '').toString().toUpperCase();
      if (!value) {
        return null;
      }
      return this.ufList.includes(value) ? null : { uf: true };
    };
  }

  private onlyDigits(value: string): string {
    return (value || '').replace(/\D+/g, '');
  }

  private formatCpf(digits: string): string {
    const v = digits.slice(0, 11);
    if (v.length <= 3) return v;
    if (v.length <= 6) return `${v.slice(0, 3)}.${v.slice(3)}`;
    if (v.length <= 9) return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6)}`;
    return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`;
  }

  private formatCnpj(digits: string): string {
    const v = digits.slice(0, 14);
    if (v.length <= 2) return v;
    if (v.length <= 5) return `${v.slice(0, 2)}.${v.slice(2)}`;
    if (v.length <= 8) return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5)}`;
    if (v.length <= 12) return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8)}`;
    return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`;
  }

  private isValidCpf(value: string): boolean {
    if (!value || value.length !== 11) return false;
    if (/^(\d)\1+$/.test(value)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i += 1) {
      sum += parseInt(value.charAt(i), 10) * (10 - i);
    }
    let check = (sum * 10) % 11;
    if (check === 10) check = 0;
    if (check !== parseInt(value.charAt(9), 10)) return false;

    sum = 0;
    for (let i = 0; i < 10; i += 1) {
      sum += parseInt(value.charAt(i), 10) * (11 - i);
    }
    check = (sum * 10) % 11;
    if (check === 10) check = 0;
    return check === parseInt(value.charAt(10), 10);
  }

  private isValidCnpj(value: string): boolean {
    if (!value || value.length !== 14) return false;
    if (/^(\d)\1+$/.test(value)) return false;

    const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    let sum = 0;
    for (let i = 0; i < 12; i += 1) {
      sum += parseInt(value.charAt(i), 10) * weights1[i];
    }
    let check = sum % 11;
    check = check < 2 ? 0 : 11 - check;
    if (check !== parseInt(value.charAt(12), 10)) return false;

    sum = 0;
    for (let i = 0; i < 13; i += 1) {
      sum += parseInt(value.charAt(i), 10) * weights2[i];
    }
    check = sum % 11;
    check = check < 2 ? 0 : 11 - check;
    return check === parseInt(value.charAt(13), 10);
  }

  toggleCurrentPasswordVisibility(): void {
    this.showCurrentPassword = !this.showCurrentPassword;
  }

  toggleNewPasswordVisibility(): void {
    this.showNewPassword = !this.showNewPassword;
  }
}

