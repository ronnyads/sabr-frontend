import {
  isPasswordChangeOnly,
  needsClientOnboarding,
  postPasswordChangeAction
} from './client-onboarding-flow';
import { ClientStatus } from './client-status.constants';

describe('client onboarding flow', () => {
  it('treats an approved password reset as a password-only flow', () => {
    const state = { mustChangePassword: true, status: ClientStatus.Approved };

    expect(needsClientOnboarding(state)).toBeTrue();
    expect(isPasswordChangeOnly(state)).toBeTrue();
    expect(postPasswordChangeAction(state)).toBe('dashboard');
  });

  it('continues a new registration at the company profile after changing the password', () => {
    const state = { mustChangePassword: true, status: ClientStatus.PendingProfile };

    expect(isPasswordChangeOnly(state)).toBeFalse();
    expect(postPasswordChangeAction(state)).toBe('profile');
  });

  it('returns a client with pending documents directly to document verification', () => {
    const state = { mustChangePassword: true, status: ClientStatus.PendingDocuments };

    expect(isPasswordChangeOnly(state)).toBeFalse();
    expect(postPasswordChangeAction(state)).toBe('documents');
  });

  it('does not force a client with pending documents back into onboarding on later visits', () => {
    const state = { mustChangePassword: false, status: ClientStatus.PendingDocuments };

    expect(needsClientOnboarding(state)).toBeFalse();
  });
});
