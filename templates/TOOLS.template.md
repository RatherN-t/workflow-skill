# <Project> test kit (this PC)

SCRATCH = <session scratchpad>
REPO    = <repo path>   (branch <branch>; never git checkout/stash/reset/clean/commit/push)

## Real environment (ONLY the agent the orchestrator names may touch it)
- Start / stop / reinstall: <script paths and what "READY" looks like>
- Drive it: <how agents click, type, read state — e.g. a DevTools port + Playwright connectOverCDP>
- Known ids / fixtures: <stable ids, sample files, scratch copies — never the originals>
- Spend: <where cost lines are logged and how to sum them>; stop at 2× a case's estUsd.
- Destructive actions: <what must never be allowed, e.g. "never Allow a delete">.
- End state every agent must restore: <app running, linked, default model/mode, no dialogs, no leftover imports>.

## Mock tests (any number in parallel, free)
- <mock server command, how to pick a free port, browser automation template, trigger words>

## Server / unit tests (free)
- <build + test commands; which ports parallel suites must use so they don't collide>

## Evidence
- Logs: <paths>. Conversations/state: <paths>. Audit: <path> (note anything else that writes there).

## Gotchas
- <traps found in earlier rounds, one line each>
