import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { PublicationsService } from './publications.service';

describe('PublicationsService', () => {
  let service: PublicationsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PublicationsService, provideHttpClient(), provideHttpClientTesting()]
    });

    service = TestBed.inject(PublicationsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('estimateFees should skip HTTP when categoryId is invalid', () => {
    let emitted = false;
    let completed = false;

    service
      .estimateFees({
        integrationId: 'integration-id',
        channel: 'mercadolivre',
        sellerId: '123',
        siteId: 'MLB',
        categoryId: 'cozinha',
        listingTypeId: 'gold_special',
        price: 10,
        currencyId: 'BRL',
        variantSku: 'SKU-TESTE-01'
      })
      .subscribe({
        next: () => {
          emitted = true;
        },
        complete: () => {
          completed = true;
        }
      });

    httpMock.expectNone(`${environment.apiBaseUrl}/client/publications/fees/estimate`);
    expect(emitted).toBe(false);
    expect(completed).toBe(true);
  });

  it('getCategoryAttributes should skip HTTP when categoryId is invalid', () => {
    let emitted = false;
    let completed = false;

    service
      .getCategoryAttributes({
        integrationId: 'integration-id',
        channel: 'mercadolivre',
        sellerId: '123',
        siteId: 'MLB',
        categoryId: 'cozinha'
      })
      .subscribe({
        next: () => {
          emitted = true;
        },
        complete: () => {
          completed = true;
        }
      });

    httpMock.expectNone(`${environment.apiBaseUrl}/client/marketplaces/categories/attributes`);
    expect(emitted).toBe(false);
    expect(completed).toBe(true);
  });

  it('estimateFees should call HTTP once when categoryId is valid and normalized', () => {
    service
      .estimateFees({
        integrationId: 'integration-id',
        channel: 'mercadolivre',
        sellerId: '123',
        siteId: 'MLB',
        categoryId: 'mlb1055',
        listingTypeId: 'gold_special',
        price: 10,
        currencyId: 'BRL',
        variantSku: 'SKU-TESTE-01'
      })
      .subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/client/publications/fees/estimate`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.categoryId).toBe('MLB1055');
    expect(req.request.body.variantSku).toBe('SKU-TESTE-01');
    expect(req.request.body.productCost).toBeUndefined();
    req.flush({
      integrationId: 'integration-id',
      sellerId: '123',
      categoryId: 'MLB1055',
      listingTypeId: 'gold_special',
      currencyId: 'BRL',
      price: 10,
      saleFee: 1,
      fixedFee: 0,
      totalFees: 1,
      productCost: 0,
      operationalCost: 0,
      estimatedProfit: 9,
      marginPercent: 90,
      source: 'ml-api'
    });
  });

  it('estimateFees should validate category by siteId', () => {
    service
      .estimateFees({
        integrationId: 'integration-id',
        channel: 'mercadolivre',
        sellerId: '123',
        siteId: 'MLA',
        categoryId: 'MLA1055',
        listingTypeId: 'gold_special',
        price: 10,
        currencyId: 'BRL',
        variantSku: 'SKU-TESTE-01'
      })
      .subscribe();

    const validReq = httpMock.expectOne(`${environment.apiBaseUrl}/client/publications/fees/estimate`);
    expect(validReq.request.body.categoryId).toBe('MLA1055');
    validReq.flush({
      integrationId: 'integration-id',
      sellerId: '123',
      categoryId: 'MLA1055',
      listingTypeId: 'gold_special',
      currencyId: 'BRL',
      price: 10,
      saleFee: 1,
      fixedFee: 0,
      totalFees: 1,
      productCost: 0,
      operationalCost: 0,
      estimatedProfit: 9,
      marginPercent: 90,
      source: 'ml-api'
    });

    service
      .estimateFees({
        integrationId: 'integration-id',
        channel: 'mercadolivre',
        sellerId: '123',
        siteId: 'MLA',
        categoryId: 'MLB1055',
        listingTypeId: 'gold_special',
        price: 10,
        currencyId: 'BRL',
        variantSku: 'SKU-TESTE-01'
      })
      .subscribe();

    httpMock.expectNone(`${environment.apiBaseUrl}/client/publications/fees/estimate`);
  });

  it('getCapabilities should use the client publications endpoint', () => {
    service.getCapabilities().subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/client/publications/capabilities`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('requestProductCorrection should post only the correction workflow payload', () => {
    const payload = {
      productId: 'SKU-TESTE-01',
      fields: ['NCM', 'GTIN'],
      message: 'Corrigir dados mestres.'
    };

    service.requestProductCorrection(payload).subscribe();

    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/client/publications/product-correction-requests`
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ requestId: 'request-id', status: 'OPEN' });
  });
});
