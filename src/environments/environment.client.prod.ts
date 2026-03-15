export const environment = {
  production: true,
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
    publicationsEnabled: true,
    mlLegacyPublishBlock: false,
    redesignShellV1: false,
    redesignClientDashboardV1: false,
    redesignAdminDashboardV1: false,
    redesignLoginV1: false,
    redesignOnboardingV1: false,
    darkModeV1: false
  }
};
