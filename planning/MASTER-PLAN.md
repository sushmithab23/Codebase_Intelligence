# CIE — Master Project Plan
## Codebase Intelligence Engine — IBM Bob Dev Day Hackathon

**Team size:** 3 people  
**Time budget:** 2 days  
**Stack:** React frontend, Python/FastAPI backend, IBM Bob + GitHub MCP  
**Goal:** Win on all 4 judging criteria with 3 punchy demo moments

---

## The Three Demo Moments (never lose sight of these)

| # | Moment | What judge sees | Why it lands |
|---|---|---|---|
| 1 | Upload repo URL | Bob generates visual codebase map | Visually stunning, instant wow |
| 2 | Ask impact question | Map highlights affected modules | Novel, no tool does this |
| 3 | Click module → generate | Tests + docs appear for that module | Practical, measurable value |

---

## Team Roles

| Person | Role | Owns |
|---|---|---|
| Person A | Frontend | React UI, D3 map, demo polish |
| Person B | Backend | GitHub API, Bob integration, API endpoints |
| Person C | Bob + Demo | Rules file, Bob prompts, pitch, demo script |

---

## Phase Overview

```
Phase 0: Setup (2 hours) ────────────────── All 3 together
Phase 1: Core pipeline (Day 1 AM) ────────── Person B leads
Phase 2: Map UI (Day 1 PM) ────────────────── Person A leads  
Phase 3: Bob features (Day 1 PM) ──────────── Person C leads
Phase 4: Integration (Day 1 Eve) ──────────── All 3 together
Phase 5: Polish + demo (Day 2) ─────────────── All 3 together
Phase 6: Submission (Day 2 Eve) ────────────── Person C leads
```

---

## Phase 0 — Setup (2 hours, all together)

**Goal:** Everyone has a working dev environment before splitting

### Tasks
- [ ] Clone a shared repo (use expressjs/express as demo target)
- [ ] Set up GitHub PAT and test GitHub MCP in Bob
- [ ] Run `npx @modelcontextprotocol/server-github` and confirm Bob can list files
- [ ] Set up Playwright MCP for UI debugging
- [ ] Create React app (`npx create-react-app cie-frontend`)
- [ ] Create Python backend (see scaffold command below)
- [ ] Copy `.bob/rules.md` into project root
- [ ] All 3 people test Bob with: "List all files in github.com/expressjs/express"
- [ ] Agree on the demo repo (see recommendations below)

### Demo repo recommendations
| Repo | Why good |
|---|---|
| `expressjs/express` | Everyone knows it, clear module structure, good for impact demo |
| `axios/axios` | Clean structure, real-world JS, judges will recognise it |
| `fastify/fastify` | More complex, shows Bob handles scale |

**Pick ONE repo and use it for ALL demo moments. Consistency matters.**

---

## Phase 1 — Core Pipeline (Day 1 AM, Person B)

**Goal:** GitHub URL → file tree → Bob analysis → JSON output

### Tasks
- [ ] Build `/api/analyse` endpoint
  - Input: `{ repoUrl: "https://github.com/owner/repo" }`
  - Use GitHub API to fetch file tree
  - Send file tree + key file contents to Bob
  - Bob returns module map JSON (see rules file for schema)
  - Output: `{ modules: [], edges: [] }`
- [ ] Build `/api/impact` endpoint
  - Input: `{ repoUrl, functionName, filePath }`
  - Bob searches for all usages using GitHub MCP `search_code`
  - Bob returns structured impact report
  - Output: `{ callers: [], dependents: [], riskLevel, affectedModuleIds: [] }`
- [ ] Build `/api/generate` endpoint
  - Input: `{ repoUrl, moduleId, filePath, mode: "tests"|"docs"|"both" }`
  - Bob reads file content + detects test framework
  - Bob generates tests and/or docs
  - Output: `{ tests: "string", docs: "string", framework: "string" }`
