import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'

const base = process.env.COVERAGE_BASE ?? 'origin/main'
const root = process.cwd()
const diff = execFileSync(
  'git',
  ['diff', '--unified=0', base, '--', 'convex', 'shared'],
  { encoding: 'utf8' },
)
const changedLines = new Map()
let currentPath
for (const line of diff.split('\n')) {
  const pathMatch = line.match(/^\+\+\+ (?:b|w)\/(.+)$/u)
  if (pathMatch) {
    currentPath = pathMatch[1]
    continue
  }
  if (!currentPath || !line.startsWith('@@')) continue
  const match = line.match(/\+(\d+)(?:,(\d+))?/u)
  if (!match) continue
  const start = Number(match[1])
  const count = Number(match[2] ?? 1)
  const lines = changedLines.get(currentPath) ?? new Set()
  for (let offset = 0; offset < count; offset += 1) lines.add(start + offset)
  changedLines.set(currentPath, lines)
}

const report = JSON.parse(readFileSync('coverage/coverage-final.json', 'utf8'))
let statements = 0
let coveredStatements = 0
let branches = 0
let coveredBranches = 0
const fileResults = []

for (const file of Object.values(report)) {
  const path = relative(root, resolve(file.path))
  const lines = changedLines.get(path)
  if (!lines) continue
  const result = {
    path,
    statements: 0,
    coveredStatements: 0,
    branches: 0,
    coveredBranches: 0,
  }

  for (const [id, location] of Object.entries(file.statementMap)) {
    if (!lines.has(location.start.line)) continue
    statements += 1
    result.statements += 1
    if (file.s[id] > 0) coveredStatements += 1
    if (file.s[id] > 0) result.coveredStatements += 1
  }
  for (const [id, location] of Object.entries(file.branchMap)) {
    if (!lines.has(location.loc.start.line)) continue
    for (const hits of file.b[id]) {
      branches += 1
      result.branches += 1
      if (hits > 0) coveredBranches += 1
      if (hits > 0) result.coveredBranches += 1
    }
  }
  if (result.statements > 0 || result.branches > 0) fileResults.push(result)
}

function percent(covered, total) {
  return total === 0 ? 100 : (covered / total) * 100
}

const statementPercent = percent(coveredStatements, statements)
const branchPercent = percent(coveredBranches, branches)
console.log(
  `Changed coverage: ${statementPercent.toFixed(2)}% statements (${coveredStatements}/${statements}), ${branchPercent.toFixed(2)}% branches (${coveredBranches}/${branches}).`,
)
for (const result of fileResults
  .filter(
    (item) =>
      percent(item.coveredStatements, item.statements) < 90 ||
      percent(item.coveredBranches, item.branches) < 90,
  )
  .sort(
    (left, right) =>
      percent(left.coveredBranches, left.branches) -
      percent(right.coveredBranches, right.branches),
  )) {
  console.log(
    `  ${result.path}: ${percent(result.coveredStatements, result.statements).toFixed(2)}% statements, ${percent(result.coveredBranches, result.branches).toFixed(2)}% branches`,
  )
}
if (statementPercent < 90 || branchPercent < 90) process.exit(1)
