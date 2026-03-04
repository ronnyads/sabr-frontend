export const environment = {
  production: false,
  apiBaseUrl: '',
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
    mlLegacyPublishBlock: false
  }
};
