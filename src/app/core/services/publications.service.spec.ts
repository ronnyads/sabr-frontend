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
        currencyId: 'BRL'
      })
      .subscribe({
        next: () => {
          emitted = true;
        },
        complete: () => {
          completed = true;
        }
      });

    httpMock.expectNone(`${environment.apiBaseUrl}/client/marketplaces/fees/estimate`);
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
        currencyId: 'BRL'
      })
      .subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/client/marketplaces/fees/estimate`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.categoryId).toBe('MLB1055');
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
        currencyId: 'BRL'
      })
      .subscribe();

    const validReq = httpMock.expectOne(`${environment.apiBaseUrl}/client/marketplaces/fees/estimate`);
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
        currencyId: 'BRL'
      })
      .subscribe();

    httpMock.expectNone(`${environment.apiBaseUrl}/client/marketplaces/fees/estimate`);
  });
});
