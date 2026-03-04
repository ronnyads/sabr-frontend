import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MercadoLivreIntegrationStatusResult } from './mercado-livre-integration.service';

@Injectable({ providedIn: 'root' })
export class AdminMercadoLivreIntegrationService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  getStatus(tenantSlug: string, clientId: string): Observable<MercadoLivreIntegrationStatusResult> {
    const normalizedTenantSlug = encodeURIComponent((tenantSlug ?? '').trim().toLowerCase());
    const normalizedClientId = encodeURIComponent((clientId ?? '').trim());
    return this.http.get<MercadoLivreIntegrationStatusResult>(
      `${this.apiBaseUrl}/api/v1/admin/tenants/${normalizedTenantSlug}/clients/${normalizedClientId}/integrations/mercadolivre/status`
    );
  }
}
