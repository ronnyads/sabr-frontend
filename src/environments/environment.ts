export const environment = {
  production: false,
  apiBaseUrl: 'https://sabr-api-dev.fly.dev/api/v1',
  devTenant: 'sabr',
  authDebugConsole: true,
  dataCache: {
    listTtlMs: 30_000
  },
  observability: {
    enabled: true,
    sentryDsn: '',
    release: '',
    tracesSampleRate: 0.1,
    webVitalsEnabled: true,
    consoleMetrics: true
  },
  ui: {
    publicationsEnabled: true,
    mlLegacyPublishBlock: false,
    redesignShellV1: true,
    redesignClientDashboardV1: true,
    redesignAdminDashboardV1: true,
    redesignLoginV1: true,
    redesignOnboardingV1: true,
    darkModeV1: true
  }
};
