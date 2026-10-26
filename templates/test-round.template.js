export const meta = {
  name: 'test-round',
  description: 'Research in parallel with build, planner makes test cases, code review, deploy, one agent per test case, reviewer loop, fixers, retest, final gate',
  phases: [
    { title: 'Research', detail: 'researchers in parallel with the builders' },
    { title: 'Build', detail: 'executors on disjoint directories' },
    { title: 'Plan', detail: 'planner: verdict + test cases' },
    { title: 'Code review', detail: 'reviewer on the build diffs, one revise round' },
    { title: 'Deploy', detail: 'build, restart, install, confirm ready' },
    { title: 'Tests', detail: 'one agent per case; real environment serial' },
    { title: 'Review', detail: 'reviewer judges every result, sends weak evidence back' },
    { title: 'Fix', detail: 'one fixer per area, reviewed' },
    { title: 'Retest', detail: 'redeploy, rerun failed cases, re-judge' },
    { title: 'Harmony', detail: 'final gate' },
  ],
}

// args (all required except realKind, default 'real'): { scratch, repo, budgetUsd, request (the user's words, verbatim), kit (one paragraph: read TOOLS.md, repo rules, contracts),
//         areas: { <area>: '<owned dirs>' }, research: [{ label, prompt }], builders: [{ label, area, prompt }],
//         deployPrompt, harmonyChecks (suites to run verbatim), realKind (e.g. 'browser', 'device', 'cad'), realRules, testsDir (e.g. 'tests1'),
//         plannerModel (optional: your strongest model for the plan step) }
// No Date.now()/Math.random() in scripts. Edit prompts only between runs, never before a resume.
const A = { realKind: 'real', ...args }, S = A.scratch, BUDGET = A.budgetUsd
const KIT = `Repo: ${A.repo}. Scratch: ${S}.\n${A.kit}`
const AREAS = Object.keys(A.areas)

const str = { type: 'string' }, num = { type: 'number' }, arr = (items) => ({ type: 'array', items })
const obj = (props, req) => ({ type: 'object', properties: props, required: req || Object.keys(props) })
const CASE = obj({ id: str, title: str, kind: { type: 'string', enum: ['mock', 'server', A.realKind] }, area: { type: 'string', enum: AREAS }, steps: str, expect: str, estUsd: num })
const RESULT = obj({ id: str, status: { type: 'string', enum: ['pass', 'fail', 'blocked'] }, observed: str, expected: str, evidence: str, artifacts: arr(str), quality: str, suspectedCause: str, suspectedFiles: arr(str), spentUsd: num })
const WORK = obj({ area: str, rootCause: str, done: arr(str), notDone: arr(str), filesChanged: arr(str), testsRun: arr(obj({ cmd: str, summary: str })), screenshots: arr(str), notes: str })
const PLAN = obj({ verdict: str, cases: arr(CASE), notes: str })
const REVIEW = obj({ verdicts: arr(obj({ id: str, verdict: { type: 'string', enum: ['confirmed_pass', 'confirmed_fail', 'invalid_evidence', 'test_wrong', 'known_limit'] }, owner: { type: 'string', enum: AREAS }, feedback: str })) })
const CODEREVIEW = obj({ byArea: arr(obj({ area: { type: 'string', enum: AREAS }, approve: { type: 'boolean' }, issues: arr(obj({ file: str, problem: str, fix: str })) })) })
const DEPLOY = obj({ ok: { type: 'boolean' }, details: str, usdSoFar: num })
const HARMONY = obj({ verdict: { type: 'string', enum: ['ready', 'not_ready'] }, suites: arr(obj({ cmd: str, result: str })), itemStatus: arr(obj({ item: str, result: str, ring: str, evidence: str })), fixedInHarmony: arr(str), openItems: arr(str), commitMessage: str, excludeFromCommit: arr(str), summaryForUser: str })

// ---------- Research ∥ Build ----------
phase('Research')
const researchP = parallel(A.research.map(r => () => agent(`${KIT}\n${r.prompt}`, { phase: 'Research', effort: 'high', label: `research: ${r.label}` })))
phase('Build')
const buildP = parallel(A.builders.map(b => () => agent(`${KIT}\nYou own only: ${A.areas[b.area]}. Other executors own other directories concurrently.\n${b.prompt}\nEvery new behaviour gets a test that fails without the code (say which you checked by reverting). Return WORK.`, { phase: 'Build', schema: WORK, effort: 'high', label: `build: ${b.label}` })))
const research = await researchP

// ---------- Plan ----------
phase('Plan')
const PM = A.plannerModel ? { model: A.plannerModel } : {}
const plan = await agent(`You are the planner for this round. ${KIT}\nThe user's request (verbatim): ${A.request}\nRESEARCH: ${JSON.stringify(research)}\nProduce PLAN: verdict (plain words for the user), cases (concrete, self-contained, one agent each; kind mock|server|${A.realKind}; expect = what a GOOD product does; ${A.realKind} cases ordered cheapest/most important first, total estUsd ≤ ${BUDGET}), notes for testers.`, { ...PM, schema: PLAN, effort: 'high', label: 'planner', phase: 'Plan' })
if (!plan) throw new Error('plan failed')
let work = (await buildP).filter(Boolean)

