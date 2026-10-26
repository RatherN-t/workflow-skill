# workflow-skill

An orchestrated multi-agent workflow for Claude Code that you can point at any big task: planning, building, testing and
hardening in rounds, with reviewers that try to break the work and a gate that says honestly whether it is ready.

It was built and refined over many rounds of real product work (parallel builders, adversarial reviewers, real-environment test
runs, regression gates, a live dashboard). This repo packages the method so anyone can use it.

## What you get

```
SKILL.md                              the skill: roles, the loop, verdicts, the rules that saved the most time
templates/TOOLS.template.md           the toolkit every agent reads first
templates/CONTRACT.template.md        numbered rulings, corrections, shared wire, slices, acceptance
templates/plan-round.template.js      scouts -> planner -> confirmers -> final plan (writes the contract)
templates/build-round.template.js     parallel slices: build -> adversarial review -> revise -> one integrator
templates/test-round.template.js      research + build -> plan -> code review -> deploy -> one agent per test case
                                      -> results review -> fixers -> retest -> final gate
dashboard/wf-hub.mjs                  one live dashboard on one port for every workflow in the session
dashboard/wf-names.example.json       optional display names for the dashboard
```

## The loop

**measure -> classify -> rule -> build -> review -> integrate -> measure again.**

- The main session is the orchestrator: it writes the contract, launches workflows, makes rulings, and reports.
- Scouts and a planner turn your request into slices (disjoint files) and test cases.
- Builders work in parallel. Every behaviour gets a test that fails without it.
- Reviewers plant regressions to prove the tests are real.
- One integrator merges, runs every suite, and runs a regression gate before anything touches your expensive real environment.
- A results reviewer gives every test a verdict: `confirmed_pass`, `confirmed_fail`, `invalid_evidence`, `test_wrong`,
  `known_limit`.
- The final gate says ready or not ready, item by item, with numbers only where there is evidence.

## Install

1. Copy this folder into your Claude Code skills folder:
   - macOS / Linux: `~/.claude/skills/workflow-skill/`
   - Windows: `%USERPROFILE%\.claude\skills\workflow-skill\`
2. Start Claude Code and ask for it by name ("use the workflow skill for this") or type `/workflow-skill`.

It needs Claude Code with the Workflow tool (multi-agent workflows). Workflows spawn many agents and use a lot of tokens: the skill
asks before starting one unless you asked for this architecture.

## Using it

1. Tell Claude what you want done, and what "done" means.
2. It scouts and plans (`plan-round`), shows you the plan, and asks for your go.
3. It builds in parallel (`build-round`) and opens a pull request from the integrator's branch. You merge.
4. It tests in the real environment (`test-round`, or your own test workflow) and reports honestly, including what got worse.
5. Repeat until the gate passes.

Start the dashboard once per session:

```
node dashboard/wf-hub.mjs ~/.claude/projects/<project>/<session> 8780 6
```

Then open http://127.0.0.1:8780/. Copy `wf-names.example.json` to `wf-names.json` beside the script to give workflows readable
names.

## Rules worth keeping

- **Shared names, one fixture.** Anything two parts must agree on lives in one fixture file both sides' tests read.
- **Regression gate before expensive runs.** Replay saved real inputs through the new code offline; block if anything gets worse.
- **A clean pass is not proof.** Plant the bug back and watch the test fail.
- **Preflight long real runs.** Stop within minutes, not hours.
- **One lock for a shared environment.** Back up its config before changing it, restore it byte for byte afterwards.
- **"Not measured" is never "passed".** Numbers in summaries come from files and state their unit.

## Licence

MIT. See `LICENSE`.
