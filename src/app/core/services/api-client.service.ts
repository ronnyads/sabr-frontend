import { Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private readonly base = environment.apiBaseUrl.replace(/\/+$/, '');

  constructor(private http: HttpClient) {}

  request<T>(
    method: HttpMethod,
    url: string,
    options: {
      body?: any;
      params?: HttpParams | { [param: string]: string | number | boolean | ReadonlyArray<string | number | boolean> };
      headers?: HttpHeaders | { [header: string]: string | string[] };
      context?: HttpContext;
    } = {}
  ) {
    const sanitizedUrl = this.isAbsolute(url) ? url : `${this.base}/${url.replace(/^\/+/, '')}`;
    return this.http.request<T>(method, sanitizedUrl, {
      ...options
    });
  }

  private isAbsolute(url: string) {
    return /^https?:\/\//i.test(url);
  }
}