// ---------- Code review ----------
phase('Code review')
const crPrompt = (extra) => `${KIT}\nYou are the code reviewer. Review the uncommitted diff (git diff + git status) for this round against the contracts. approve=false only for material issues; concrete fixes.\nREPORTS: ${JSON.stringify(work)}${extra || ''}`
let cr = await agent(crPrompt(), { phase: 'Code review', schema: CODEREVIEW, effort: 'high', label: 'code reviewer' })
const needs = (cr ? cr.byArea : []).filter(a => !a.approve && a.issues.length)
if (needs.length) {
  const revised = await parallel(needs.map(a => () => agent(`${KIT}\nYou are the ${a.area} engineer, revise pass. Address every issue in ${A.areas[a.area]} only, rerun the area's tests, return WORK.\nISSUES: ${JSON.stringify(a.issues)}`, { phase: 'Code review', schema: WORK, effort: 'high', label: `revise: ${a.area}` })))
  work = work.concat(revised.filter(Boolean))
  cr = await agent(crPrompt(`\nSECOND PASS: re-check only ${JSON.stringify(needs)} against ${JSON.stringify(revised.filter(Boolean))}.`), { phase: 'Code review', schema: CODEREVIEW, effort: 'high', label: 'code re-review' })
}

// ---------- Deploy ----------
const deploy = (label) => agent(`${KIT}\nYou are the deploy step (${label}); you hold the ${A.realKind} lock.\n${A.deployPrompt}\nReturn DEPLOY.`, { phase: label === 'retest' ? 'Retest' : 'Deploy', schema: DEPLOY, effort: 'medium', label: `deploy (${label})` })
phase('Deploy')
let dep = await deploy('initial')
if (!dep || !dep.ok) log(`deploy not ok: ${dep ? dep.details : 'agent died'}`)

// ---------- Tests ----------
phase('Tests')
const caseById = {}; plan.cases.forEach(c => { caseById[c.id] = c })
const testPrompt = (c, fb) => `${KIT}\nYou are a test agent for exactly ONE case. Do not edit the repo; write only under ${S}/${A.testsDir}/${c.id}/. Notes: ${plan.notes}\nDeploy facts: ${dep ? dep.details : 'unknown'}\nCASE ${JSON.stringify(c)}\n${c.kind === A.realKind ? A.realRules : 'Use your own mock/probe; never touch the real environment.'}\nStatus: pass only if you directly observed the expected behaviour; fail if the product did something else or did it badly; blocked only if your harness could not exercise it. quality: how WELL it did it. spentUsd 0 unless real model money was spent.${fb ? `\nREVIEWER FEEDBACK: ${fb}` : ''}`
const runOne = (c, ph, fb) => agent(testPrompt(c, fb), { phase: ph, schema: RESULT, effort: 'medium', label: `${c.kind}:${c.id}` })
const blocked = (c, why) => ({ id: c.id, status: 'blocked', observed: why, expected: c.expect, evidence: '', artifacts: [], quality: '', suspectedCause: why, suspectedFiles: [], spentUsd: 0 })
let spent = 0
async function runSerial(cases, ph, fb) {
  const out = []
  for (const c of cases) {
    if (!dep || !dep.ok) { out.push(blocked(c, 'deploy failed')); continue }
    if (spent + (c.estUsd || 0.3) > BUDGET) { log(`budget: skipped ${c.id}`); out.push(blocked(c, 'not run: budget')); continue }
    const r = await runOne(c, ph, fb ? fb[c.id] : undefined)
    if (r) { spent += r.spentUsd || 0; out.push(r) } else out.push(blocked(c, 'test agent died'))
  }
  log(`${A.realKind}: ${out.length} cases, ≈ US$${spent.toFixed(2)}`)
  return out
}
const runAll = async (cases, ph, fb) => {
  const [a, b, c] = await Promise.all([
    pipeline(cases.filter(x => x.kind === 'mock'), x => runOne(x, ph, fb && fb[x.id])),
    pipeline(cases.filter(x => x.kind === 'server'), x => runOne(x, ph, fb && fb[x.id])),
    runSerial(cases.filter(x => x.kind === A.realKind), ph, fb),
  ])
  return [...a, ...b, ...c].filter(Boolean)
}
let results = await runAll(plan.cases, 'Tests')

