// Keep in sync with src/Sabr.Domain/Enums/*.cs
export const ClientStatus = {
  PendingProfile: 0,
  PendingAdminApproval: 1,
  PendingDocuments: 2,
  UnderReview: 3,
  Approved: 4,
  Rejected: 5,
  Inactive: 6
} as const;

export type ClientStatusValue = (typeof ClientStatus)[keyof typeof ClientStatus];
