# PyLine Annotator — Review Findings & Suggested Changes

Reviewed at commit `956afba`. Ordered by priority (P0 = blocking, P3 = polish).
All regex misclassification claims below were verified by executing the actual
regexes from `src/main.js` against the listed inputs. No source files modified.

---

## P0 — The app does not function

### 1. `main.js` is never wired to the page — nothing works
`src/main.js` exports a single factory, `setupAnnotationEngine()`, and **nothing
ever calls it**. There is no entry point: no `DOMContentLoaded` handler, no event
listeners on `#annotate-btn` / `#clear-btn` / `#copy-btn` / `#deep-toggle`, and no
code that renders annotations into `#code-output`. Clicking any button does
nothing; the output panel permanently shows the empty state.

The CSS (`.annotation`, `.annotation-tag`, `.annotation-source`, token colors) and
the classifier's output shape (`type/summary/note/purpose/index`) suggest a
renderer existed or was planned, but it is not in the repo — despite the commit
message "Fix editor init and state loading".

**Suggested change:** add an entry point (in `main.js` or a new `src/app.js`):
- On load: query the five controls, call `setupAnnotationEngine()`, bind handlers.
- Annotate: `parseCode(textarea.value)` → render one `.annotation` card per line
  (line number, source, type tag, purpose) into `#code-output`; remove `output-empty`.
- Clear: reset textarea, restore the empty state.
- Copy: serialize current annotations to text → clipboard (see item 13).

### 2. README's "open `index.html` directly" path is broken
`index.html` loads `main.js` with `<script type="module">`; Chromium blocks module
scripts over `file://` (CORS), so the double-click path fails silently. Only the
`python3 -m http.server` path works.

**Suggested change:** either remove the claim from the README, or drop
`type="module"` (a single plain script is defensible at this size). Decide once —
it also affects how modules are split later.

