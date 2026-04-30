import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AdminAiPromptConfigResult {
  id: string;
  feature: string;
  channel: string;
  name: string;
  prompt: string;
  isActive: boolean;
  updatedAt: string;
}

export interface AdminAiPromptConfigUpsertRequest {
  id?: string | null;
  feature: string;
  channel: string;
  name: string;
  prompt: string;
  isActive: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminAiPromptsService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  list(): Observable<AdminAiPromptConfigResult[]> {
    return this.http.get<AdminAiPromptConfigResult[]>(`${this.apiBaseUrl}/admin/ai-prompts`);
  }

  getById(id: string): Observable<AdminAiPromptConfigResult> {
    return this.http.get<AdminAiPromptConfigResult>(`${this.apiBaseUrl}/admin/ai-prompts/${id}`);
  }

  upsert(request: AdminAiPromptConfigUpsertRequest): Observable<AdminAiPromptConfigResult> {
    return this.http.post<AdminAiPromptConfigResult>(`${this.apiBaseUrl}/admin/ai-prompts`, request);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/admin/ai-prompts/${id}`);
  }
}