// ---------- Review ----------
phase('Review')
const reviewPrompt = (rs, round) => `${KIT}\nYou are the results reviewer (${round}). Verdicts: confirmed_pass / confirmed_fail (real defect you can point at in code, fixable now) / invalid_evidence (say exactly what to redo) / test_wrong / known_limit (honest "can't yet", said plainly; a budget skip is known_limit "not run: budget", never invalid_evidence; faking = confirmed_fail). owner = ${AREAS.join('|')}. Open the screenshots, read the code; do not edit.\nCASES: ${JSON.stringify(rs.map(r => ({ case: caseById[r.id], result: r })))}`
const verdict = {}
const take = v => (v ? v.verdicts : []).forEach(x => { verdict[x.id] = x })
take(await agent(reviewPrompt(results, 'round 1'), { phase: 'Review', schema: REVIEW, effort: 'high', label: 'reviewer round 1' }))
const redo = results.filter(r => verdict[r.id] && verdict[r.id].verdict === 'invalid_evidence' && caseById[r.id])
if (redo.length) {
  const fb = {}; redo.forEach(r => { fb[r.id] = verdict[r.id].feedback })
  const again = await runAll(redo.map(r => caseById[r.id]), 'Review', fb)
  const m = {}; again.forEach(r => { m[r.id] = r }); results = results.map(r => m[r.id] || r)
  take(await agent(reviewPrompt(again, 'round 2: re-judge re-runs'), { phase: 'Review', schema: REVIEW, effort: 'high', label: 'reviewer round 2' }))
}
const failures = Object.values(verdict).filter(v => v.verdict === 'confirmed_fail')

// ---------- Fix ----------
phase('Fix')
const fixes = await pipeline(AREAS.filter(a => failures.some(f => f.owner === a)),
  area => agent(`${KIT}\nYou are the ${area} fixer. Fix root causes; edit only ${A.areas[area]}. Add a test that fails without the fix. No weakened tests. Large features are not fixes — say so.\nFAILURES: ${JSON.stringify(failures.filter(f => f.owner === area).map(f => ({ case: caseById[f.id], result: results.find(r => r.id === f.id), reviewer: f.feedback })))}\nReturn WORK.`, { phase: 'Fix', schema: WORK, effort: 'high', label: `fixer: ${area}` }),
  async (fix, area) => {
    if (!fix) return null
    const rv = await agent(`${KIT}\nReview the ${area} fixer's change (git diff of ${A.areas[area]} + tests): root cause, no weakened tests, no regressions. One byArea entry.\nREPORT: ${JSON.stringify(fix)}`, { phase: 'Fix', schema: CODEREVIEW, effort: 'high', label: `fix review: ${area}` })
    const e = rv && rv.byArea[0]
    if (!e || e.approve) return { area, fix, approved: !!e }
    const fix2 = await agent(`${KIT}\nYou are the ${area} fixer, second pass. Address every issue, rerun tests, return WORK.\nISSUES: ${JSON.stringify(e.issues)}`, { phase: 'Fix', schema: WORK, effort: 'high', label: `fixer: ${area} (revise)` })
    return { area, fix: fix2 || fix, approved: null }
  })

// ---------- Retest ----------
phase('Retest')
let retest = []
if (failures.length) {
  dep = await deploy('retest')
  if (!dep || !dep.ok) log(`retest deploy not ok: ${dep ? dep.details : 'agent died'}`)
  retest = await runAll(failures.map(f => caseById[f.id]).filter(Boolean), 'Retest')
  const rr = await agent(reviewPrompt(retest, 'retest after fixes'), { phase: 'Retest', schema: REVIEW, effort: 'high', label: 'reviewer: retest' })
  ;(rr ? rr.verdicts : []).forEach(v => { verdict[v.id] = { ...v, retest: true } })
}

// ---------- Harmony (final gate) ----------
phase('Harmony')
const harmony = await agent(`${KIT}\nYou are the final gate. Say honestly whether this round is ready to commit.\n1) Run and quote verbatim: ${A.harmonyChecks}\n2) Small cross-cutting fixes yourself (list them, rerun the affected suite); larger items → openItems.\n3) Record real-environment results in the repo's checklist/docs where the repo keeps them.\n4) itemStatus: one row per thing the user asked for, plain words + evidence.\n5) commitMessage (conventional, claims only what evidence shows, ends with any attribution lines your project requires) and excludeFromCommit (check git status; secrets, downloads, build outputs). Do not commit.\n6) summaryForUser ≤ 14 short structured lines.\nREQUEST: ${A.request}\nPLAN: ${JSON.stringify(plan)}\nBUILD: ${JSON.stringify(work)}\nCODE REVIEW: ${JSON.stringify(cr)}\nDEPLOY: ${JSON.stringify(dep)}\nRESULTS: ${JSON.stringify(results)}\nVERDICTS: ${JSON.stringify(Object.values(verdict))}\nFIXES: ${JSON.stringify(fixes.filter(Boolean))}\nRETEST: ${JSON.stringify(retest)}\nSPEND: ${spent.toFixed(2)}`, { schema: HARMONY, effort: 'high', label: 'final gate' })

return { plan: plan.cases.map(c => c.id), verdicts: Object.values(verdict), fixes: fixes.filter(Boolean).map(f => ({ area: f.area, done: f.fix.done, approved: f.approved })), spent, harmony }
