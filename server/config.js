export function loadConfig(env = process.env) {
  const prod = (env.NODE_ENV || 'development') === 'production';
  const provider = (env.MUSIC_PROVIDER || (env.ACESTEP_API_URL ? 'acestep' : 'none')).toLowerCase();
  return {
    port: +env.PORT || 3000, production: prod,
    accessToken: env.STUDIO_ACCESS_TOKEN || '',
    musicProvider: provider === 'mock' && prod && env.ALLOW_MOCK !== '1' ? 'none' : provider,
    acestep: { url: (env.ACESTEP_API_URL || '').replace(/\/+$/, ''), key: env.ACESTEP_API_KEY || '', format: env.ACESTEP_AUDIO_FORMAT || 'mp3', timeoutMs: +env.ACESTEP_HTTP_TIMEOUT_MS || 20000 },
    jobTimeoutMs: +env.JOB_TIMEOUT_MS || 600000, pollMs: +env.JOB_POLL_MS || 2000, jobTtlMs: +env.JOB_TTL_MS || 3600000,
    generatePerHour: +env.GENERATE_PER_HOUR || 10, maxDurationSec: +env.MAX_DURATION_SEC || 240,
  };
}
