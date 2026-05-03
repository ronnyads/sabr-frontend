/**
 * Session Sync Service
 * Synchronizes session state between browser tabs/windows via BroadcastChannel
 * Fallback to storage events for older browsers
 */

import { Injectable, OnDestroy } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { SessionData, SessionSyncEvent, SessionSyncEventType } from '../models/session.model';
import { createLogger } from '../utils/logger';

const logger = createLogger('SessionSync');

/**
 * Unique identifier for this tab instance
 */
const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Channel name for BroadcastChannel communication
 */
const CHANNEL_NAME = 'phub_session_sync';

@Injectable({ providedIn: 'root' })
export class SessionSyncService implements OnDestroy {
  private broadcastChannel: BroadcastChannel | null = null;
  private useBroadcastChannel = false;
  private useStorageEvents = false;

  // Observable subjects for different event types
  private sessionClearedSubject = new Subject<void>();
  private tokenRefreshedSubject = new Subject<SessionData>();
  private tokenExpiredSubject = new Subject<void>();
  private sessionCreatedSubject = new Subject<SessionData>();

  constructor() {
    this.detectCapabilities();
  }

  /**
   * Detect which communication mechanism is available
   */
  private detectCapabilities(): void {
    if (typeof window === 'undefined') {
      logger.debug('Not in browser environment, sync disabled');
      return;
    }

    // Check for BroadcastChannel support (modern browsers)
    if ('BroadcastChannel' in window) {
      this.useBroadcastChannel = true;
      logger.info('BroadcastChannel available, will use for sync');
    }

    // Storage events as fallback (works in all browsers, less reliable)
    if (window.addEventListener) {
      this.useStorageEvents = true;
      logger.info('Storage events available as fallback');
    }

    if (!this.useBroadcastChannel && !this.useStorageEvents) {
      logger.warn('No sync mechanism available - cross-tab sync disabled');
    }
  }

  /**
   * Initialize sync service
   * Must be called during app bootstrap
   */
  public initialize(): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (this.useBroadcastChannel) {
      this.initializeBroadcastChannel();
    }

    if (this.useStorageEvents) {
      this.initializeStorageEvents();
    }

