import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NbButtonModule, NbInputModule, NbSpinnerModule, NbToastrService } from '@nebular/theme';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import {
  AdminAiPromptConfigResult,
  AdminAiPromptConfigUpsertRequest,
  AdminAiPromptsService
} from '../core/services/admin-ai-prompts.service';
import { UiStateComponent } from '../shared/ui-state/ui-state.component';
import { PageHeaderComponent } from '../shared/page-header/page-header.component';
import { RowActionMenuAction, RowActionsMenuComponent } from '../shared/row-actions-menu/row-actions-menu.component';

@Component({
  selector: 'app-admin-ai-prompts',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NbButtonModule,
    NbInputModule,
    NbSpinnerModule,
    UiStateComponent,
    PageHeaderComponent,
    RowActionsMenuComponent
  ],
  templateUrl: './admin-ai-prompts.html',
  styleUrls: ['./admin-ai-prompts.scss']
})
export class AdminAiPrompts implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    id: [''],
    feature: ['', [Validators.required]],
    channel: ['', [Validators.required]],
    name: ['', [Validators.required, Validators.maxLength(200)]],
    prompt: ['', [Validators.required]],
    isActive: [true]
  });

  prompts: AdminAiPromptConfigResult[] = [];
  promptActionsById: Record<string, RowActionMenuAction[]> = {};

  loading = false;
  errorMessage: string | null = null;

  formOpen = false;
  formError: string | null = null;
  editingPromptId: string | null = null;
  saving = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly aiPromptsService: AdminAiPromptsService,
    private readonly toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    this.loadPrompts();
    this.form.get('feature')?.valueChanges.pipe(debounceTime(300), takeUntil(this.destroy$)).subscribe(() => {
      this.updatePromptActions();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadPrompts(): void {
    this.loading = true;
    this.errorMessage = null;
    this.aiPromptsService.list().subscribe({
      next: (prompts) => {
        this.prompts = prompts;
        this.updatePromptActions();
        this.loading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        this.errorMessage = `Erro ao carregar prompts: ${error.status}`;
        this.toastr.danger(this.errorMessage, 'Admin AI Prompts');
      }
    });
  }

  openForm(prompt?: AdminAiPromptConfigResult): void {
    this.formError = null;
    if (prompt) {
      this.editingPromptId = prompt.id;
      this.form.patchValue({
        id: prompt.id,
        feature: prompt.feature,
        channel: prompt.channel,
        name: prompt.name,
        prompt: prompt.prompt,
        isActive: prompt.isActive
      });
    } else {
      this.editingPromptId = null;
      this.form.reset({ isActive: true });
    }
    this.formOpen = true;
  }

  closeForm(): void {
    this.formOpen = false;
    this.form.reset();
    this.formError = null;
  }

  savePrompt(): void {
    if (!this.form.valid) {
      this.formError = 'Preencha todos os campos obrigatórios';
      return;
    }

    this.saving = true;
    const request: AdminAiPromptConfigUpsertRequest = {
      id: this.form.value.id || null,
      feature: this.form.value.feature || '',
      channel: this.form.value.channel || '',
      name: this.form.value.name || '',
      prompt: this.form.value.prompt || '',
      isActive: this.form.value.isActive ?? true
    };

    this.aiPromptsService.upsert(request).subscribe({
      next: () => {
        this.saving = false;
        this.closeForm();
        this.loadPrompts();
        this.toastr.success('Prompt salvo com sucesso', 'Admin AI Prompts');
      },
      error: (error: HttpErrorResponse) => {
        this.saving = false;
        this.formError = `Erro ao salvar: ${error.status}`;
        this.toastr.danger(this.formError, 'Admin AI Prompts');
      }
    });
  }

  deletePrompt(id: string): void {
    if (!confirm('Tem certeza que deseja deletar este prompt?')) {
      return;
    }

    this.aiPromptsService.delete(id).subscribe({
      next: () => {
        this.loadPrompts();
        this.toastr.success('Prompt deletado com sucesso', 'Admin AI Prompts');
      },
      error: (error: HttpErrorResponse) => {
        this.toastr.danger(`Erro ao deletar: ${error.status}`, 'Admin AI Prompts');
      }
    });
  }

  private updatePromptActions(): void {
    this.promptActionsById = {};
    for (const prompt of this.prompts) {
      this.promptActionsById[prompt.id] = [
        { id: `edit-${prompt.id}`, label: 'Editar', icon: 'edit-2-outline' },
        { id: `delete-${prompt.id}`, label: 'Deletar', icon: 'trash-2-outline', danger: true }
      ];
    }
  }

  onPromptActionClick(actionId: string, promptId: string): void {
    if (actionId.startsWith('edit-')) {
      const prompt = this.prompts.find(p => p.id === promptId);
      if (prompt) this.openForm(prompt);
    } else if (actionId.startsWith('delete-')) {
      this.deletePrompt(promptId);
    }
  }
}
