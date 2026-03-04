import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NbButtonModule, NbSpinnerModule } from '@nebular/theme';

@Component({
  selector: 'app-ui-state',
  standalone: true,
  imports: [CommonModule, NbSpinnerModule, NbButtonModule],
  templateUrl: './ui-state.component.html',
  styleUrls: ['./ui-state.component.scss']
})
export class UiStateComponent {
  @Input() loading = false;
  @Input() empty = false;
  @Input() errorMessage: string | null = null;
  @Input() emptyTitle = 'Nenhum registro encontrado';
  @Input() emptyDescription = 'Ajuste os filtros e tente novamente.';
  @Input() retryLabel = 'Tentar novamente';

  @Output() retry = new EventEmitter<void>();

  onRetry(): void {
    this.retry.emit();
  }
}
