import { spawnSync } from 'node:child_process'

const gate = process.argv[2]
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function requireEnvironment(names) {
  const missing = names.filter((name) => !process.env[name])
  if (missing.length > 0) {
    console.error(`${gate} gate requires: ${missing.join(', ')}`)
    process.exit(2)
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function runNpm(script) {
  run(npm, ['run', script])
}

switch (gate) {
  case 'merge':
    runNpm('format:check')
    runNpm('lint')
    runNpm('test:secrets')
    run(npm, ['audit', '--audit-level=high'])
    runNpm('test:coverage')
    runNpm('test:changed-coverage')
    process.env.CONVEX_URL ??= 'https://example.convex.cloud'
    process.env.VITE_CONVEX_URL ??= process.env.CONVEX_URL
    run(npm, ['run', 'build', '--', '--mode', 'test'])
    break
  case 'release':
    requireEnvironment([
      'E2E_BASE_URL',
      'E2E_HOST_EMAIL',
      'E2E_HOST_PASSWORD',
      'E2E_GUEST_EMAIL',
      'E2E_GUEST_PASSWORD',
      'E2E_PUBLIC_SCHEDULE_URL',
      'E2E_PUBLIC_DECISION_URL',
    ])
    runNpm('test:migration')
    runNpm('test:browser')
    runNpm('test:integrations')
    break
  case 'advisory':
    requireEnvironment([
      'E2E_BASE_URL',
      'E2E_HOST_EMAIL',
      'E2E_HOST_PASSWORD',
      'E2E_GUEST_EMAIL',
      'E2E_GUEST_PASSWORD',
      'E2E_PUBLIC_SCHEDULE_URL',
      'E2E_PUBLIC_DECISION_URL',
    ])
    run('npx', [
      'playwright',
      'test',
      'decisions.spec.ts',
      'scheduling.spec.ts',
      'accessibility.spec.ts',
      '--project=firefox-desktop',
      '--project=webkit-desktop',
    ])
    break
  case 'production':
    requireEnvironment([
      'E2E_BASE_URL',
      'E2E_HOST_EMAIL',
      'E2E_HOST_PASSWORD',
      'E2E_PUBLIC_SCHEDULE_URL',
      'E2E_PUBLIC_DECISION_URL',
    ])
    run('npx', [
      'playwright',
      'test',
      'production-readonly.spec.ts',
      '--project=chromium-desktop',
    ])
    break
  case 'migration':
    run('npx', ['vitest', 'run', 'convex/migration.test.ts'])
    break
  default:
    console.error(
      'Usage: node scripts/run-test-gate.mjs <merge|release|advisory|production|migration>',
    )
    process.exit(2)
}
