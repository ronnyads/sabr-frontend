import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { NbButtonModule, NbIconModule, NbToastrService } from '@nebular/theme';
import { Subject, finalize, takeUntil } from 'rxjs';
import { AdminIntegrationsHubService, IntegrationCard } from '../core/services/admin-integrations-hub.service';

@Component({
  selector: 'app-admin-integrations-hub',
  standalone: true,
  imports: [CommonModule, NbButtonModule, NbIconModule, RouterModule],
  templateUrl: './admin-integrations-hub.html',
  styleUrls: ['./admin-integrations-hub.scss']
})
export class AdminIntegrationsHub implements OnInit, OnDestroy {
  loading = false;
  cards: IntegrationCard[] = [];
  error: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly service: AdminIntegrationsHubService,
    private readonly router: Router,
    private readonly toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.service
      .listIntegrations()
      .pipe(
        finalize(() => (this.loading = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (cards) => {
          this.cards = cards;
        },
        error: () => {
          this.error = 'Falha ao carregar integrações. Tente novamente.';
        }
      });
  }

  navigate(card: IntegrationCard): void {
    const slugMap: Record<number, string> = { 1: 'mercadolivre', 2: 'tinyerp', 3: 'shopify' };
    const providerSlug = slugMap[card.provider] ?? 'mercadolivre';
    void this.router.navigate(['/integrations', providerSlug]);
  }
}
