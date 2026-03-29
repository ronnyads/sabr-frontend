/**
 * Session Manager Service
 * Orchestrates all session operations with multi-layer persistence and synchronization
 */

import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject, firstValueFrom, takeUntil } from 'rxjs';
import { SessionData, SessionValidationResult, SessionManagerConfig } from '../models/session.model';
import { SessionStorageService } from './session-storage.service';
import { SessionSyncService } from './session-sync.service';
import { SessionValidatorService } from './session-validator.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('SessionManager');

const DEFAULT_CONFIG: Required<SessionManagerConfig> = {
  tokenRefreshBufferMs: 5 * 60 * 1000, // 5 minutes
  refreshTimeoutMs: 30 * 1000, // 30 seconds
  storageCheckIntervalMs: 60 * 1000, // 60 seconds
  logLevel: 'info',
  enableSupabase: true
};

@Injectable({ providedIn: 'root' })
export class SessionManagerService implements OnDestroy {
  private config: Required<SessionManagerConfig>;
  private destroy$ = new Subject<void>();

  // Current session state
  private currentSessionSubject = new BehaviorSubject<SessionData | null>(null);
  private sessionValiditySubject = new BehaviorSubject<SessionValidationResult>({
    valid: false,
    reason: 'MISSING_TOKEN',
    suggestedAction: 'LOGOUT'
  });

  // Refresh in progress tracking
  private refreshInProgress: Promise<SessionData | null> | null = null;

  // Listeners for external events
  private sessionChangedSubject = new Subject<SessionData | null>();
  private sessionErrorSubject = new Subject<{ error: Error; context: string }>();

  constructor(
    private storageService: SessionStorageService,
    private syncService: SessionSyncService,
    private validatorService: SessionValidatorService
  ) {
    this.config = DEFAULT_CONFIG;
  }

  /**
   * Initialize the session manager
   * Must be called during app bootstrap via APP_INITIALIZER
   */
  public async initialize(config?: SessionManagerConfig): Promise<void> {
    logger.info('Initializing SessionManager');

    if (config) {
      this.config = { ...DEFAULT_CONFIG, ...config };
    }

    try {
      // 1. Initialize sync service
      this.syncService.initialize();

      // 2. Restore session from storage
      const restored = await this.restoreSessionFromStorage();
      if (restored) {
        this.currentSessionSubject.next(restored);
        logger.info('Session restored from storage', { email: restored.user.email });
      } else {
        logger.info('No previous session found');
      }

      // 3. Listen for sync events from other tabs
      this.attachSyncListeners();

      // 4. Update validity on changes
      this.updateSessionValidity();

      logger.info('SessionManager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize SessionManager', error);
      this.sessionErrorSubject.next({
        error: error instanceof Error ? error : new Error(String(error)),
        context: 'initialization'
      });
    }
  }

  /**
   * Get current session
   */
  public getCurrentSession(): SessionData | null {
    return this.currentSessionSubject.value;
  }

  /**
   * Observable of current session
   */
  public get session$(): Observable<SessionData | null> {
    return this.currentSessionSubject.asObservable();
  }

  /**
   * Get current session validity status
   */
  public getSessionStatus(): SessionValidationResult {
    return this.sessionValiditySubject.value;
  }

  /**
   * Observable of session validity
   */
  public get sessionValid$(): Observable<SessionValidationResult> {
    return this.sessionValiditySubject.asObservable();
  }

  /**
   * Observable of session changes
   */
  public get sessionChanged$(): Observable<SessionData | null> {
    return this.sessionChangedSubject.asObservable();
  }

  /**
   * Observable of session errors
   */
  public get sessionError$(): Observable<{ error: Error; context: string }> {
    return this.sessionErrorSubject.asObservable();
  }

  /**
   * Check if session is valid
   */
  public hasValidSession(): boolean {
    const status = this.sessionValiditySubject.value;
    return status.valid;
  }

  /**
   * Set session (called after login)
   */
  public async setSession(data: SessionData): Promise<void> {
    try {
      logger.info('Setting session', { email: data.user.email, accountType: data.accountType });

      // Validate input
      if (!data.accessToken || !data.user || !data.expiresAt) {
        throw new Error('Invalid session data: missing required fields');
      }

      // Enrich with metadata
      const enrichedSession = this.storageService.enrichSessionWithMetadata(data);

      // Save to all storage layers
      const results = await this.storageService.save(enrichedSession);
      const successCount = results.filter((r) => r.success).length;
      logger.debug('Session persisted to storage layers', {
        totalLayers: results.length,
        successCount
      });

      // Update in-memory state
      this.currentSessionSubject.next(enrichedSession);
      this.updateSessionValidity();

      // Notify other tabs
      this.syncService.notifySessionCreated(enrichedSession);

      // Emit change event
      this.sessionChangedSubject.next(enrichedSession);

      logger.info('Session set successfully');
    } catch (error) {
      logger.error('Failed to set session', error);
      this.sessionErrorSubject.next({
        error: error instanceof Error ? error : new Error(String(error)),
        context: 'setSession'
      });
      throw error;
    }
  }

