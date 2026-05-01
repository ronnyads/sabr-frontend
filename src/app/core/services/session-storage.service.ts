/**
 * Session Storage Service
 * Manages multi-layer persistence with intelligent fallback
 * Order: Memory → sessionStorage → localStorage → Supabase
 */

import { Injectable } from '@angular/core';
import { SessionData, SessionMetadata, StorageLayer, StorageLayerResult, StorageCapability } from '../models/session.model';
import { createLogger } from '../utils/logger';
import { detectStorageCapability, testStorageQuota } from '../utils/storage-detector';

const logger = createLogger('SessionStorage');

const STORAGE_KEY = 'sabr.session.v1';

/**
 * In-memory session storage (lost on page reload, but fastest)
 */
class MemoryStore {
  private data: SessionData | null = null;

  set(session: SessionData): void {
    this.data = session;
  }

  get(): SessionData | null {
    return this.data;
  }

  clear(): void {
    this.data = null;
  }

  isEmpty(): boolean {
    return !this.data;
  }
}

@Injectable({ providedIn: 'root' })
export class SessionStorageService {
  private memoryStore = new MemoryStore();
  private storageCapability: StorageCapability | null = null;
  private initialized = false;

  constructor() {
    this.initializeCapability();
  }

  /**
   * Initialize storage capability detection
   */
  private async initializeCapability(): Promise<void> {
    try {
      this.storageCapability = await detectStorageCapability();
      this.initialized = true;
      logger.info('Storage capability detection completed', this.storageCapability);
    } catch (error) {
      logger.error('Failed to initialize storage capability detection', error);
      this.initialized = true;
      this.storageCapability = {
        sessionStorageAvailable: false,
        localStorageAvailable: false,
        privateMode: true,
        quotaExceeded: false,
        estimatedQuota: 0
      };
    }
  }

  /**
   * Get current storage capability
   */
  getStorageCapability(): StorageCapability {
    return this.storageCapability || {
      sessionStorageAvailable: false,
      localStorageAvailable: false,
      privateMode: true,
      quotaExceeded: false,
      estimatedQuota: 0
    };
  }

  /**
   * Save session to all available layers
   * Returns results for each layer attempted
   */
  async save(session: SessionData): Promise<StorageLayerResult[]> {
    const results: StorageLayerResult[] = [];

    if (typeof window === 'undefined') {
      logger.debug('Not in browser environment, skipping storage');
      return results;
    }

    // 1. Save to memory (always works, fastest)
    try {
      this.memoryStore.set(session);
      results.push({
        layer: StorageLayer.MEMORY,
        success: true,
        timestamp: new Date(),
        dataSize: this.estimateSessionSize(session)
      });
      logger.debug('Saved to memory storage');
    } catch (error) {
      logger.error('Failed to save to memory storage', error);
      results.push({
        layer: StorageLayer.MEMORY,
        success: false,
        error: String(error),
        timestamp: new Date()
      });
    }

    // 2. Save to sessionStorage
    if (this.storageCapability?.sessionStorageAvailable) {
      try {
        const json = JSON.stringify(session);
        window.sessionStorage.setItem(STORAGE_KEY, json);

        // Verify write succeeded
        const stored = window.sessionStorage.getItem(STORAGE_KEY);
        if (stored) {
          results.push({
            layer: StorageLayer.SESSION_STORAGE,
            success: true,
            timestamp: new Date(),
            dataSize: json.length
          });
          logger.debug('Saved to sessionStorage', { size: json.length });
        } else {
          throw new Error('setItem succeeded but getItem returned null');
        }
      } catch (error) {
        const fallback = this.handleStorageError(error, StorageLayer.SESSION_STORAGE);
        results.push(fallback);
      }
    } else {
      logger.debug('sessionStorage not available, skipping');
    }

    // 3. Save to localStorage
    if (this.storageCapability?.localStorageAvailable) {
      try {
        const json = JSON.stringify(session);
        window.localStorage.setItem(STORAGE_KEY, json);

        // Verify write succeeded
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          results.push({
            layer: StorageLayer.LOCAL_STORAGE,
            success: true,
            timestamp: new Date(),
            dataSize: json.length
          });
          logger.debug('Saved to localStorage', { size: json.length });
        } else {
          throw new Error('setItem succeeded but getItem returned null');
        }
      } catch (error) {
        const fallback = this.handleStorageError(error, StorageLayer.LOCAL_STORAGE);
        results.push(fallback);
      }
    } else {
      logger.debug('localStorage not available, skipping');
    }

    // 4. Save to Supabase (optional, as final fallback)
    // This would be implemented in a separate step
    // For now, just log that it's skipped
    logger.debug('Supabase persistence deferred to Phase 2');

