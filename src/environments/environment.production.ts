export const environment = {
  production: true,
  apiBaseUrl: 'https://sabr-api-dev.fly.dev/api/v1',
  devTenant: '',
  authDebugConsole: false,
  dataCache: {
    listTtlMs: 30_000
  },
  observability: {
    enabled: true,
    sentryDsn: '',
    release: '',
    tracesSampleRate: 0.1,
    webVitalsEnabled: true,
    consoleMetrics: false
  },
  ui: {
    publicationsEnabled: false,
    mlLegacyPublishBlock: false,
    redesignShellV1: false,
    redesignClientDashboardV1: false,
    redesignAdminDashboardV1: false,
    redesignLoginV1: false,
    redesignOnboardingV1: false,
    darkModeV1: false
  }
};
