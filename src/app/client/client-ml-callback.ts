import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-client-ml-callback',
  standalone: true,
  template: `<div style="display: flex; align-items: center; justify-content: center; height: 100vh;">
    <p>Processando autorização do Mercado Livre...</p>
  </div>`
})
export class ClientMlCallback implements OnInit {
  constructor(
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const code = this.route.snapshot.queryParamMap.get('code');
    const state = this.route.snapshot.queryParamMap.get('state');

    if (!code || !state) {
      this.redirectToIntegration('missing_code_or_state');
      return;
    }

    // Chama o backend POST para processar o callback
    this.http.post<{ status: string }>('/api/v1/client/integrations/mercadolivre/callback', {
      code,
      state
    }).subscribe({
      next: () => {
        this.redirectToIntegration('connected');
      },
      error: (err) => {
        let errorParam = 'oauth_error';
        if (err.status === 400) {
          const error = err.error?.error || 'unknown';
          if (error === 'invalid_state') {
            errorParam = 'invalid_state';
          } else if (error === 'missing_code_or_state') {
            errorParam = 'missing_code_or_state';
          }
        }
        this.redirectToIntegration(errorParam);
      }
    });
  }

  private redirectToIntegration(status: string): void {
    void this.router.navigate(['/client/integrations/mercadolivre'], {
      queryParams: { ml: status }
    });
  }
}