### 3. CodeMirror is half-integrated and breaks the offline claim
- `index.html:7-8` load two CodeMirror **CSS** files from jsDelivr — an external
  network request, contradicting the footer ("Local-only • No API usage • Works
  offline") and the README ("local-first").
- The URLs say `codemirror@6` but resolve to CodeMirror **5**-layout CSS
  (`lib/codemirror.css`), not the real CodeMirror 6 API surface.
- No CodeMirror **JavaScript** is loaded anywhere, so no editor is ever created;
  the `.CodeMirror` rules in `styles.css:89-94` are dead code.
- Net effect: the input is a bare `<textarea>` with default UA styling (white
  background, proportional font) inside a dark-themed app — `styles.css` has no
  `textarea`/`#code-input` rules at all.

**Suggested change — pick one:**
- (a) Drop CodeMirror for v1: delete the two `<link>` tags and the `.CodeMirror`
  CSS; style the textarea (item 14). Simplest, honest about offline.
- (b) Actually adopt CodeMirror 6: vendor `@codemirror/*` bundles locally (no
  CDN) and initialize it in JS. Only worth it when in-editor highlighting or
  line-linking is wanted.

---

## P1 — Annotation logic only survives demo-simple code

### 4. Line-regex classification misfires on ordinary Python (verified)
`parseCode` splits on `\n` and classifies each line with a first-match regex
chain. Confirmed failures:

| Input | Classified as | Should be |
|---|---|---|
| `x == y` | assignment | comparison/expression |
| `a != b` | assignment | expression |
| `foo(a=1)` | assignment | call |
| `print("x=1")` | assignment | print/io |
| `async def f():` | control | function definition |
| `    arg=1,` (inside a multi-line call) | assignment | call continuation |
| docstring / triple-quoted string lines | expression | docstring |

Root causes in the code:
- The assignment regex `/=\s*[^=]/` (`main.js:59`) matches the *second* `=` of
  `==`, matches `!=`/`<=`/`>=`, matches keyword arguments, and matches `=`
  **inside string literals** — and it runs *before* the `print`/call checks
  (`main.js:64,74`), stealing those lines.
- `/^def\s/` (`main.js:34`) doesn't match `async def`, so the `async` keyword
  rule (`main.js:49`) wins and async function definitions are not recognized.
- The classifier carries **zero state between lines**: triple-quoted strings,
  implicit continuations inside `(...)`/`[...]`/`{...}`, multi-line
  comprehensions, and backslash continuations are classified fragment-by-fragment.
  Decorators are never associated with the definition they decorate.
- No string/comment awareness anywhere, so any keyword or operator inside a
  literal can trigger a rule.

**Interim fixes if keeping regexes:** check `async def` before the control rule;
replace the assignment regex with `/(?<![=!<>+\-*\/%^&|])=(?!=)/` applied outside
strings; reorder print/call before assignment; strip strings and comments in a
small pre-pass. This makes the tool honest on most single-line code but still
cannot handle multi-line constructs. Real fix: item 5.

### 5. Adopt a real parser — the main blocker for future features
Anything beyond flat per-line labels (scope-aware notes, "this `return` belongs
to `hello()`", grouping a decorator with its function, folding a class) needs
structure regexes cannot provide. Options that fit client-side/offline:

- **Recommended: tree-sitter-python via `web-tree-sitter` (WASM), vendored
  locally.** ~1.5 MB total, offline once shipped, error-tolerant (still parses
  broken snippets — important for a paste-anything tool), and node types
  (`decorated_definition`, `function_definition`, `class_definition`,
  `list_comprehension`, `await`, …) map one-to-one onto annotation categories.
- Middle ground: a hand-written Python tokenizer (strings, comments,
  bracket-depth, indent tracking). Fixes string/multi-line failures without WASM,
  but provides no tree.
- Not recommended: Pyodide for the `ast` module — 10+ MB for what tree-sitter
  does in 1.5 MB.

Migration seam: keep `parseCode(raw) → [{type, summary, purpose, index}]` as the
stable contract and swap its internals. `parseCode` is already `async`, so the
interface doesn't change. Item 8 makes the swap cleaner.

### 6. Dead "engine" scaffolding — decide or delete
`engine` is `null` forever: nothing ever calls `setEngine`, so `generateSummary()`
(`main.js:87-93`) always returns `null`. The `engine.translate(raw,
{ max_new_tokens, temperature })` signature suggests a planned transformers.js
local-LLM "Deep mode" (presumably what `#deep-toggle` is for), but none of it is
connected.

**Suggested change:** delete `generateSummary`, `getEngine`, `setEngine`, and the
Deep mode toggle until there's a real implementation. If Deep mode stays on the
roadmap, note that a local model must be vendored (tens of MB) to keep the
"no API calls / offline" promise — a product decision to make explicitly.

---

## P2 — Code quality and structure

### 7. Fix the broken formatting in `main.js`
The entire classification chain (lines 14–80) is outdented to column 0 inside a
doubly-nested function, and indentation is inconsistent in `generateSummary` and
the returned object literal. Run Prettier (or fix by hand) before any refactor —
reviewing the nesting by eye is currently error-prone.

### 8. Replace the 60-line if/else chain with a data-driven rule table
```js
const RULES = [
  { type: 'decorator', test: t => /^@\w/.test(t), summary: t => `Decorator: …`, purpose: '…' },
  // …
];
const rule = RULES.find(r => r.test(trimmed)) ?? DEFAULT_RULE;
```
Each rule becomes independently testable, ordering becomes explicit and
reviewable, and when the parser lands (item 5) the table converts into a
`node.type → annotation` map instead of a rewrite. Cheapest structural change
with the biggest payoff.

### 9. Small cleanups
- `note` and `purpose` are near-duplicates in every branch — keep one.
- `const text = line || '';` (`main.js:8`) is never used — delete.
- The call regex `` /^\w[\w.`]*\(/ `` (`main.js:74`) has a stray **backtick** in
  the character class — a typo; backticks don't occur in Python identifiers.
- The class-summary fallback `trimmed.split('{')[0]` (`main.js:41`) is a JS-ism;
  Python classes never use `{`.
- `setupAnnotationEngine` has no reason to be `async` (keep `parseCode` async as
  the parser seam).

### 10. Add tests — the core logic is pure and trivially testable
`parseCode` has no DOM dependency. Add a `node --test` file (zero dependencies)
using the misclassification table from item 4 as fixtures, so the regex→parser
migration has a safety net. The cheapest insurance available before any refactor.

---

## P3 — Accessibility and UX

### 11. Output panel labeling and announcements
- `<label for="code-output">` (`index.html:39`) targets a `<div>` — invalid;
  `label` only binds to form controls, so it silently does nothing. Use a heading
  (or `<span id>`) plus `role="region"` / `aria-labelledby` on the container.
- Add `aria-live="polite"` to `#code-output` so screen-reader users hear that
  annotations appeared after clicking Annotate.

### 12. Render with `textContent`, never `innerHTML`
Annotations echo user-pasted source lines. Build the output DOM with
`createElement`/`textContent`. Interpolating pasted code into `innerHTML` is
self-XSS today and becomes real XSS the moment shareable links or imported
snippets are added. (Applies to whoever implements item 1.)

### 13. Copy button behavior
- `navigator.clipboard` is unavailable over `file://` in some browsers — combined
  with item 2, decide the supported entry path and add a fallback or hide the
  button when unavailable.
- Add success/failure feedback ("Copied ✓" for ~1.5 s); a silent copy button
  reads as broken.

### 14. Input textarea UX (if not adopting CodeMirror — item 3a)
- Style it: monospace font, dark background matching the theme,
  `spellcheck="false"`, `autocapitalize="off"`, `autocomplete="off"`.
- Handle the Tab key to insert indentation instead of moving focus — essential
  for a Python input (provide Esc-then-Tab to escape, per WCAG 2.1.2).

### 15. Minor polish
- Buttons have no `:focus-visible` style; the default ring is faint on this dark
  theme. Add a visible focus ring using `--accent`.
- Wrap the 🐍 in the `<h1>` with `aria-hidden="true"` so screen readers don't
  announce "snake" before the app name.
- The single-column layout with capped row heights (`minmax(180px, 240px)`)
  wastes tall viewports; consider a two-column input/output split at ≥900px.

---

## Suggested sequencing

1. **Item 1 + 12 + 3a** — wire the UI with safe rendering, drop the CDN/CodeMirror
   half-state, style the textarea. Smallest set that yields a working, honest,
   offline app.
2. **Item 10 + item 4 quick fixes** — make current behavior trustworthy.
3. **Items 7–9** — rule table + cleanup; prepares the seam.
4. **Item 5** — tree-sitter WASM, the real annotation engine.
5. **P3 polish**; decide Deep mode (item 6) as a product question.
