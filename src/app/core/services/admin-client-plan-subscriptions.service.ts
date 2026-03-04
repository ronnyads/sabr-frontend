import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BillingPeriod } from './admin-plans.service';

export interface ClientPlanSubscriptionItem {
  planId: string;
  billingPeriod: BillingPeriod;
  startsAt: string;
  endsAt: string;
}

export interface ClientPlanSubscriptionsResult {
  clientId: string;
  tenantSlug: string;
  items: ClientPlanSubscriptionItem[];
}

@Injectable({ providedIn: 'root' })
export class AdminClientPlanSubscriptionsService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  getCurrent(tenantSlug: string, clientId: string): Observable<ClientPlanSubscriptionsResult> {
    return this.http.get<ClientPlanSubscriptionsResult>(
      `${this.apiBaseUrl}/api/v1/admin/tenants/${encodeURIComponent(tenantSlug)}/clients/${clientId}/plan-subscriptions`
    );
  }

  replaceSet(
    tenantSlug: string,
    clientId: string,
    planIds: string[]
  ): Observable<ClientPlanSubscriptionsResult> {
    return this.http.put<ClientPlanSubscriptionsResult>(
      `${this.apiBaseUrl}/api/v1/admin/tenants/${encodeURIComponent(tenantSlug)}/clients/${clientId}/plan-subscriptions`,
      { planIds }
    );
  }
}
