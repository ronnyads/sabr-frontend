/**
 * Storage Capability Detector
 * Detects availability of storage APIs, private mode, and quota limits
 */

import { StorageCapability } from '../models/session.model';
import { createLogger } from './logger';

const logger = createLogger('StorageDetector');

/**
 * Test if a storage API is available and writable
 */
function testStorageApi(storage: Storage | undefined): boolean {
  if (!storage) {
    return false;
  }

  try {
    const testKey = `__storage_test_${Date.now()}_${Math.random()}`;
    const testValue = '1';

    // Try to write
    storage.setItem(testKey, testValue);

    // Try to read
    const retrieved = storage.getItem(testKey);

    // Try to remove
    storage.removeItem(testKey);

    // Verify removal
    const afterRemoval = storage.getItem(testKey);

    return retrieved === testValue && afterRemoval === null;
  } catch (error) {
    return false;
  }
}

/**
 * Detect if QuotaExceededError occurred
 */
function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.message.includes('quota')
  );
}

/**
 * Detect if we're in private/incognito mode
 * Uses multiple heuristics for reliability
 */
function detectPrivateMode(): boolean {
  // Heuristic 1: Try writing to sessionStorage
  try {
    const testKey = `__private_mode_test_${Date.now()}`;
    window.sessionStorage.setItem(testKey, '1');
    window.sessionStorage.removeItem(testKey);
    // If we got here, sessionStorage works
  } catch (e) {
    // sessionStorage failed - likely private mode
    if (isQuotaExceededError(e)) {
      logger.debug('Private mode detected via QuotaExceededError on sessionStorage');
      return true;
    }
  }

  // Heuristic 2: Try writing to localStorage
  try {
    const testKey = `__private_mode_test_${Date.now()}`;
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    // If we got here, localStorage works
  } catch (e) {
    // localStorage failed - likely private mode
    if (isQuotaExceededError(e)) {
      logger.debug('Private mode detected via QuotaExceededError on localStorage');
      return true;
    }
  }

  // Heuristic 3: Check if IndexedDB is available (not always in private mode)
  try {
    if (!window.indexedDB) {
      logger.debug('Private mode detected: IndexedDB unavailable');
      return true;
    }
  } catch (e) {
    logger.debug('Private mode detected: IndexedDB check failed');
    return true;
  }

  return false;
}

/**
 * Estimate available storage quota
 * Uses different approaches depending on browser capabilities
 */
async function estimateStorageQuota(): Promise<number> {
  try {
    // Modern Storage API
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      return estimate.available || estimate.quota || 5 * 1024 * 1024; // Fallback: 5MB
    }
  } catch (error) {
    logger.debug('Failed to estimate quota via Storage API', error);
  }

  // Fallback: Common browser quotas
  // Safari: 5MB, Chrome/Firefox: 10MB+, IE: 10MB
  // We'll use a conservative estimate
  return 5 * 1024 * 1024; // 5MB
}

/**
 * Main function to detect all storage capabilities
 */
export async function detectStorageCapability(): Promise<StorageCapability> {
  const capability: StorageCapability = {
    sessionStorageAvailable: false,
    localStorageAvailable: false,
    privateMode: false,
    quotaExceeded: false,
    estimatedQuota: 0
  };

  // Guard against SSR
  if (typeof window === 'undefined') {
    logger.debug('Not running in browser environment');
    return capability;
  }

  try {
    // Test sessionStorage
    try {
      capability.sessionStorageAvailable = testStorageApi(window.sessionStorage);
      logger.debug('sessionStorage available:', capability.sessionStorageAvailable);
    } catch (error) {
      logger.debug('sessionStorage test failed:', error);
    }

    // Test localStorage
    try {
      capability.localStorageAvailable = testStorageApi(window.localStorage);
      logger.debug('localStorage available:', capability.localStorageAvailable);
    } catch (error) {
      logger.debug('localStorage test failed:', error);
    }

    // Detect private mode
    capability.privateMode = detectPrivateMode();
    logger.debug('Private mode detected:', capability.privateMode);

    // If both storages failed, likely private mode or quota exceeded
    if (!capability.sessionStorageAvailable && !capability.localStorageAvailable) {
      capability.privateMode = true;
      logger.warn('Both storage APIs failed - assuming private mode or quota exceeded');
    }

    // Estimate quota
    capability.estimatedQuota = await estimateStorageQuota();
    logger.debug('Estimated quota:', capability.estimatedQuota, 'bytes');
  } catch (error) {
    logger.error('Unexpected error during storage capability detection', error);
  }

  return capability;
}

/**
 * Try to write a specific amount of data and detect quota exceeded
 */
export async function testStorageQuota(bytes: number): Promise<{
  canStore: boolean;
  error?: string;
}> {
  const testData = new Array(bytes).fill('x').join('');

  try {
    const testKey = `__quota_test_${Date.now()}`;

    // Try sessionStorage first
    try {
      window.sessionStorage.setItem(testKey, testData);
      window.sessionStorage.removeItem(testKey);
      return { canStore: true };
    } catch (e) {
      if (isQuotaExceededError(e)) {
        return {
          canStore: false,
          error: 'sessionStorage quota exceeded'
        };
      }
    }

    // Try localStorage
    try {
      window.localStorage.setItem(testKey, testData);
      window.localStorage.removeItem(testKey);
      return { canStore: true };
    } catch (e) {
      if (isQuotaExceededError(e)) {
        return {
          canStore: false,
          error: 'localStorage quota exceeded'
        };
      }
    }

    return {
      canStore: false,
      error: 'both storage APIs unavailable'
    };
  } catch (error) {
    return {
      canStore: false,
      error: String(error)
    };
  }
}

/**
 * Get the best available storage API
 * Returns the most reliable storage available in order: sessionStorage > localStorage > memory
 */
export async function getBestAvailableStorage(): Promise<'sessionStorage' | 'localStorage' | 'memory'> {
  const capability = await detectStorageCapability();

  if (capability.sessionStorageAvailable) {
    return 'sessionStorage';
  }

  if (capability.localStorageAvailable) {
    return 'localStorage';
  }

  return 'memory';
}
