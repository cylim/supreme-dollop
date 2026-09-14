import { appendFileSync } from 'node:fs'

const cloudUrl = process.env.VITE_CONVEX_URL
const environmentFile = process.env.GITHUB_ENV
if (!cloudUrl || !environmentFile) {
  throw new Error('VITE_CONVEX_URL and GITHUB_ENV are required.')
}
const siteUrl = cloudUrl.replace(/\.convex\.cloud$/u, '.convex.site')
if (siteUrl === cloudUrl) throw new Error('Unexpected Convex preview URL.')
const deploymentName = new URL(cloudUrl).hostname.split('.')[0]

appendFileSync(
  environmentFile,
  [
    `E2E_BASE_URL=${siteUrl}`,
    `CONVEX_PREVIEW_NAME=${deploymentName}`,
    `E2E_PUBLIC_SCHEDULE_URL=${siteUrl}/s/release-schedule`,
    `E2E_PUBLIC_DECISION_URL=${siteUrl}/d/release-decision`,
    '',
  ].join('\n'),
)
