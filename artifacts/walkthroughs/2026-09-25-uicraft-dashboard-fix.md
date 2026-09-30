# Walkthrough — Dashboard alignment fix + copy unification

**Tag:** ui-craft/roz-fix · **Date:** 2026-09-25 · **Status:** DONE

## User request
1. "revisa el dashboard, hay elementos mal alineados, comprimidos" (ui-craft pass)
2. "Implementa las sugerencias" — apply the two deferred items: copy-language
   unification and the `/finalize` gate.

## Solution applied
All findings were measured via Chrome CDP (`getBoundingClientRect`) at 1440×900
against the live server, not estimated. Harness: `/tmp/roz_audit/{measure,verify,final}.ts`.

### Alignment/compression (web/style.css, web/app.js)
- Doc titles: `nowrap+ellipsis` → `line-clamp: 2` + `title` tooltip (29% were truncated, up to 143px lost).
- Right-rail controls: heights were 31/32.6/34.1/37px staircase → uniform 32px (`.analyze` 38px, deliberate CTA).
- `.doc-item .m`: nowrap + ellipsis — killed wrap outliers (146/146 meta rows single-line).
- `.filters`: flex-wrap (uneven 6+1) → `grid repeat(4, auto)` (even 4+3).
- `.doc-group` left-aligned with `.doc-item` text (x=22 both); sticky band fixed (`z-index`, padding moved); badges unpacked (`padding 1.5px`, `flex: none`); rails symmetrized 300/290 → 320/320.
- `:focus-visible` outlines, `tabular-nums` on stats/meta, `prefers-reduced-motion` block.

### Copy unification (pass 8)
- All UI chrome strings ES → EN (index.html + app.js): `live only`, `← back`, `⚡ abort`,
  `analyze with pi`, `the agent asks`, monitor summary/empty-state, dialogs, toasts,
  placeholders, titles.
- **`DEFAULT_PROMPT` stays Spanish deliberately:** it is analysis payload that instructs
  pi to answer in Spanish for Spanish-language docs — not UI chrome.
- Post-check: only doc *content* (rendered `.md` bodies, real doc titles) remains Spanish. Correct.

### Finalize gate fixes
- Pass 3: `color-scheme: dark` on html / `light` on body.light; `theme-color` meta pair.
- Pass 6: viewer loading state (`loading document…`), actionable error state with ⟳ retry,
  stale-response guard (`state.selected?.path !== d.path` drops superseded fetches).
- Ways-out: `Escape` closes all three modals (confirm resolves as "no"); verified live.

## Technical decisions
- Respected existing GitHub-dark terminal token system; zero palette/typography changes.
- Verification is CDP measurement, not screenshots — this model cannot view images;
  evidence scripts + JSON outputs retained in `/tmp/roz_audit/`.

## Validation
- `node --check web/app.js` OK; CSS braces balanced (189/189); server live, no console errors.
- Re-measured after final edits: railHeights 32×6+38, 146 single-line meta rows,
  group/item x=22, filterRows=2 even, badges not clipped, Esc tests pass both modals.

## Accept findings (documented, not skipped)
- **Pass 4:** arbitrary px spacing (6/8/10/14/16) — no spacing token scale exists;
  retrofitting one on a 320-line CSS file is refactor, out of scope. Minor.
- **Pass 5:** unicode glyphs (⟳ ⚡ ✕ ⚙ ✓ ←) as icons — deliberate terminal aesthetic,
  consistent family of monochrome glyphs; recorded as project decision.
- **Pass 7:** no transitions on pane/tab switches — 150ms opacity would be polish,
  tool is instant locally; motion-gap minor.
- Monitor tab lacks loading/empty skeleton geometry (grid pops in). Minor.

## Out of scope (log)
- `#monitor-dot` color set via inline `style.color` in JS — belongs in CSS state classes.
- Root-modal add/remove has no optimistic UI or pending state on the `+` button.
