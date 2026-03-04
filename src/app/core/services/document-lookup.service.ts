import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DocumentLookupResponse {
  personType: 'pj' | 'pf';
  legalName?: string | null;
  tradeName?: string | null;
  stateRegistration?: string | null;
  isStateRegistrationExempt?: boolean;
  address?: {
    zipCode?: string | null;
    street?: string | null;
    number?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
    complement?: string | null;
  };
}

@Injectable({ providedIn: 'root' })
export class DocumentLookupService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  lookup(documentDigits: string): Observable<DocumentLookupResponse> {
    return this.http.get<DocumentLookupResponse>(`${this.apiBaseUrl}/api/v1/utils/doc/${documentDigits}`);
  }
}
