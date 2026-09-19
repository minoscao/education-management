export function shouldMigrateRemote(env = process.env) {
  if (env.APPLY_REMOTE_MIGRATIONS === '0') return false;
  if (env.APPLY_REMOTE_MIGRATIONS === '1') return true;
  return env.WORKERS_CI === '1' && env.WORKERS_CI_BRANCH === (env.CLOUDFLARE_PRODUCTION_BRANCH || 'main');
}