  /**
   * Refresh session token (called by auth interceptor or on demand)
   */
  public async refreshSession(): Promise<SessionData | null> {
    const current = this.currentSessionSubject.value;

    if (!current) {
      logger.warn('Cannot refresh: no session');
      return null;
    }

    // Prevent multiple simultaneous refresh calls
    if (this.refreshInProgress) {
      logger.debug('Refresh already in progress, waiting...');
      return this.refreshInProgress;
    }

    logger.info('Refreshing session token');

    this.refreshInProgress = this.performTokenRefresh()
      .then((refreshed) => {
        this.refreshInProgress = null;
        return refreshed;
      })
      .catch((error) => {
        this.refreshInProgress = null;
        throw error;
      });

    return this.refreshInProgress;
  }

  /**
   * Perform actual token refresh (delegates to AuthService via event)
   */
  private async performTokenRefresh(): Promise<SessionData | null> {
    try {
      // Note: Actual refresh is delegated to AuthService via auth interceptor
      // This method waits for the interceptor to call setSession() with new token
      // For now, we trigger a refresh request event that the auth service listens to

      const refreshTimeoutMs = this.config.refreshTimeoutMs;
      const startTime = Date.now();

      // Wait for session to be updated (up to timeout)
      return new Promise((resolve) => {
        const subscription = this.session$.subscribe((session) => {
          if (session && session.accessToken !== this.currentSessionSubject.value?.accessToken) {
            // Token was refreshed
            logger.info('Token refreshed successfully');
            subscription.unsubscribe();
            resolve(session);
            return;
          }

          // Check timeout
          if (Date.now() - startTime > refreshTimeoutMs) {
            logger.warn('Token refresh timed out');
            subscription.unsubscribe();
            resolve(null);
            return;
          }
        });

        // Wait a bit more for the interceptor to complete
        setTimeout(() => {
          subscription.unsubscribe();
          resolve(this.currentSessionSubject.value);
        }, 1000);
      });
    } catch (error) {
      logger.error('Token refresh failed', error);
      return null;
    }
  }

  /**
   * Clear session (called on logout)
   */
  public async clearSession(reason = 'user_logout'): Promise<void> {
    try {
      logger.info('Clearing session', { reason });

      // Clear from all storage layers
      await this.storageService.clear();

      // Clear in-memory state
      this.currentSessionSubject.next(null);
      this.updateSessionValidity();

      // Notify other tabs
      this.syncService.notifySessionCleared(reason);

      // Emit change event
      this.sessionChangedSubject.next(null);

      logger.info('Session cleared successfully');
    } catch (error) {
      logger.error('Error clearing session', error);
      this.sessionErrorSubject.next({
        error: error instanceof Error ? error : new Error(String(error)),
        context: 'clearSession'
      });
    }
  }

  /**
   * Restore session from storage (called on init)
   */
  private async restoreSessionFromStorage(): Promise<SessionData | null> {
    try {
      const restored = await this.storageService.restore();

      if (!restored.data) {
        logger.debug('No session in storage');
        return null;
      }

      // Validate restored session
      const validation = this.validatorService.validate(restored.data);

      if (!validation.valid && validation.reason === 'EXPIRED') {
        logger.info('Restored session is expired', { email: restored.data.user.email });
        await this.storageService.clear();
        return null;
      }

      if (!validation.valid) {
        logger.warn('Restored session is invalid', { reason: validation.reason });
        await this.storageService.clear();
        return null;
      }

      logger.info('Session restored from storage', {
        email: restored.data.user.email,
        layer: restored.layer
      });

      return restored.data;
    } catch (error) {
      logger.error('Failed to restore session from storage', error);
      return null;
    }
  }

  /**
   * Update session validity status
   */
  private updateSessionValidity(): void {
    const current = this.currentSessionSubject.value;
    const validation = this.validatorService.validate(current);
    this.sessionValiditySubject.next(validation);

    if (!validation.valid) {
      logger.info('Session validity changed', { reason: validation.reason });
    }
  }

  /**
   * Attach listeners for sync events from other tabs
   */
  private attachSyncListeners(): void {
    // Listen for session cleared in other tabs
    this.syncService.onSessionCleared
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        logger.info('Session cleared in another tab, clearing local session');
        this.clearSession('cleared_in_another_tab');
      });

    // Listen for token refresh in other tabs
    this.syncService.onTokenRefreshed
      .pipe(takeUntil(this.destroy$))
      .subscribe((session) => {
        logger.info('Token refreshed in another tab, updating local session');
        this.currentSessionSubject.next(session);
        this.updateSessionValidity();
      });

    // Listen for token expiration in other tabs
    this.syncService.onTokenExpired
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        logger.warn('Token expired in another tab');
        // Keep local session as-is, next request will trigger refresh
      });

    // Listen for session created in other tabs
    this.syncService.onSessionCreated
      .pipe(takeUntil(this.destroy$))
      .subscribe((session) => {
        logger.info('Session created in another tab, updating local session');
        this.currentSessionSubject.next(session);
        this.updateSessionValidity();
      });
  }

  /**
   * Get configuration
   */
  public getConfig(): Required<SessionManagerConfig> {
    return { ...this.config };
  }

  /**
   * Cleanup resources
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    this.currentSessionSubject.complete();
    this.sessionValiditySubject.complete();
    this.sessionChangedSubject.complete();
    this.sessionErrorSubject.complete();

    this.syncService.destroy();

    logger.info('SessionManager destroyed');
  }

  /**
   * Public destroy method
   */
  public destroy(): void {
    this.ngOnDestroy();
  }
}
