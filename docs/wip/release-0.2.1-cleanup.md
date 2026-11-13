# fob-lgr 0.2.1 — packaging and type-check cleanup

## Status: IN PROGRESS (~60%): written 2026-10-05, after 0.2.0 shipped with two stray screenshots and type errors surfaced in worker-chisel. Phases 1–2 and the 0.2.1 commit are done. Next: alex moves the screenshots out of `src/`, publishes 0.2.1, then handles 0.2.0 per Decision 1. No git remote yet (Decision 2).
## Priority: P4: the fixes shipped in 0.3.0, the screenshots are gone and the remote exists; only deprecating 0.2.0 is left

fob-lgr 0.2.0 (published 2026-10-05 06:19 UTC, adds `accounts.seed()`) went out with problems that all trace back to one gap: nothing stops a publish from an unclean working tree, and nothing type-checks the package. This WIP fixes the four problems, adds the two guards that would have caught them, and releases 0.2.1.

---

## Problem Statement

1. **Two unrelated screenshots are in the npm package.** `src/image.png` (323 KB) and `src/image copy.png` (289 KB) are untracked browser dev-tools screenshots of another app's local storage (`budget.echoalex.com`), dated 2026-09-06. `package.json` `"files"` whitelists all of `src/`, and 0.2.0 was published from the working tree, so both shipped: 27 files instead of 25, and ~600 KB of dead weight. They're also publicly downloadable from npm.
2. **The published 0.2.0 matches no commit.** It includes an uncommitted edit to `src/cli/index.js` (below). Git's `c101230 chore: 0.2.0` doesn't contain it.
3. **The CLI's `--profile` / `--org` flag is ignored in the committed source.** `.option('--profile, --org <name>')` is stored by commander as `opts().org` (verified: `--profile a` → `{"org":"a"}`). The committed `preAction` hook reads `opts().profile`, which is always undefined, so the flag silently does nothing and the command runs against the *current* profile. For a write command that means writing to the wrong ledger org. The uncommitted edit (`const { org } = thisCommand.opts()`) is the fix, and it's what 0.2.0 on npm actually contains.
4. **Type errors leak into consumers.** `src/http.js:74`, `apiRequest(method, path, body, { credentials, searchParams } = {})`, has no JSDoc for its options, so TypeScript infers `{}` and reports `credentials` and `searchParams` as missing (TS2339). Because the file is `// @ts-check`, any consumer whose `tsc` follows imports into it shows both errors. worker-chisel's `npm run typecheck` does, since 2026-10-05.
5. **The package's own type check can't run.** `npm run typecheck` is `tsc -p jsconfig.json`, but there's no `jsconfig.json` (TS5058). That's why (4) was never caught here.

**Desired outcome:** 0.2.1 on npm contains exactly the committed `src/` JavaScript, the CLI flag works, `npm run typecheck` passes here, worker-chisel's type check shows no fob-lgr errors, and a publish from a dirty tree is refused.

## Proposed Solution

### Packaging

- **Screenshots:** move both out of the repo (they're alex's, not package files; not deleted by an agent).
- **Narrow `files`:** `"files": ["bin", "src/**/*.js", "README.md", "CHANGELOG.md"]`, so a stray non-JS file under `src/` can't ship even if the tree is dirty.
- **Refuse a dirty publish:** `"prepublishOnly": "git diff --quiet HEAD && test -z \"$(git status --porcelain)\" || (echo 'fob-lgr: commit or stash first; refusing to publish a dirty tree' && exit 1)"`. This also guarantees every published version matches a commit, which fixes (2) for good.
- **Check before publishing:** `npm pack --dry-run` lists only `.js` files plus the three docs files.

### CLI flag

Commit the existing working-tree edit (`opts().org`). Add a test: run the program with `--profile x` and with `--org x`, and assert `setOrgOverride('x')` is called both ways. This is the only test that would have caught (3).

### Types

