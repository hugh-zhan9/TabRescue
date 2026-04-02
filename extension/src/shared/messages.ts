import {
  Snapshot,
  SnapshotDetail,
  CurrentSession,
  Settings,
  RecoveryResult,
} from '../types';

// ============ Popup → Background 请求 ============

export interface GetSnapshotsRequest {
  action: 'getSnapshots';
  limit?: number;
}

export interface GetSnapshotDetailRequest {
  action: 'getSnapshotDetail';
  id: string;
}

export interface CreateSnapshotRequest {
  action: 'createSnapshot';
}

export interface RestoreSnapshotRequest {
  action: 'restoreSnapshot';
  snapshotId: string;
  options?: { force?: boolean };
}

export interface GetSettingsRequest {
  action: 'getSettings';
}

export interface SaveSettingsRequest {
  action: 'saveSettings';
  settings: Settings;
}

export interface GetCurrentSessionRequest {
  action: 'getCurrentSession';
}

export interface SyncCurrentSessionRequest {
  action: 'syncCurrentSession';
}

export interface GetRecoveryProgressRequest {
  action: 'getRecoveryProgress';
}

export interface GetPopupStateRequest {
  action: 'getPopupState';
  limit?: number;
}

export type BackgroundRequest =
  | GetSnapshotsRequest
  | GetSnapshotDetailRequest
  | CreateSnapshotRequest
  | RestoreSnapshotRequest
  | GetSettingsRequest
  | SaveSettingsRequest
  | GetCurrentSessionRequest
  | SyncCurrentSessionRequest
  | GetRecoveryProgressRequest
  | GetPopupStateRequest;

// ============ Background → Popup 响应 ============

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: string;
}

export type BackgroundResponse<T = unknown> =
  | SuccessResponse<T>
  | ErrorResponse;

// ============ 便捷类型别名（按 action）============

export type GetSnapshotsResponse = BackgroundResponse<Snapshot[]>;
export type GetSnapshotDetailResponse = BackgroundResponse<SnapshotDetail | null>;
export type CreateSnapshotResponse = BackgroundResponse<Snapshot>;
export type RestoreSnapshotResponse = BackgroundResponse<RecoveryResult>;
export type GetSettingsResponse = BackgroundResponse<Settings>;
export type SaveSettingsResponse = { success: true } | ErrorResponse;
export type GetCurrentSessionResponse = BackgroundResponse<CurrentSession | null>;
export type GetRecoveryProgressResponse = BackgroundResponse<{
  isRestoring: boolean;
  lastRestoredSnapshotId: string | null;
  lastRestoredAt: number | null;
}>;
export type GetPopupStateResponse = BackgroundResponse<{
  snapshots: Snapshot[];
  settings: Settings;
}>;
