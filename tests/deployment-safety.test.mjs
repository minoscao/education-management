import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldMigrateRemote } from '../scripts/cloudflare-build-context.mjs';

test('ordinary builds, credentials and preview branches cannot migrate the remote database', () => {
  assert.equal(shouldMigrateRemote({}), false);
  assert.equal(shouldMigrateRemote({ CI: 'true', CLOUDFLARE_API_TOKEN: 'test' }), false);
  assert.equal(shouldMigrateRemote({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'preview' }), false);
  assert.equal(shouldMigrateRemote({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }), true);
  assert.equal(shouldMigrateRemote({ APPLY_REMOTE_MIGRATIONS: '0', WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }), false);
  assert.equal(shouldMigrateRemote({ APPLY_REMOTE_MIGRATIONS: '1' }), true);
});
