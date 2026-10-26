export const meta = {
  name: 'build-round',
  description: 'Parallel slices on disjoint paths: optional domain verdict, build, adversarial review, up to two revise passes; then one integrator merges, wires shared files, runs every suite and the regression gate, and pushes a branch (never main)',
  phases: [{ title: 'Verdict' }, { title: 'Build' }, { title: 'Review' }, { title: 'Integrate' }],
}
// args: { scratch, repo, base (e.g. 'origin/main'), kit (one paragraph: read the toolkit + contract, forbidden actions, golden rules),
//         slices: [{ id, eng (builder agent type), rev (reviewer agent type), what (rulings), verdict (optional question for a domain
//                    expert to answer BEFORE code), verdictAgent (optional agent type) }],
//         suites (the integrator's full suite list, run one at a time), gate (the regression gate command + how it must read), port0 }
const A = args, ROOT = A.repo
const str = { type: 'string' }, bool = { type: 'boolean' }
const arr = (i) => ({ type: 'array', items: i })
const obj = (p, r) => ({ type: 'object', properties: p, required: r || Object.keys(p) })
const REPORT = obj({ status: str, branch: str, head: str, files_changed: arr(str), root_causes: str, evidence: str, watched_fail: str, handoffs: str, all_green: bool }, ['status', 'evidence', 'all_green'])
const VERD = obj({ approve: bool, issues: arr(obj({ problem: str, fix: str })), summary: str }, ['approve', 'issues', 'summary'])
const LAND = obj({ status: { type: 'string', enum: ['landed', 'partial', 'blocked'] }, landed: arr(str), integrated_head: str, suites: str, gate_passed: bool, notes: str }, ['status', 'landed', 'suites', 'notes'])

async function slice(s, i) {
  const branch = `round/${s.id.toLowerCase()}`, wt = `${ROOT}/.claude/worktrees/${s.id.toLowerCase()}`
  const base = `${A.kit}\nSLICE ${s.id}: ${s.what}. Worktree ${wt}, branch ${branch} (if missing: git -C ${ROOT} fetch; git -C ${ROOT} worktree add ${wt} -b ${branch} ${A.base}). Test port ${(A.port0 || 8300) + i}. Edit ONLY your owned paths; list exact wiring for shared files in handoffs. `
  const verdict = s.verdict ? await agent(`${base}ROLE: domain expert. Answer BEFORE any code, with sources: ${s.verdict}`, { label: `${s.id} verdict`, phase: 'Verdict', agentType: s.verdictAgent, effort: 'high' }) : null
  let w = await agent(`${base}${verdict ? `BINDING VERDICT: ${verdict}\n` : ''}Implement. Root cause with evidence before each fix; every behaviour gets a test that fails without it (name the one you watched fail). Commit (conventional) and push the branch. Return REPORT.`, { label: `${s.id} build`, phase: 'Build', agentType: s.eng, schema: REPORT, effort: 'high' })
  const rv = (x) => agent(`${base}ROLE: reviewer for ${s.id}. Audit git diff ${A.base}...origin/${branch} against the contract: each ruling holds, owned paths respected, nothing invented or silently changed, refusals named, tests real (plant at least two regressions and watch them fail). approve=false only for material issues.\nREPORT: ${JSON.stringify(w)}${x || ''}`, { label: `${s.id} review`, phase: 'Review', agentType: s.rev, schema: VERD, effort: 'high' })
  let v = await rv()
  for (let k = 0; k < 2 && v && !v.approve && v.issues.length; k++) {
    w = await agent(`${base}REVISE: fix exactly ${JSON.stringify(v.issues)}; rerun affected tests; commit + push. Return REPORT.`, { label: `${s.id} revise ${k + 1}`, phase: 'Build', agentType: s.eng, schema: REPORT, effort: 'high' }) || w
    v = await rv(`\nRE-REVIEW PASS ${k + 2}, only on: ${JSON.stringify(v.issues)}`)
  }
  return { id: s.id, branch, w, v, ok: !!(v && v.approve) }
}

const built = await parallel(A.slices.map((s, i) => () => slice(s, i)))
const ok = built.filter(Boolean).filter((b) => b.ok)
log(`approved: ${ok.map((b) => b.id).join(', ') || 'none'}; not approved: ${built.filter(Boolean).filter((b) => !b.ok).map((b) => b.id).join(', ') || 'none'}`)
phase('Integrate')
const land = ok.length ? await agent(`${A.kit}\nROLE: integrator. Worktree ${ROOT}/.claude/worktrees/round-int on a new branch round/int from ${A.base}. Merge with merge commits, one at a time: ${ok.map((b) => 'origin/' + b.branch).join(', ')}. Wire shared files per handoffs: ${JSON.stringify(built.filter(Boolean).map((b) => ({ id: b.id, ok: b.ok, handoffs: b.w && b.w.handoffs })))}; prove each wired check by reverting it once. Then ONE AT A TIME: ${A.suites}. Then the regression gate: ${A.gate}. Fix integration breaks with a test, or report blocked. Push round/int (never main; the orchestrator opens the PR). Return LAND.`, { label: 'integrate', phase: 'Integrate', schema: LAND, effort: 'high' }) : null
return { built, land }
