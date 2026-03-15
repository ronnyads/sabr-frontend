import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NbButtonModule, NbIconModule } from '@nebular/theme';
import { Subject, finalize, takeUntil } from 'rxjs';
import {
  ClientIntegrationCard,
  ClientIntegrationsHubService
} from '../core/services/client-integrations-hub.service';

@Component({
  selector: 'app-client-integrations-hub',
  standalone: true,
  imports: [CommonModule, NbButtonModule, NbIconModule],
  templateUrl: './client-integrations-hub.html',
  styleUrls: ['./client-integrations-hub.scss']
})
export class ClientIntegrationsHub implements OnInit, OnDestroy {
  loading = false;
  cards: ClientIntegrationCard[] = [];
  error: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly service: ClientIntegrationsHubService,
    private readonly router: Router
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

  navigate(card: ClientIntegrationCard): void {
    const slugMap: Record<number, string> = {
      1: 'mercadolivre',
      2: 'tinyerp',
      3: 'shopify'
    };
    const slug = slugMap[card.provider] ?? 'mercadolivre';
    void this.router.navigate(['/client/integrations', slug]);
  }

  getLogoSrc(provider: number): string {
    const map: Record<number, string> = {
      1: 'assets/logos/mercadolivre.svg',
      2: 'assets/logos/olist.svg',
      3: 'assets/logos/shopify.svg'
    };
    return map[provider] ?? 'assets/logos/mercadolivre.svg';
  }
}
