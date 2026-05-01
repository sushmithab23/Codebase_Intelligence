# CIE — Bob Skills Reference
## Which skills to use and when

Bob supports community skills that extend its capabilities.
Here are the skills most relevant to the CIE project.

---

## Skills to use in this project

### 1. Code explanation skill
**When to use:** Phase 3 — when tuning Bob's output for the impact analysis feature
**What it does:** Improves Bob's ability to explain code in plain English
**How to find it:** Search "code explanation" in Bob's skills marketplace
**Apply in rules.md:** Already covered — the rules file tells Bob to ground every explanation in real file paths

---

### 2. Test generation skill
**When to use:** Phase 3 — powers Wow Moment 3
**What it does:** Improves Bob's test output quality, especially edge case detection
**How to find it:** Search "unit test generation" or "test writer" in Bob skills
**Apply in rules.md:** Already covered — rules file specifies framework detection and test naming conventions

---

### 3. Documentation generation skill
**When to use:** Phase 3 — powers the "Generate Docs" button
**What it does:** Improves JSDoc / docstring output quality
**How to find it:** Search "documentation" or "JSDoc" in Bob skills
**Apply in rules.md:** Already covered — rules file specifies doc style matching

---

### 4. GitHub integration skill (via MCP)
**When to use:** Phase 1 — powers the entire repo ingestion pipeline
**What it does:** Gives Bob direct access to GitHub repos via MCP
**How to set up:** See `mcp/mcp-servers.md` — GitHub MCP server config
**This is the most critical skill for this project**

---

### 5. Dependency analysis skill
**When to use:** Phase 1 + Phase 3 — powers impact analysis
**What it does:** Improves Bob's ability to trace function call chains across files
**How to find it:** Search "dependency" or "call graph" in Bob skills
**Apply in rules.md:** Already covered — impact analysis prompt template in rules file

---

## Skills to avoid

| Skill type | Why avoid |
|---|---|
| Refactoring skills | You cut refactoring from scope — don't let Bob drift toward it |
| CI/CD skills | Out of scope for this PoC |
| Security scanning skills | Bonus feature only — don't activate unless Phase 5 is done |
| PR description skills | Bob already does this natively — redundant |

---

## How to apply a skill in Bob

1. Open Bob settings
2. Go to "Skills" tab
3. Search for the skill name
4. Click "Add to project"
5. Skills are automatically applied based on your rules.md context

---

## Custom skill: CIE Map Builder
If Bob's community skills don't have a codebase mapping skill,
define it inline in the rules.md (already done).

The rules.md already tells Bob exactly how to:
- Structure module map JSON
- Detect module types (entry / service / util / test / config)
- Format edges for D3 consumption

This acts as a custom inline skill — no marketplace needed.

---

## Skill priority order for this project

1. **GitHub MCP** — without this, nothing works
2. **Test generation** — powers Wow Moment 3
3. **Code explanation** — powers Wow Moment 2
4. **Documentation generation** — powers the docs tab
5. **Dependency analysis** — improves impact accuracy

---

## Person C checklist for skills

- [ ] Test each skill in Bob before Day 1 PM
- [ ] Confirm test generation matches Jest output style (for expressjs/express)
- [ ] Confirm docs generation matches JSDoc format
- [ ] If a skill produces bad output — override it in rules.md (rules.md always wins)
- [ ] Document any skill that breaks or produces unexpected output
