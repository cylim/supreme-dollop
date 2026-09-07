try {
  process.loadEnvFile('.env.e2e.local')
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

const required = [
  'E2E_BASE_URL',
  'E2E_HOST_EMAIL',
  'E2E_HOST_PASSWORD',
  'E2E_GUEST_EMAIL',
  'E2E_GUEST_PASSWORD',
]
const missing = required.filter((name) => !process.env[name])

if (missing.length > 0) {
  console.error(`Missing E2E configuration: ${missing.join(', ')}`)
  process.exit(1)
}

const identities = [
  process.env.E2E_HOST_EMAIL,
  process.env.E2E_GUEST_EMAIL,
  process.env.E2E_GUEST_TWO_EMAIL ?? 'guest-two@example.test',
].map((identity) => identity.trim().toLowerCase())
if (new Set(identities).size !== identities.length) {
  console.error('All E2E email variables must identify different users.')
  process.exit(1)
}

for (const name of ['E2E_HOST_PASSWORD', 'E2E_GUEST_PASSWORD']) {
  const password = process.env[name]
  if ([...password].length < 10 || [...password].length > 100) {
    console.error(`${name} must contain between 10 and 100 characters.`)
    process.exit(1)
  }
  if (/^\s|\s$/u.test(password)) {
    console.error(`${name} must not start or end with whitespace.`)
    process.exit(1)
  }
}
