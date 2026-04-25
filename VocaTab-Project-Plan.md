**VocaTab**

Browser Extension — Project Plan

Chrome (v1)  •  Firefox (later)

# **Overview**

A Chrome extension that replaces the new tab page with a self-paced translation quiz. The user supplies their own sentence pairs, sees one at a time, reveals the answer on demand, and tracks progress over time. Everything is stored locally — no account, no server, no cost.

# **Architecture**

Manifest V3, vanilla HTML/CSS/JS, no backend, no framework required for v1.

**File Structure**

manifest.jsonnew-tab/         index.html, quiz.js, quiz.cssoptions/         index.html, options.js, options.cssshared/          db.js (all IndexedDB logic), stats.jsicons/

**Storage Split**

| Store | What lives here |
| :---- | :---- |
| IndexedDB | Sentences \+ per-sentence progress records (timesShown, timesCorrect, lastSeen, easeFactor) |
| chrome.storage.local | Settings (language pair, direction) \+ aggregate stats (streak, cards reviewed today) |

**Data Models**

**Sentences table (IndexedDB):**

{ id, nativeLang, nativeText, foreignLang, foreignText, dateAdded, tags\[\] }

**Progress table (IndexedDB):**

{ sentenceId, timesShown, timesCorrect, timesSkipped, lastShown, difficulty, easeFactor }

**Settings (chrome.storage.local):**

{ nativeLang, foreignLang, direction, streak, lastActiveDate }

# **Phase 1 — MVP**

*Goal: installable, functional, submittable to the Chrome Web Store.*

## **New Tab Quiz Page**

* One randomly selected sentence per new tab, shown in either direction (random)

* "Show Answer" button reveals the translation

* "Got it" / "Missed it" buttons record the result and load the next card

* Prominent "Skip" link — no friction, opens a normal blank new tab immediately

* Empty state screen if the user has no sentences yet, with a link to the options page

## **Options / Management Page**

Accessible via the extension icon or a settings link on the new tab page.

* Manual add — two-field form (native text / foreign text)

* Bulk import — CSV and JSON upload with format spec shown inline

* View all sentences — paginated list with per-item delete

* Language pair configuration (native language \+ language being learned)

* Import validation — catch malformed files, missing fields, duplicates; show clear error report

## **Import Formats**

**CSV:**

native\_text,foreign\_text"The weather is nice today","El tiempo es agradable hoy"

**JSON:**

\[{ "native": "The weather is nice today", "foreign": "El tiempo es agradable hoy" }\]

## **Key Technical Notes**

* Use chrome\_url\_overrides in manifest.json to replace the new tab — the new tab page is just a regular HTML page, simpler than it sounds

* Wrap all IndexedDB calls in a shared db.js module — raw IndexedDB API is verbose and awkward

* Request unlimitedStorage permission so large sentence datasets don't hit a quota wall

* chrome.storage is async — not the same as localStorage

* No background service worker needed for v1

# **Phase 2 — Stats & Progress**

*Goal: give the user visibility into how they are actually doing.*

* Stats dashboard inside the options page

* Total sentences, total sessions, total cards reviewed

* Overall accuracy rate

* Sentences bucketed: Comfortable / Struggling / Not yet seen

* Streak tracking (days in a row with at least one card reviewed)

* Per-sentence detail: times shown, accuracy, last seen

* Small optional stats bar on the new tab page (streak, cards reviewed today) — hideable

# **Phase 3 — Smarter Repetition & Content**

*Goal: make learning more efficient and content easier to manage.*

* Spaced repetition (SM-2 algorithm) — missed cards return sooner, easy cards are pushed out

* "Hard / Good / Easy" grading replaces binary Got it / Missed it

* "Due today" queue takes priority over random selection

* Search, filter, and tag sentences (e.g. "food", "chapter 3")

* Edit existing sentences

* Export deck as CSV or JSON — users should never feel locked in

* Bulk delete

* Firefox port — Manifest V3 is largely compatible; mostly a packaging and store submission task (addons.mozilla.org is a separate review process)

# **Phase 4 — Future / Optional**

* Multiple decks (separate sentence sets for different contexts)

* Anki .apkg import — opens up a massive library of community-made decks

* Cloud sync with accounts — significant scope jump, only if there's demand

* AI-powered typed answer checking

# **Edge Cases to Handle**

| Scenario | How to handle |
| :---- | :---- |
| Zero sentences on first launch | Friendly empty state, link to options page to add sentences |
| Importing 10,000+ rows | IndexedDB handles it; show a progress indicator during import |
| Duplicate sentences on import | Detect and warn; let user choose to skip or overwrite |
| Multiple tabs open at once | Each tab independently queries IndexedDB — no conflicts |
| User goes offline | Everything works — all data is local |
| User clears browser data | All data is lost — make export prominent so users can back up their deck |
| Malformed CSV | Validate on import; show a row-by-row error report |
| Very long sentences (200+ chars) | Test layout explicitly — don't let the UI break on real-world data |
| Chrome Web Store review | Clearly explain the extension's purpose in the listing; new tab overrides get extra scrutiny |

# **Recommended Build Order**

Build in this order so you always have real data to test against — nothing built in a vacuum.

1. Get a basic manifest.json with chrome\_url\_overrides working — confirm you can replace the new tab with a plain HTML page. Takes 15 minutes and immediately demystifies extension development.

1. Build db.js — create/read/delete for sentences and progress.

1. Build the options page — manual add and CSV/JSON import first.

1. Build the new tab quiz UI on top of real data.

1. Add streak tracking and wire up chrome.storage.local for settings.

