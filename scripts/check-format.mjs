import { execFileSync, spawnSync } from 'node:child_process'

const base = process.env.FORMAT_BASE ?? 'origin/main'
let changedOutput
try {
  changedOutput = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', base],
    { encoding: 'utf8' },
  )
} catch {
  changedOutput = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'],
    { encoding: 'utf8' },
  )
}
const changed = changedOutput.split('\n').filter(Boolean)
const untracked = execFileSync(
  'git',
  ['ls-files', '--others', '--exclude-standard'],
  { encoding: 'utf8' },
)
  .split('\n')
  .filter(Boolean)
const supported = /\.(?:css|html|js|json|jsx|md|mjs|ts|tsx|ya?ml)$/u
const paths = [...new Set([...changed, ...untracked])].filter((path) =>
  supported.test(path),
)

if (paths.length === 0) {
  console.log('No changed files require a format check.')
  process.exit(0)
}

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(command, ['prettier', '--check', ...paths], {
  stdio: 'inherit',
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
