const deploymentName = process.env.CONVEX_PREVIEW_NAME
const token = process.env.CONVEX_MANAGEMENT_TOKEN
if (!deploymentName) {
  console.log('No release preview was created; cleanup is unnecessary.')
  process.exit(0)
}
if (!token) throw new Error('CONVEX_MANAGEMENT_TOKEN is required for cleanup.')

const response = await fetch(
  `https://api.convex.dev/v1/deployments/${encodeURIComponent(deploymentName)}/delete`,
  {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  },
)
if (!response.ok) {
  throw new Error(`Convex preview cleanup failed with ${response.status}.`)
}
console.log(`Deleted Convex preview ${deploymentName}.`)
