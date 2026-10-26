---
name: workflow-skill
description: Planner / builder / reviewer / gate architecture for big multi-part tasks in Claude Code. The main session orchestrates (plans, writes contracts, launches workflows, reports); scouts and a planner turn the request into slices and test cases; builders work in parallel on disjoint files; adversarial reviewers check every slice; one agent per test case; a results reviewer judges every result; an integrator merges with every gate; a final gate decides ready or not; one live dashboard shows it all. Use when the user asks for an orchestrated, multi-agent build, "orchestrator / executor / reviewer", "spin out agents per test", "pressure test this", or any round that builds features AND proves them.
---

# Workflow skill: orchestrated multi-agent rounds

The main session is the **orchestrator**. It plans, writes contracts and briefs, launches workflows, watches them, makes the
rulings agents ask for, and reports back. It does not do the bulk work itself.

Running a workflow costs real tokens. Use it when the user opted in (asked for this architecture or for multi-agent work). If the
model picked this skill on its own, confirm scope and budget first. Load the `workflow-authoring` reference before writing a script.

## The loop

Every round is the same loop: **measure → classify → rule → build → review → integrate → measure again.**

1. **Measure** in the real environment (or the closest thing you have) and record every result in files.
2. **Classify** every miss by cause, so the round fixes the cause that loses the most, not the loudest symptom.
3. **Rule**: the orchestrator writes a contract (`templates/CONTRACT.template.md`) with numbered rulings, the shared wire, slice
   ownership and acceptance. When the orchestrator was wrong, append a dated `## Correction`, never rewrite history.
4. **Build**: parallel builders, one slice each, disjoint owned paths. Every behaviour gets a test that fails without it.
5. **Review**: an adversarial reviewer per slice plants at least two regressions and watches the tests fail; one or two revise
   passes, then re-review only the open issues.
6. **Integrate**: one integrator merges slices one at a time, wires shared registration files, runs every suite one at a time, and
   runs the regression gate (below) before anything touches the expensive real environment.
7. **Measure again**, publish the result (with screenshots/evidence), including what got worse.

## Roles
| Role | Model | Job |
|---|---|---|
| Orchestrator | main session | Scout briefly, write contracts and the toolkit, launch workflows, make rulings, merge PRs the user approves, report. |
| Scouts | default (strong) | Read-only fact finding: current state, history of what moved the numbers, gaps. Structured output with sources. |
| Planner | strongest available | Turns the request + scouts into slices, test cases and a gate table; says plainly what is not reachable. |
| Confirmers | default | Attack the plan from distinct lenses (feasibility vs the code; completeness/honesty vs the user's real use). |
| Builders | default | One slice each, owned paths only, root cause before fix, tests that fail without the change. |
| Slice reviewers | default, high effort | Audit the diff against the contract; plant regressions; approve only when material issues are gone. |
| Integrator | default, high effort | Merge, wire shared files, run every suite and the regression gate, project offline, push a branch (never main). |
| Real-environment agent | default | The ONLY agent allowed to touch the shared real environment, serially, holding a lock. |
| Test agents | default, medium effort | Exactly one case each; write only under their own evidence folder; never edit the repo. |
| Results reviewer | default, high effort | A verdict for every result (taxonomy below); opens screenshots, reads code; sends weak evidence back once. |
| Final gate | strongest available | Ready / not ready, item by item, numbers only where evidence exists, a short summary for the user. |

## Verdict taxonomy (results reviewer)
`confirmed_pass` · `confirmed_fail` (a real defect you can point at, fixable now) · `invalid_evidence` (the evidence does not
support the status; say exactly what to redo) · `test_wrong` (the test contradicts the contract or the real data) · `known_limit`
(the product honestly cannot yet AND says so). A case skipped for budget is `known_limit` "not run: budget", never invalid evidence.

## Templates
- `templates/TOOLS.template.md`: the toolkit every agent reads first (paths, how to drive the environment, locks, evidence, end state).
- `templates/CONTRACT.template.md`: rulings, corrections, shared wire, slices, acceptance.
- `templates/plan-round.template.js`: scouts → planner → confirmers → planner final (writes the contract + plan JSON).
- `templates/build-round.template.js`: optional API/domain verdicts → parallel slices (build → review → revise) → integrator.
- `templates/test-round.template.js`: research ∥ build → plan → code review → deploy → one agent per case → review → fix →
  retest → final gate.
- `dashboard/wf-hub.mjs`: ONE dashboard on ONE port for every workflow of the session.

## Dashboard: one port, every workflow
`node dashboard/wf-hub.mjs <session dir> 8780 6` serves http://127.0.0.1:8780/ and shows every workflow that is running or finished in
the last 6 hours, newest first, live agents open and finished ones folded. Names come from an optional `wf-names.json` beside the
script (`{ "<workflow id>": "Readable title" }`), re-read on every refresh. Never start a dashboard per round; restart the hub only
when its code changes. `<session dir>` is `~/.claude/projects/<project>/<session>/` (it holds `subagents/workflows/wf_*`).

## Rules that saved the most time
- **Shared wire, one fixture.** Any name, code or grammar two sides must agree on lives in ONE fixture file that every side's tests
  read; assign both sides in the contract. Most cross-slice failures were one side changing a grammar alone.
- **Regression gate before the expensive run.** Replay saved inputs from earlier real runs through the new code offline and block
  if anything gets worse. Prove the gate with a planted regression (it must block).
- **A clean pass is not proof.** Plant the bug back and watch the test fail before green counts. Reviewers plant their own.
- **Preflight before long real runs.** One short check that the environment starts, the build loaded is the one you built, and the
  first call answers; stop within minutes instead of failing every case for hours.
- **One lock for a shared environment.** Only the agent the orchestrator names takes it; write the lock file first, remove it last.
  Back up any shared config before installing, restore it byte for byte at the end, verify with a hash manifest.
- **Timeouts are evidence killers.** Give long calls a long, progress-reset timeout, and record a lost reply as "unknown", never as
  "did not happen".
- **Never edit an agent prompt before a resume.** Resume caches the longest unchanged prefix; put a RESUME NOTE at the top of the
  toolkit instead.
- **Disk.** Builders and proof runs leave large temp folders; remove build outputs per slice, archive old evidence elsewhere.
- **Honesty.** Numbers in summaries come from files and state their unit. "Not measured" is never "passed". Say what got worse.

## Briefs that work
Open with: the toolkit line, the contract line, the role, owned paths, forbidden actions (no real environment unless the brief
holds the lock; never push main; no secrets). Ask for the root cause with evidence before a fix. End-of-run state restored.

## After each workflow
1. Save the result JSON next to the contract (`wf-<round>-result.json`).
2. Check `git status` for secrets and stray files; open a PR from the integrator's branch; the user merges.
3. Record decisions and traps in memory; tell the user what was done, a results table, honest failures, next steps.