    return results;
  }

  /**
   * Restore session from storage layers (reverse priority)
   * Tries in order: localStorage → sessionStorage → Memory
   * Returns first successful match with layer info
   */
  async restore(): Promise<{
    data: SessionData | null;
    layer: StorageLayer | null;
  }> {
    if (typeof window === 'undefined') {
      logger.debug('Not in browser environment, no session to restore');
      return { data: null, layer: null };
    }

    // 1. Try localStorage (most persistent)
    if (this.storageCapability?.localStorageAvailable) {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const session = JSON.parse(stored) as SessionData;
          logger.info('Restored session from localStorage');
          return { data: session, layer: StorageLayer.LOCAL_STORAGE };
        }
      } catch (error) {
        logger.warn('Failed to restore from localStorage', error);
      }
    }

    // 2. Try sessionStorage
    if (this.storageCapability?.sessionStorageAvailable) {
      try {
        const stored = window.sessionStorage.getItem(STORAGE_KEY);
        if (stored) {
          const session = JSON.parse(stored) as SessionData;
          logger.info('Restored session from sessionStorage');
          return { data: session, layer: StorageLayer.SESSION_STORAGE };
        }
      } catch (error) {
        logger.warn('Failed to restore from sessionStorage', error);
      }
    }

    // 3. Try memory
    const memorySession = this.memoryStore.get();
    if (memorySession) {
      logger.info('Restored session from memory storage');
      return { data: memorySession, layer: StorageLayer.MEMORY };
    }

    logger.info('No session found in any storage layer');
    return { data: null, layer: null };
  }

  /**
   * Clear session from all layers
   */
  async clear(): Promise<void> {
    if (typeof window === 'undefined') {
      logger.debug('Not in browser environment, skipping clear');
      return;
    }

    try {
      // Clear memory
      this.memoryStore.clear();
      logger.debug('Cleared memory storage');

      // Clear sessionStorage
      if (this.storageCapability?.sessionStorageAvailable) {
        window.sessionStorage.removeItem(STORAGE_KEY);
        logger.debug('Cleared sessionStorage');
      }

      // Clear localStorage
      if (this.storageCapability?.localStorageAvailable) {
        window.localStorage.removeItem(STORAGE_KEY);
        logger.debug('Cleared localStorage');
      }

      logger.info('Session cleared from all storage layers');
    } catch (error) {
      logger.error('Error clearing session storage', error);
    }
  }

  /**
   * Check if a session exists in any layer
   */
  async hasSession(): Promise<boolean> {
    const restored = await this.restore();
    return restored.data !== null;
  }

  /**
   * Get session from any layer without restoring to memory
   * (read-only check)
   */
  async peekSession(): Promise<SessionData | null> {
    if (typeof window === 'undefined') {
      return null;
    }

    // Try localStorage
    if (this.storageCapability?.localStorageAvailable) {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          return JSON.parse(stored) as SessionData;
        }
      } catch (error) {
        logger.debug('Failed to peek localStorage', error);
      }
    }

    // Try sessionStorage
    if (this.storageCapability?.sessionStorageAvailable) {
      try {
        const stored = window.sessionStorage.getItem(STORAGE_KEY);
        if (stored) {
          return JSON.parse(stored) as SessionData;
        }
      } catch (error) {
        logger.debug('Failed to peek sessionStorage', error);
      }
    }

    // Try memory
    return this.memoryStore.get();
  }

  /**
   * Handle storage errors (quota exceeded, private mode, etc.)
   */
  private handleStorageError(error: unknown, layer: StorageLayer): StorageLayerResult {
    const errorStr = String(error);
    const isQuotaError =
      error instanceof Error &&
      (error.name === 'QuotaExceededError' || errorStr.includes('quota'));

    if (isQuotaError) {
      logger.warn(`Storage quota exceeded for ${layer}`, { error: errorStr });
    } else {
      logger.warn(`Failed to save to ${layer}`, { error: errorStr });
    }

    return {
      layer,
      success: false,
      error: errorStr,
      timestamp: new Date()
    };
  }

  /**
   * Estimate size of session data in bytes
   */
  private estimateSessionSize(session: SessionData): number {
    try {
      return JSON.stringify(session).length;
    } catch (error) {
      logger.warn('Failed to estimate session size', error);
      return 0;
    }
  }

  /**
   * Add metadata to session (IP, user agent, device fingerprint)
   */
  enrichSessionWithMetadata(session: SessionData): SessionData {
    const metadata: SessionMetadata = {
      ...session.metadata,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      createdAt: session.metadata?.createdAt || new Date(),
      lastActivity: new Date()
    };

    return { ...session, metadata };
  }

  /**
   * Clean up old sessions (optional, for maintenance)
   */
  async cleanup(): Promise<void> {
    logger.debug('Running session storage cleanup');
    // Future: Remove expired sessions from all layers
  }
}
