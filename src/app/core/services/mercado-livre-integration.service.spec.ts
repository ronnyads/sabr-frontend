import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { MercadoLivreIntegrationService } from './mercado-livre-integration.service';

describe('MercadoLivreIntegrationService history sync', () => {
  let service: MercadoLivreIntegrationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MercadoLivreIntegrationService, provideHttpClient(), provideHttpClientTesting()]
    });

    service = TestBed.inject(MercadoLivreIntegrationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads the reconciled historical coverage status', () => {
    service.historySyncStatus().subscribe();

    const request = httpMock.expectOne(
      `${environment.apiBaseUrl}/client/integrations/mercadolivre/history-sync/status`
    );
    expect(request.request.method).toBe('GET');
    request.flush({ overallStatus: 'CURRENT', sellers: [] });
  });

  it('starts an idempotent history sync for the selected seller', () => {
    service.startHistorySync(' 123 ').subscribe();

    const request = httpMock.expectOne(
      `${environment.apiBaseUrl}/client/integrations/mercadolivre/history-sync`
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ sellerId: '123' });
    request.flush({ overallStatus: 'INITIAL_PENDING', sellers: [] });
  });

  it('starts history sync for every connected seller when no seller is selected', () => {
    service.startHistorySync().subscribe();

    const request = httpMock.expectOne(
      `${environment.apiBaseUrl}/client/integrations/mercadolivre/history-sync`
    );
    expect(request.request.body).toEqual({ sellerId: null });
    request.flush({ overallStatus: 'INITIAL_PENDING', sellers: [] });
  });
});
