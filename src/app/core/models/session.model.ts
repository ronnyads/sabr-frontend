/**
 * Session Data Model
 * Defines all TypeScript interfaces and enums for session management
 */

import { AuthUser, AuthLoginResponse } from '../services/auth.service';

/**
 * Storage layers in priority order (for fallback logic)
 */
export enum StorageLayer {
  MEMORY = 'memory',
  SESSION_STORAGE = 'sessionStorage',
  LOCAL_STORAGE = 'localStorage',
  SUPABASE = 'supabase'
}

/**
 * Session metadata for audit trail and multi-device support
 */
export interface SessionMetadata {
  ipAddress?: string | null;
  userAgent?: string;
  deviceFingerprint?: string;
  createdAt: Date;
  lastActivity: Date;
}

/**
 * Complete session data persisted across storage layers
 */
export interface SessionData {
  accessToken: string;
  refreshToken?: string | null;
  user: AuthUser;
  accountType: 'admin' | 'client';
  expiresAt: string; // ISO 8601 timestamp
  metadata?: SessionMetadata;
}

/**
 * Result of a single storage operation
 */
export interface StorageLayerResult {
  layer: StorageLayer;
  success: boolean;
  error?: string | null;
  timestamp: Date;
  dataSize?: number;
}

/**
 * Result of session validation
 */
export type ValidationReason =
  | 'VALID'
  | 'MISSING_TOKEN'
  | 'MISSING_USER'
  | 'MISSING_EXPIRY'
  | 'EXPIRED'
  | 'EXPIRING_SOON'
  | 'INVALID_FORMAT';

export type SuggestedAction = 'NONE' | 'REFRESH' | 'REFRESH_OR_LOGOUT' | 'LOGOUT';

export interface SessionValidationResult {
  valid: boolean;
  reason: ValidationReason;
  suggestedAction: SuggestedAction;
  details?: {
    timeToExpiryMs?: number;
    timeToExpiryHumanReadable?: string;
  };
}

/**
 * Session sync events for BroadcastChannel communication
 */
export type SessionSyncEventType =
  | 'SESSION_CREATED'
  | 'SESSION_CLEARED'
  | 'TOKEN_REFRESHED'
  | 'TOKEN_EXPIRED'
  | 'SYNC_REQUEST';

export interface SessionSyncEvent {
  type: SessionSyncEventType;
  timestamp: Date;
  data?: {
    sessionData?: SessionData;
    reason?: string;
  };
  source?: string; // Tab ID that sent this event
}

/**
 * Storage capability detection result
 */
export interface StorageCapability {
  sessionStorageAvailable: boolean;
  localStorageAvailable: boolean;
  privateMode: boolean;
  quotaExceeded: boolean;
  estimatedQuota: number; // bytes
}

/**
 * Session manager configuration
 */
export interface SessionManagerConfig {
  tokenRefreshBufferMs?: number; // Default: 5 min before expiry
  refreshTimeoutMs?: number; // Default: 30s
  storageCheckIntervalMs?: number; // Default: 60s
  logLevel?: 'debug' | 'info' | 'warn' | 'error'; // Default: 'info'
  enableSupabase?: boolean; // Default: true
}
