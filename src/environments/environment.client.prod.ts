const runtimeApiBase =
  (typeof window !== 'undefined' && (window as any).__API_BASE_URL__) || undefined;
const resolvedApiBase =
  runtimeApiBase && !`${runtimeApiBase}`.includes('__API_BASE_URL__')
    ? runtimeApiBase
    : 'https://api.marketplaceonline.site/api/v1';

export const environment = {
  production: true,
  apiBaseUrl: resolvedApiBase,
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
    redesignShellV1: true,
    redesignClientDashboardV1: true,
    redesignAdminDashboardV1: true,
    redesignLoginV1: true,
    redesignOnboardingV1: true,
    darkModeV1: true
  }
};
