import { ErrorHandler, Injectable } from '@angular/core';
import { captureFrontendError } from './observability';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    captureFrontendError(error);
    console.error(error);
  }
}
