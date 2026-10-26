export const meta = {
  name: 'plan-round',
  description: 'Scouts gather the current state and history, a planner turns the request into slices + test cases + a gate, confirmers attack the plan, the planner finalises and writes the contract',
  phases: [{ title: 'Scout' }, { title: 'Plan' }, { title: 'Confirm' }, { title: 'Finalise' }],
}
// args: { scratch, repo, request (the user's words, verbatim), context (one paragraph: what to read, what is off limits),
//         scouts: [{ key, prompt }], lenses: [{ key, prompt }], plannerModel (optional, e.g. your strongest model) }
const A = args, S = A.scratch
const CTX = `Read-only context (never edit the repo or the real environment): repo ${A.repo}. ${A.context} Every claim cites a file:line or a result file; say "unknown" rather than guess.`
const REQ = `The user's request, verbatim: ${A.request}`
const str = { type: 'string' }, num = { type: 'number' }, bool = { type: 'boolean' }
const arr = (i) => ({ type: 'array', items: i })
const obj = (p, r) => ({ type: 'object', properties: p, required: r || Object.keys(p) })
const SCOUT = obj({ area: str, current_state: str, gaps: arr(obj({ gap: str, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, evidence: str })), lessons: arr(str) }, ['area', 'current_state', 'gaps'])
const SLICE = obj({ id: str, agent_type: str, reviewer_type: str, owned_paths: arr(str), goal: str, rulings: arr(str), acceptance_offline: arr(str), acceptance_real: arr(str) }, ['id', 'owned_paths', 'goal', 'rulings', 'acceptance_offline'])
const CASE = obj({ id: str, kind: str, target: str, steps: arr(str), pass_criteria: arr(str) }, ['id', 'steps', 'pass_criteria'])
const GATE = arr(obj({ item: str, threshold: str, how_measured: str }))
const PLAN = obj({ verdict: str, history_lessons: arr(str), scope_in: arr(str), scope_out: arr(str), slices: arr(SLICE), cases: arr(CASE), gate: GATE, summary_for_user: str }, ['verdict', 'slices', 'cases', 'gate', 'summary_for_user'])
const CONF = obj({ approve: bool, amendments: arr(obj({ target: str, problem: str, change: str, severity: { type: 'string', enum: ['must', 'should'] } })), summary: str }, ['approve', 'amendments', 'summary'])
const FINAL = obj({ contract_path: str, plan_path: str, verdict: str, summary_for_user: str }, ['contract_path', 'plan_path', 'verdict', 'summary_for_user'])
const PM = A.plannerModel ? { model: A.plannerModel } : {}

phase('Scout')
const scouts = await parallel(A.scouts.map((s) => () => agent(`${REQ}\n${CTX}\nROLE: scout (read-only). ${s.prompt} Return SCOUT.`, { label: `scout: ${s.key}`, phase: 'Scout', schema: SCOUT, effort: 'high' })))
phase('Plan')
const plan = await agent(`${REQ}\n${CTX}\nROLE: planner. Plan the fastest honest path, based on what historically moved the results (scouts). One build round of parallel slices with DISJOINT owned paths, each reviewed adversarially, every behaviour with a test that fails without it; then one real-environment run; then a gate. Say plainly in verdict what is not reachable this round. Return PLAN.\nSCOUTS: ${JSON.stringify(scouts)}`, { label: 'planner', phase: 'Plan', schema: PLAN, effort: 'high', ...PM })
phase('Confirm')
const confs = await parallel(A.lenses.map((l) => () => agent(`${REQ}\n${CTX}\nROLE: confirmer, adversarial. ${l.prompt} approve=false if any amendment is "must". Return CONF.\nPLAN: ${JSON.stringify(plan)}`, { label: `confirm: ${l.key}`, phase: 'Confirm', schema: CONF, effort: 'high' })))
phase('Finalise')
const fin = await agent(`${REQ}\n${CTX}\nROLE: planner, final. Apply every "must" amendment and the "should" ones you agree with (say which you rejected and why). WRITE ${S}/CONTRACT-<round>.md (numbered rulings, slices, shared wire, acceptance, real-environment cases in run order, gate table; an engineer can build from it alone) and ${S}/plan-<round>.json (slices, cases, gate). Return FINAL.\nPLAN: ${JSON.stringify(plan)}\nCONFIRMERS: ${JSON.stringify(confs)}`, { label: 'planner final', phase: 'Finalise', schema: FINAL, effort: 'high', ...PM })
return { scouts, plan, confs, fin }
