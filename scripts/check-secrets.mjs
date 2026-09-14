import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const paths = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean)
  .filter((path) => !path.endsWith('package-lock.json'))

const signatures = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:CONVEX_DEPLOY_KEY|GOOGLE_CLIENT_SECRET|AGENTMAIL_API_KEY)\s*=\s*[^\s$<{][^\s]*/,
  /(?:ghp|github_pat)_[A-Za-z0-9_]{20,}/,
]

const findings = []
for (const path of paths) {
  let contents
  try {
    contents = readFileSync(path, 'utf8')
  } catch {
    continue
  }
  if (signatures.some((signature) => signature.test(contents)))
    findings.push(path)
}

if (findings.length > 0) {
  console.error(`Potential secret material found in:\n${findings.join('\n')}`)
  process.exit(1)
}

console.log(`Secret scan passed (${paths.length} files checked).`)
