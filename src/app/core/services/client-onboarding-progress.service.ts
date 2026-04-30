import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ClientOnboardingProgressService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  setStep(step: number): Observable<{ success: boolean; step: number }> {
    return this.http.put<{ success: boolean; step: number }>(
      `${this.apiBaseUrl}/client/onboarding/step`,
      { step }
    );
  }
}