- [ ] Test all 3 endpoints with `curl` or Postman before handing to Person A

### Backend scaffold (Python/FastAPI)

```bash
mkdir cie-backend && cd cie-backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install fastapi uvicorn httpx python-dotenv PyGithub anthropic
touch main.py .env
```

**Run the server:**
```bash
uvicorn main:app --reload --port 4000
```

**`.env` file:**
```
GITHUB_PAT=your_token_here
BOB_API_KEY=your_bob_key_here
```

**`main.py` skeleton:**
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx, os
from dotenv import load_dotenv

load_dotenv()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalyseRequest(BaseModel):
    repo_url: str

class ImpactRequest(BaseModel):
    repo_url: str
    function_name: str
    file_path: str

class GenerateRequest(BaseModel):
    repo_url: str
    file_path: str
    mode: str  # "tests" | "docs" | "both"

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/api/analyse")
async def analyse(req: AnalyseRequest):
    # 1. Parse owner/repo from URL
    # 2. Fetch file tree via GitHub API
    # 3. Send to Bob → get module map JSON
    # 4. Return { modules: [], edges: [] }
    pass

@app.post("/api/impact")
async def impact(req: ImpactRequest):
    # 1. Use GitHub API search_code to find usages
    # 2. Send to Bob → get impact report JSON
    # 3. Return { directCallers, affectedModuleIds, riskLevel }
    pass

@app.post("/api/generate")
async def generate(req: GenerateRequest):
    # 1. Fetch file contents via GitHub API
    # 2. Detect test framework (check requirements.txt / package.json)
    # 3. Send to Bob → get generated code
    # 4. Return { tests: str, docs: str, framework: str }
    pass
```

**GitHub API helper (add to main.py):**
```python
from github import Github

def get_github_client():
    return Github(os.getenv("GITHUB_PAT"))

def get_file_tree(owner: str, repo: str) -> list[str]:
    g = get_github_client()
    repository = g.get_repo(f"{owner}/{repo}")
    contents = repository.get_git_tree("HEAD", recursive=True)
    return [item.path for item in contents.tree if item.type == "blob"]

def get_file_content(owner: str, repo: str, path: str) -> str:
    g = get_github_client()
    repository = g.get_repo(f"{owner}/{repo}")
    file = repository.get_contents(path)
    return file.decoded_content.decode("utf-8")

def parse_repo_url(url: str) -> tuple[str, str]:
    # "https://github.com/expressjs/express" → ("expressjs", "express")
    parts = url.rstrip("/").split("/")
    return parts[-2], parts[-1]
```

### Bob prompt templates (Person B uses these in API calls)

**For map generation:**
```
You are analysing the repository at: {repoUrl}

Here is the file tree:
{fileTree}

Here are the contents of the key files:
{keyFileContents}

Return ONLY a JSON object with this exact schema:
{
  "modules": [
    { "id": "string", "label": "string", "files": ["string"], "type": "entry|service|util|test|config" }
  ],
  "edges": [
    { "from": "moduleId", "to": "moduleId", "type": "import|extends|calls" }
  ]
}

No explanation. No markdown. Just the JSON object.
```

**For impact analysis:**
```
You are a senior engineer on this codebase: {repoUrl}

The developer wants to change this function:
- Function: {functionName}
- File: {filePath}

Search the codebase and return ONLY a JSON object:
{
  "directCallers": [{ "file": "string", "line": number }],
  "indirectDependents": ["string"],
  "testsCovering": ["string"],
  "riskLevel": "low|medium|high",
  "riskReason": "string (max 20 words)",
  "affectedModuleIds": ["string"]
}
```

**For test + docs generation:**
```
You are generating {mode} for this file from {repoUrl}:

File path: {filePath}
Test framework detected: {framework}

File contents:
{fileContents}

