import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CepLookupResult {
  cep: string;
  street?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  complement?: string | null;
}

export function normalizeCep(value: string): string {
  return (value || '').replace(/\D+/g, '').slice(0, 8);
}

export function formatCep(value: string): string {
  const digits = normalizeCep(value);
  if (!digits) {
    return '';
  }
  if (digits.length <= 5) {
    return digits;
  }
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

@Injectable({ providedIn: 'root' })
export class CepService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  lookup(cep: string): Observable<CepLookupResult> {
    return this.http.get<CepLookupResult>(`${this.apiBaseUrl}/api/v1/utils/cep/${cep}`);
  }
}