    logger.info('Session sync service initialized', { tabId: TAB_ID });
  }

  /**
   * Set up BroadcastChannel for modern browsers
   */
  private initializeBroadcastChannel(): void {
    try {
      this.broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
      this.broadcastChannel.addEventListener('message', (event: MessageEvent) => {
        this.handleBroadcastMessage(event.data);
      });
      logger.debug('BroadcastChannel opened');
    } catch (error) {
      logger.warn('Failed to initialize BroadcastChannel', error);
      this.useBroadcastChannel = false;
    }
  }

  /**
   * Set up storage events as fallback
   */
  private initializeStorageEvents(): void {
    try {
      window.addEventListener('storage', (event: StorageEvent) => {
        if (event.key === CHANNEL_NAME) {
          try {
            const data = event.newValue ? JSON.parse(event.newValue) : null;
            this.handleBroadcastMessage(data);
          } catch (error) {
            logger.warn('Failed to parse storage event', error);
          }
        }
      });
      logger.debug('Storage event listener attached');
    } catch (error) {
      logger.warn('Failed to attach storage event listener', error);
      this.useStorageEvents = false;
    }
  }

  /**
   * Handle incoming broadcast message
   */
  private handleBroadcastMessage(event: SessionSyncEvent): void {
    // Ignore messages from ourselves
    if (event.source === TAB_ID) {
      return;
    }

    logger.debug('Received sync event', { type: event.type, sourceTab: event.source });

    switch (event.type) {
      case 'SESSION_CREATED':
        if (event.data?.sessionData) {
          this.sessionCreatedSubject.next(event.data.sessionData);
        }
        break;

      case 'SESSION_CLEARED':
        this.sessionClearedSubject.next();
        break;

      case 'TOKEN_REFRESHED':
        if (event.data?.sessionData) {
          this.tokenRefreshedSubject.next(event.data.sessionData);
        }
        break;

      case 'TOKEN_EXPIRED':
        this.tokenExpiredSubject.next();
        break;

      case 'SYNC_REQUEST':
        // Another tab is requesting sync (future use)
        logger.debug('Sync request received from another tab');
        break;

      default:
        logger.warn('Unknown sync event type', { type: event.type });
    }
  }

  /**
   * Broadcast an event to all other tabs
   */
  public broadcast(event: SessionSyncEvent): void {
    if (typeof window === 'undefined') {
      return;
    }

    // Add source tab ID
    const enrichedEvent = { ...event, source: TAB_ID };

    logger.debug('Broadcasting sync event', { type: event.type });

    // Try BroadcastChannel first (preferred)
    if (this.useBroadcastChannel && this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(enrichedEvent);
        logger.debug('Event sent via BroadcastChannel');
      } catch (error) {
        logger.warn('Failed to send via BroadcastChannel', error);
      }
    }

    // Try storage events as fallback
    if (this.useStorageEvents) {
      try {
        const json = JSON.stringify(enrichedEvent);
        // Use localStorage to trigger storage events in other tabs
        // (sessionStorage won't trigger events from other tabs)
        window.localStorage.setItem(CHANNEL_NAME, json);
        logger.debug('Event sent via storage event');
      } catch (error) {
        logger.warn('Failed to send via storage event', error);
      }
    }
  }

  /**
   * Observable: When session is cleared in another tab
   */
  get onSessionCleared(): Observable<void> {
    return this.sessionClearedSubject.asObservable();
  }

  /**
   * Observable: When token is refreshed in another tab
   */
  get onTokenRefreshed(): Observable<SessionData> {
    return this.tokenRefreshedSubject.asObservable();
  }

  /**
   * Observable: When token expires in another tab
   */
  get onTokenExpired(): Observable<void> {
    return this.tokenExpiredSubject.asObservable();
  }

  /**
   * Observable: When session is created in another tab
   */
  get onSessionCreated(): Observable<SessionData> {
    return this.sessionCreatedSubject.asObservable();
  }

  /**
   * Send SESSION_CREATED event
   */
  public notifySessionCreated(session: SessionData): void {
    this.broadcast({
      type: 'SESSION_CREATED',
      timestamp: new Date(),
      data: { sessionData: session }
    });
  }

  /**
   * Send SESSION_CLEARED event
   */
  public notifySessionCleared(reason?: string): void {
    this.broadcast({
      type: 'SESSION_CLEARED',
      timestamp: new Date(),
      data: { reason }
    });
  }

  /**
   * Send TOKEN_REFRESHED event
   */
  public notifyTokenRefreshed(session: SessionData): void {
    this.broadcast({
      type: 'TOKEN_REFRESHED',
      timestamp: new Date(),
      data: { sessionData: session }
    });
  }

  /**
   * Send TOKEN_EXPIRED event
   */
  public notifyTokenExpired(): void {
    this.broadcast({
      type: 'TOKEN_EXPIRED',
      timestamp: new Date()
    });
  }

  /**
   * Request sync from other tabs (for future use)
   */
  public requestSync(): void {
    this.broadcast({
      type: 'SYNC_REQUEST',
      timestamp: new Date()
    });
  }

  /**
   * Get current tab ID (for debugging)
   */
  public getTabId(): string {
    return TAB_ID;
  }

  /**
   * Check if sync is active
   */
  public isSyncActive(): boolean {
    return this.useBroadcastChannel || this.useStorageEvents;
  }

  /**
   * Clean up resources
   */
  ngOnDestroy(): void {
    this.destroy();
  }

  public destroy(): void {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
        logger.debug('BroadcastChannel closed');
      } catch (error) {
        logger.warn('Error closing BroadcastChannel', error);
      }
    }

    this.sessionClearedSubject.complete();
    this.tokenRefreshedSubject.complete();
    this.tokenExpiredSubject.complete();
    this.sessionCreatedSubject.complete();

    logger.info('Session sync service destroyed');
  }
}