Generate production-quality {mode} that:
- Matches the existing code style
- Covers happy path, edge cases, and failure scenarios
- Uses descriptive test names
- Includes inline comments explaining WHY each test exists

Return the generated code only. No explanation.
```

---

## Phase 2 — Map UI (Day 1 PM, Person A)

**Goal:** Render the module map visually with D3.js. Make it beautiful.

### Tasks
- [ ] Install D3: `npm install d3`
- [ ] Build `<CodebaseMap />` component
  - Render nodes as rounded rectangles, colour-coded by type:
    - `entry` → blue (#378ADD)
    - `service` → teal (#1D9E75)
    - `util` → gray (#888780)
    - `test` → amber (#BA7517)
    - `config` → purple (#7F77DD)
  - Render edges as curved arrows between nodes
  - Support click on any node → fires `onModuleClick(moduleId)`
- [ ] Build `<ImpactOverlay />` component
  - Accepts `affectedModuleIds[]`
  - Highlights those nodes in coral (#D85A30) with a pulsing ring
  - All other nodes dim to 30% opacity
- [ ] Build `<RepoInput />` component
  - Text input for GitHub URL
  - "Analyse with Bob" button
  - Loading state with Bob logo animation
- [ ] Build `<GeneratePanel />` component
  - Shows when a module is clicked
  - Two buttons: "Generate Tests" and "Generate Docs"
  - Tabbed output: Tests tab | Docs tab
  - Syntax-highlighted code output (use `react-syntax-highlighter`)

### D3 layout tip
Use `d3.forceSimulation` with:
- `forceLink` for edges
- `forceManyBody` strength -300
- `forceCenter` to keep graph centred
- `forceCollide` radius 80 to prevent node overlap

---

## Phase 3 — Bob Features (Day 1 PM, Person C)

**Goal:** Polish Bob's outputs and prepare the demo script

### Tasks
- [ ] Test the Bob prompts from Phase 1 with the chosen demo repo
- [ ] Tune the rules file if Bob outputs are off
- [ ] Manually run the 3 demo moments end-to-end and note any rough edges
- [ ] Write the demo script (see Phase 5)
- [ ] Prepare the pitch narrative (see Phase 6)
- [ ] Find the best function in the demo repo for the impact analysis demo
  - Good candidate: a function called by many other modules
  - For expressjs/express: try `router.handle` or `app.use`
- [ ] Screenshot Bob outputs that look great — use as fallback if live demo breaks

---

## Phase 4 — Integration (Day 1 Evening, all together)

**Goal:** Frontend talks to backend, full flow works end-to-end

### Tasks
- [ ] Connect `<RepoInput />` → `/api/analyse` → `<CodebaseMap />`
- [ ] Connect node click → `/api/impact` → `<ImpactOverlay />`
- [ ] Connect module click → `/api/generate` → `<GeneratePanel />`
- [ ] Run full demo flow 3 times and fix every bug
- [ ] Check on mobile — judges may look at phones during demo
- [ ] Add error states (what if GitHub API rate limits?)
- [ ] Add loading spinners — demo must never look frozen

### Integration checklist
- [ ] Repo URL input → map renders in under 10 seconds
- [ ] Impact query → map highlights in under 5 seconds
- [ ] Generate → code appears in under 15 seconds
- [ ] No console errors visible in browser
- [ ] Works on Chrome (judges will use Chrome)

---

## Phase 5 — Polish + Demo Rehearsal (Day 2 AM, all together)

**Goal:** Demo is smooth, confident, and under 3 minutes

### Demo script (word for word)

**[0:00 — 0:30] The problem**
> "Every developer has been here — you join a new repo, or you need to change a function, and you have no idea where anything lives or what will break. Today we're going to fix that."

**[0:30 — 1:00] Wow moment 1 — the map**
> "This is CIE, powered by IBM Bob. I paste in a GitHub URL — we're using the Express.js framework — and Bob reads the entire repository."
> *[type URL, click Analyse, map appears]*
> "In seconds, Bob has mapped every module, every dependency, every connection. No config. No setup. Just understanding."

**[1:00 — 1:45] Wow moment 2 — impact analysis**
> "Now watch this. I ask Bob: what breaks if I change the router.handle function?"
> *[type question, hit enter, map highlights]*
> "Bob instantly shows me exactly which modules are affected — highlighted in red. This is not a generic answer. Bob read the actual code and traced every real dependency."

**[1:45 — 2:30] Wow moment 3 — generate**
> "Now I click on the middleware module. With one click, Bob generates a complete test suite — happy paths, edge cases, failure scenarios — matched to the existing Jest framework in this repo."
> *[click module, click Generate Tests, code appears]*
> "And the same for documentation. Everything grounded in what the code actually does."

**[2:30 — 3:00] The impact**
> "Onboarding that used to take days — done in minutes. Test coverage that used to mean blank files — done instantly. Impact analysis that used to mean grep and prayer — done with one question. CIE plus IBM Bob — codebase intelligence for every developer, at any skill level."

### Polish tasks
- [ ] Rehearse demo 5 times minimum
- [ ] Time each section — must be under 3 minutes total
- [ ] Prepare a backup: record a screen recording in case live demo breaks
- [ ] Make sure the map looks beautiful — resize nodes if needed
- [ ] Confirm all 3 people know their role during the presentation

---

## Phase 6 — Submission (Day 2 PM/Eve, Person C leads)

**Goal:** Submit everything on time, correctly formatted

### Submission checklist
- [ ] Demo video recorded (backup)
- [ ] GitHub repo link ready (make public)
- [ ] README written (see below)
- [ ] Submission form filled in before deadline
- [ ] All team members listed correctly

### README template
```markdown
# CIE — Codebase Intelligence Engine
> Powered by IBM Bob | IBM Bob Dev Day Hackathon

