import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ClientProfileUpdateRequest {
  personType: number;
  legalName: string;
  tradeName?: string | null;
  document: string;
  stateRegistration?: string | null;
  isStateRegistrationExempt: boolean;
  email: string;
  whatsapp: string;
  phone?: string | null;
  birthDate?: string | null;
  zipCode: string;
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
  complement?: string | null;
  responsibleName: string;
  responsibleDocument: string;
}

export interface ClientProfileResult {
  id: string;
  status: number;
  profileCompletedAt?: string | null;
  email: string;
  mustChangePassword?: boolean | null;
}

export interface ClientProfileView {
  id: string;
  personType?: number | null;
  legalName?: string | null;
  tradeName?: string | null;
  document?: string | null;
  stateRegistration?: string | null;
  isStateRegistrationExempt?: boolean;
  email?: string | null;
  whatsapp?: string | null;
  birthDate?: string | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  complement?: string | null;
  responsibleName?: string | null;
  responsibleDocument?: string | null;
  status?: number | null;
}

@Injectable({ providedIn: 'root' })
export class ClientProfileService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  getProfile(): Observable<ClientProfileView> {
    return this.http.get<ClientProfileView>(`${this.apiBaseUrl}/client/profile`);
  }

  updateProfile(payload: ClientProfileUpdateRequest): Observable<ClientProfileResult> {
    return this.http.put<ClientProfileResult>(`${this.apiBaseUrl}/client/profile`, payload);
  }
}
