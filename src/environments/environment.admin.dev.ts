export const environment = {
  production: false,
  apiBaseUrl: '__API_BASE_URL__',
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
    redesignShellV1: true,
    redesignClientDashboardV1: true,
    redesignAdminDashboardV1: true,
    redesignLoginV1: true,
    redesignOnboardingV1: true,
    darkModeV1: true
  }
};
