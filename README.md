# SabrFrontend

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.1.4.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

### Production build targets

```bash
npm run build:client
npm run build:admin
```

### Deploy build targets (AWS dev/prod)

```bash
npm run build:client:dev:deploy
npm run build:admin:dev:deploy
npm run build:client:prod:deploy
npm run build:admin:prod:deploy
```

These targets use dedicated environment files with `apiBaseUrl` placeholder (`__API_BASE_URL__`) replaced by CI before build.

## AWS deployment

This repository now includes `.github/workflows/frontend-deploy.yml` to publish static files to S3 + CloudFront.

Required GitHub variables:
- `AWS_REGION` (default `sa-east-1` if omitted)
- `S3_BUCKET_CLIENT_DEV`
- `S3_BUCKET_ADMIN_DEV`
- `S3_BUCKET_CLIENT_PROD`
- `S3_BUCKET_ADMIN_PROD`
- `CF_DIST_CLIENT_DEV`
- `CF_DIST_ADMIN_DEV`
- `CF_DIST_CLIENT_PROD`
- `CF_DIST_ADMIN_PROD`
- `API_BASE_URL_DEV`
- `API_BASE_URL_PROD`

Required GitHub secrets:
- `AWS_ROLE_ARN_DEV`
- `AWS_ROLE_ARN_PROD`

## Observability (Sentry + Web Vitals)

Runtime flags are configured in:

- `src/environments/environment.ts`
- `src/environments/environment.production.ts`

Available keys:

- `observability.enabled`
- `observability.sentryDsn`
- `observability.release`
- `observability.tracesSampleRate`
- `observability.webVitalsEnabled`
- `observability.consoleMetrics`

When `observability.sentryDsn` is set, frontend errors and navigation breadcrumbs are sent to Sentry. Web vitals (`LCP`, `INP`, `CLS`) are emitted as `web-vital` events.

## Cache and PWA policy

- PWA/service worker is explicitly disabled in `angular.json` (`serviceWorker: false`).
- List cache TTL defaults to `30s` via `environment.dataCache.listTtlMs`.

## Phase 1 rollout notes

Detailed baseline, canary checklist and acceptance gates:

- `docs/phase1-performance-stabilization.md`

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