- **`src/http.js`:** JSDoc for `apiRequest`'s options, `@param {{ credentials?: object, searchParams?: Record<string, any> }} [options]`. Check `apiGet` / `apiGetAll` / the transport methods for the same pattern while there.
- **Add `jsconfig.json`**, copied from fob-zb's (`checkJs: false`, the `// @ts-check` files opt in, `include: ["src/**/*"]`), so `npm run typecheck` runs.

### Release

- Add `CHANGELOG.md` (fob-zb's Keep a Changelog format), with entries for 0.2.1 and 0.2.0.
- Publish 0.2.1 from a clean tree.
- Then `npm deprecate @finopsbricks/fob-lgr@0.2.0 "Contains stray files; use 0.2.1"`. Consumers on `^0.2.0` pick up 0.2.1 on their next install.

## Open Decisions

1. **Unpublish 0.2.0 or only deprecate it?** npm allows an unpublish within 72 hours, i.e. until about **2026-10-08 06:19 UTC**. Unpublishing removes the screenshots from the registry; deprecating leaves them downloadable. Recommended: unpublish **after** 0.2.1 is out, so `^0.2.0` always resolves to something (worker-chisel depends on it). The screenshots aren't secrets, but they're personal and unrelated. *Owner: alex.*
2. **A git remote for fob-lgr.** The repo has no remote, so the source behind a published version lives only on this machine. The ledger app's CLAUDE.md calls it "its own repo". Recommended: create `github.com/finopsbricks/fob-lgr` (as fob-zb has), push, and tag `v0.2.0` (at `c101230`, noting it doesn't match npm) and `v0.2.1`. *Owner: alex.*

## Implementation Phases

### Phase 1: Guards 🟡
- [x] `jsconfig.json` (from fob-zb); `npm run typecheck` runs and shows the two `http.js` errors
- [x] `files` narrowed to `src/**/*.js`; `prepublishOnly` refuses a dirty tree. Verified: `npm pack --dry-run` lists 25 files and no PNGs while the screenshots are still in `src/`; `npm run prepublishOnly` exits 1 on the current tree.
- [ ] alex moves the two screenshots out of `src/`

### Phase 2: Fixes 🟡
- [x] `http.js` JSDoc: a `RequestOptions` typedef used by `apiRequest`, `apiGet/Post/Patch/Delete` and `apiGetAll`; `npm run typecheck` clean
- [x] Flag test `tests/cli-profile-flag.test.js` (`--profile`, `--org`, and no flag). Verified: it fails 2/3 against the 0.2.0 committed `opts().profile`. Also fixed the stale `argv.profile` comment in `src/cli/_helpers.js`.
- [x] Commit the `opts().org` fix plus the test
- [x] `npm test` green (18/18)

### Phase 3: Release 0.2.1 🟡
- [x] `CHANGELOG.md` (0.2.1, 0.2.0, 0.1.0); version 0.2.1 in `package.json` and the lockfile
- [x] Commit
- [x] `npm pack --dry-run`: JS files plus README, CHANGELOG and package.json, 26 files (0.2.0's 27, minus the two PNGs, plus CHANGELOG)
- [ ] `npm publish`; then deprecate or unpublish 0.2.0 per Decision 1
- [ ] worker-chisel: `npm install @finopsbricks/fob-lgr@^0.2.1`; its `npm run typecheck` shows no fob-lgr errors; tests green

### Phase 4: Remote ❌
- [ ] Per Decision 2: create the GitHub repo, push, tag

## Risks

- **Unpublishing too early** breaks `npm install` for anyone pinned to 0.2.0 or `^0.2.0` until 0.2.1 exists. Always publish first.
- **`prepublishOnly` and `npm publish` from a CI checkout:** a clean checkout passes, so this only bites local publishes. That's the point.

## Related Files

- `package.json`: `files`, `scripts`
- `src/http.js:74` (`apiRequest`)
- `src/cli/index.js:37-42` (`--profile, --org` and the `preAction` hook)
- `../fob-zb/jsconfig.json`, `../fob-zb/CHANGELOG.md`: the patterns to copy
- worker-chisel `jsconfig.json`: the consumer whose type check surfaced (4)
