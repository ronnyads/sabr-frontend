# Runbook: Frontend Rollback (S3 + CloudFront)

## Objective
Restore last stable frontend release quickly if a bad deploy reaches users.

## Steps
1. Identify last stable artifact in S3 bucket version history.
2. Restore previous object versions (or re-sync prior build artifact).
3. Invalidate CloudFront cache (`/*`).
4. Validate home/login and one critical flow.

## CLI example
```bash
aws s3 sync ./dist/sabr-client s3://<client-bucket> --delete
aws s3 sync ./dist/sabr-admin s3://<admin-bucket> --delete
aws cloudfront create-invalidation --distribution-id <client-dist-id> --paths '/*'
aws cloudfront create-invalidation --distribution-id <admin-dist-id> --paths '/*'
```

## Exit criteria
- No critical UI errors in browser console.
- API calls return expected domain (`api-dev` or `api`).
- Stakeholder confirms operational recovery.