## What it does
CIE helps developers understand, navigate, and improve large codebases 10x faster.
Point it at any GitHub repo and get: a visual module map, instant impact analysis,
and auto-generated tests and documentation — all powered by IBM Bob's full repository context.

## Demo flow
1. Paste a GitHub URL → Bob maps the codebase visually
2. Ask "what breaks if I change X?" → Bob highlights affected modules on the map
3. Click any module → Bob generates tests and docs instantly

## Tech stack
- Frontend: React + D3.js
- Backend: Python + FastAPI + PyGithub
- AI: IBM Bob + watsonx
- MCP: GitHub MCP Server, Playwright MCP Server

## Team
- [Name] — Frontend
- [Name] — Backend
- [Name] — Bob integration + pitch

## Setup
1. Clone this repo
2. Add your GitHub PAT to `cie-backend/.env`
3. Frontend: `cd cie-frontend && npm install && npm start`
4. Backend: `cd cie-backend && pip install -r requirements.txt && uvicorn main:app --reload --port 4000`
5. Open http://localhost:3000
```

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| GitHub API rate limit during demo | Medium | Use a PAT, cache the response after first load |
| D3 graph looks messy for complex repos | High | Use expressjs/express — it's well-structured. Test the graph before demo day |
| Bob takes too long (>15s) | Low | Show a loading animation, pre-cache the demo repo response |
| Live demo breaks | Medium | Record a screen capture backup the night before |
| Map not highlighting correctly | Medium | Hardcode the highlight for the demo repo as a fallback |

---

## What judges will score you on

| Criterion | What to show | Your evidence |
|---|---|---|
| Completeness (5pts) | Working PoC, clear IBM Bob integration | Live demo of all 3 moments |
| Creativity (5pts) | Impact analysis on map is novel | "No other tool does this" — say it explicitly |
| Usability (5pts) | One URL input, zero config | Judge can use it in 30 seconds |
| Effectiveness (5pts) | Measurable time saved | "Onboarding: days → minutes. Tests: hours → seconds." |
