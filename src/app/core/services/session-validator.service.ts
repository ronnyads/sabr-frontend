/**
 * Session Validator Service
 * Validates session data and token expiration
 */

import { Injectable } from '@angular/core';
import {
  SessionData,
  SessionValidationResult,
  ValidationReason,
  SuggestedAction
} from '../models/session.model';
import { createLogger } from '../utils/logger';

const logger = createLogger('SessionValidator');

@Injectable({ providedIn: 'root' })
export class SessionValidatorService {
  // Default: refresh token 5 minutes before expiration
  private readonly tokenRefreshBufferMs = 5 * 60 * 1000;

  constructor() {}

  /**
   * Validate a complete session
   */
  public validate(session: SessionData | null): SessionValidationResult {
    // Check if session exists
    if (!session) {
      return this.createInvalidResult('MISSING_TOKEN', 'LOGOUT');
    }

    // Check required fields
    if (!session.accessToken) {
      return this.createInvalidResult('MISSING_TOKEN', 'LOGOUT');
    }

    if (!session.user) {
      return this.createInvalidResult('MISSING_USER', 'LOGOUT');
    }

    if (!session.expiresAt) {
      return this.createInvalidResult('MISSING_EXPIRY', 'LOGOUT');
    }

    // Check if token format is valid
    if (!this.isValidTokenFormat(session.accessToken)) {
      return this.createInvalidResult('INVALID_FORMAT', 'LOGOUT');
    }

    // Check expiration
    const expiryTime = new Date(session.expiresAt).getTime();
    const now = Date.now();

    if (expiryTime <= now) {
      // Token is already expired
      return this.createInvalidResult('EXPIRED', 'REFRESH_OR_LOGOUT', {
        timeToExpiryMs: expiryTime - now,
        timeToExpiryHumanReadable: 'already expired'
      });
    }

    const timeToExpiry = expiryTime - now;

    if (timeToExpiry < this.tokenRefreshBufferMs) {
      // Token is expiring soon
      return this.createInvalidResult('EXPIRING_SOON', 'REFRESH', {
        timeToExpiryMs: timeToExpiry,
        timeToExpiryHumanReadable: this.msToHumanReadable(timeToExpiry)
      });
    }

    // Token is valid
    return {
      valid: true,
      reason: 'VALID',
      suggestedAction: 'NONE',
      details: {
        timeToExpiryMs: timeToExpiry,
        timeToExpiryHumanReadable: this.msToHumanReadable(timeToExpiry)
      }
    };
  }

  /**
   * Check if a token is expired
   */
  public isTokenExpired(expiresAt: string | null): boolean {
    if (!expiresAt) {
      return true;
    }

    try {
      const expiryTime = new Date(expiresAt).getTime();
      return expiryTime <= Date.now();
    } catch (error) {
      logger.warn('Failed to parse expiration time', error);
      return true;
    }
  }

  /**
   * Check if a token is expiring soon (within buffer period)
   */
  public isTokenExpiringSoon(expiresAt: string | null, bufferMs?: number): boolean {
    if (!expiresAt) {
      return true;
    }

    try {
      const buffer = bufferMs || this.tokenRefreshBufferMs;
      const expiryTime = new Date(expiresAt).getTime();
      return expiryTime - Date.now() <= buffer;
    } catch (error) {
      logger.warn('Failed to check token expiration', error);
      return true;
    }
  }

  /**
   * Estimate time remaining until token expires
   */
  public estimateTimeToExpiry(expiresAt: string | null): {
    ms: number;
    humanReadable: string;
    isExpired: boolean;
  } {
    if (!expiresAt) {
      return {
        ms: 0,
        humanReadable: 'unknown',
        isExpired: true
      };
    }

    try {
      const expiryTime = new Date(expiresAt).getTime();
      const timeToExpiry = expiryTime - Date.now();

      return {
        ms: Math.max(0, timeToExpiry),
        humanReadable: this.msToHumanReadable(timeToExpiry),
        isExpired: timeToExpiry <= 0
      };
    } catch (error) {
      logger.warn('Failed to estimate time to expiry', error);
      return {
        ms: 0,
        humanReadable: 'unknown',
        isExpired: true
      };
    }
  }

  /**
   * Validate token format (basic JWT structure)
   */
  private isValidTokenFormat(token: string): boolean {
    if (!token || typeof token !== 'string') {
      return false;
    }

    // Basic JWT format: three parts separated by dots
    const parts = token.split('.');
    return parts.length === 3;
  }

  /**
   * Create an invalid validation result
   */
  private createInvalidResult(
    reason: ValidationReason,
    suggestedAction: SuggestedAction,
    details?: any
  ): SessionValidationResult {
    return {
      valid: false,
      reason,
      suggestedAction,
      details
    };
  }

  /**
   * Convert milliseconds to human-readable format
   */
  private msToHumanReadable(ms: number): string {
    if (ms < 0) {
      return 'expired';
    }

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Get a user-friendly message for validation result
   */
  public getValidationMessage(result: SessionValidationResult): string {
    switch (result.reason) {
      case 'VALID':
        return 'Session is valid';
      case 'MISSING_TOKEN':
        return 'Session token is missing';
      case 'MISSING_USER':
        return 'User information is missing';
      case 'MISSING_EXPIRY':
        return 'Token expiration time is missing';
      case 'EXPIRED':
        return 'Session token has expired';
      case 'EXPIRING_SOON':
        return `Token expires in ${result.details?.timeToExpiryHumanReadable || 'a few minutes'}`;
      case 'INVALID_FORMAT':
        return 'Session token format is invalid';
      default:
        return 'Session validation failed';
    }
  }

  /**
   * Validate user data
   */
  public validateUserData(user: any): boolean {
    return !!(user && user.id && user.email && user.name);
  }

  /**
   * Get validation recommendations
   */
  public getRecommendations(result: SessionValidationResult): string[] {
    const recommendations: string[] = [];

    if (result.reason === 'EXPIRING_SOON') {
      recommendations.push('Token is expiring soon. Consider refreshing.');
    }

    if (result.reason === 'EXPIRED') {
      recommendations.push('Token has expired. Please log in again.');
    }

    if (result.reason === 'MISSING_TOKEN' || result.reason === 'MISSING_USER') {
      recommendations.push('Session is invalid. Please log in again.');
    }

    if (result.reason === 'INVALID_FORMAT') {
      recommendations.push('Token format is invalid. This should not happen. Please log in again.');
    }

    return recommendations;
  }
}
