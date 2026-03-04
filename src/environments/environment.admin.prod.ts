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
    publicationsEnabled: false,
    mlLegacyPublishBlock: false
  }
};
