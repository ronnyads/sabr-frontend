import { ClientStatus } from './client-status.constants';

export interface ClientOnboardingState {
  mustChangePassword?: boolean | null;
  status?: number | null;
}

export type PostPasswordChangeAction = 'profile' | 'documents' | 'dashboard';

export function needsClientOnboarding(state: ClientOnboardingState | null | undefined): boolean {
  const status = state?.status ?? ClientStatus.PendingProfile;
  return !!state?.mustChangePassword || status === ClientStatus.PendingProfile;
}

export function isPasswordChangeOnly(state: ClientOnboardingState | null | undefined): boolean {
  if (!state?.mustChangePassword) {
    return false;
  }

  const status = state.status ?? ClientStatus.PendingProfile;
  return status !== ClientStatus.PendingProfile && status !== ClientStatus.PendingDocuments;
}

export function postPasswordChangeAction(
  state: ClientOnboardingState | null | undefined
): PostPasswordChangeAction {
  const status = state?.status ?? ClientStatus.PendingProfile;

  if (status === ClientStatus.PendingProfile) {
    return 'profile';
  }

  if (status === ClientStatus.PendingDocuments) {
    return 'documents';
  }

  return 'dashboard';
}
