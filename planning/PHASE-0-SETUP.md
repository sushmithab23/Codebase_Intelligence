# Phase 0 — Setup
**Duration:** 2 hours | **Who:** All 3 together | **When:** Day 1 start

## Goal
Every team member has a working environment before anyone splits off.
No one should be debugging their setup while others are building.

## Checklist

### Environment
- [ ] Node.js 18+ installed on all machines
- [ ] Git configured and shared repo created (private GitHub repo)
- [ ] VS Code + Bob extension installed and logged in
- [ ] GitHub Personal Access Token created (repo read scope only)

### Bob setup
- [ ] Copy `.bob/rules.md` into project root
- [ ] Copy `mcp/bob-mcp-config.json` into Bob settings
- [ ] Test: ask Bob "list all files in github.com/expressjs/express"
- [ ] Confirm Bob returns a file tree (MCP working)

### Frontend scaffold
```bash
npx create-react-app cie-frontend
cd cie-frontend
npm install d3 react-syntax-highlighter axios
npm start
```

### Backend scaffold
```bash
mkdir cie-backend && cd cie-backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install fastapi uvicorn httpx python-dotenv PyGithub anthropic
touch main.py .env
uvicorn main:app --reload --port 4000
```

### Shared decisions (write these down!)
- [ ] Demo repo URL: _______________
- [ ] Demo function for impact analysis: _______________
- [ ] Who presents: _______________
- [ ] Backup video: who records it and when: _______________

## Done when
Person A can see `http://localhost:3000` with a blank React app.
Person B can hit `http://localhost:4000/health` and get `{"status":"ok"}` from FastAPI.
Person C can ask Bob a question about the demo repo and get a real answer.
