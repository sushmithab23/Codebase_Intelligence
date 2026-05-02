# CIE — Full Installation Guide
## Step-by-Step Setup for Windows & Mac

---

## What you need to install

| Tool | Purpose | Required? |
|---|---|---|
| Python 3.10+ | Runs the FastAPI backend | YES |
| Node.js 18+ | Runs the React frontend | YES |
| Git | Clone and manage the repo | YES |
| VS Code | Code editor + IBM Bob extension | YES |
| GitHub PAT | Authenticate GitHub API calls | YES |

---

## STEP 1 — Install Python

### Windows
1. Go to https://www.python.org/downloads/
2. Click **"Download Python 3.x.x"** (latest 3.10+ version)
3. Run the installer
4. ⚠️ **IMPORTANT:** Tick **"Add Python to PATH"** before clicking Install
5. Click **Install Now**
6. Open **Command Prompt** and verify:
```bash
python --version
pip --version
```
Both should show version numbers. If not, restart your computer and try again.

### Mac
```bash
brew install python
```
No Homebrew? Install it first:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
Verify:
```bash
python3 --version
pip3 --version
```

---

## STEP 2 — Install Node.js

### Windows
1. Go to https://nodejs.org
2. Download the **LTS** version (left button — more stable)
3. Run the installer → click Next → Next → Finish
4. Open **Command Prompt** and verify:
```bash
node --version
npm --version
```

### Mac
```bash
brew install node
```
Verify:
```bash
node --version
npm --version
```

---

## STEP 3 — Install Git

### Windows
1. Go to https://git-scm.com/download/win
2. Download and run the installer
3. Leave all settings as default → click Next through everything
4. Verify in **Command Prompt**:
```bash
git --version
```

### Mac
Git usually comes pre-installed. Verify:
```bash
git --version
```
If not installed:
```bash
brew install git
```

---

## STEP 4 — Install VS Code

1. Go to https://code.visualstudio.com/
2. Download for your OS and install
3. Open VS Code
4. Install the **IBM Bob extension** from the Extensions marketplace (Ctrl+Shift+X)
5. Sign in to IBM Bob when prompted

---

## STEP 5 — Set up your project folder structure

### Windows (Command Prompt)
```bash
mkdir cie-project
cd cie-project
mkdir cie-frontend
mkdir cie-backend
mkdir .bob
mkdir mcp
mkdir planning
```

### Mac (Terminal)
```bash
mkdir cie-project && cd cie-project
mkdir cie-frontend cie-backend .bob mcp planning
```

Now copy your downloaded files into the right places:

| Downloaded file | Copy it to |
|---|---|
| `rules.md` | `cie-project/.bob/rules.md` |
| `bob-mcp-config.json` | `cie-project/mcp/bob-mcp-config.json` |
| `mcp-servers.md` | `cie-project/mcp/mcp-servers.md` |
| `requirements.txt` | `cie-project/cie-backend/requirements.txt` |
| `MASTER-PLAN.md` | `cie-project/planning/MASTER-PLAN.md` |
| `SKILLS-REFERENCE.md` | `cie-project/planning/SKILLS-REFERENCE.md` |
| `QUICK-REFERENCE.md` | `cie-project/planning/QUICK-REFERENCE.md` |
| `PHASE-0-SETUP.md` | `cie-project/planning/PHASE-0-SETUP.md` |
| `README.md` | `cie-project/README.md` |

---

## STEP 6 — Set up the Python backend

Open a terminal / Command Prompt and navigate to your backend folder:

### Windows
```bash
cd cie-project\cie-backend
python -m venv venv
venv\Scripts\activate
```
You should see `(venv)` appear at the start of your terminal line. This means the virtual environment is active.

```bash
pip install -r requirements.txt
```
Wait for all packages to install. This takes 1-2 minutes.

### Mac
```bash
cd cie-project/cie-backend
python3 -m venv venv
source venv/bin/activate
```
You should see `(venv)` appear at the start of your terminal line.

```bash
pip install -r requirements.txt
```

### Create the .env file

**Windows:**
```bash
echo GITHUB_PAT=your_token_here> .env
echo BOB_API_KEY=your_bob_key_here>> .env
```

**Mac:**
```bash
touch .env
echo "GITHUB_PAT=your_token_here" >> .env
echo "BOB_API_KEY=your_bob_key_here" >> .env
```

You will replace `your_token_here` in STEP 8 below.

### Create a basic main.py to test the server

**Windows:**
```bash
echo from fastapi import FastAPI > main.py
echo app = FastAPI() >> main.py
echo. >> main.py
echo @app.get("/health") >> main.py
echo def health(): >> main.py
echo     return {"status": "ok"} >> main.py
```

**Mac:**
```bash
cat > main.py << 'EOF'
from fastapi import FastAPI

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}
EOF
```

### Test the backend runs
```bash
uvicorn main:app --reload --port 4000
```
Open your browser at `http://localhost:4000/health`
You should see: `{"status":"ok"}` ✅

Open `http://localhost:4000/docs`
You should see the FastAPI interactive docs page ✅

Press `Ctrl+C` to stop the server when done.

---

## STEP 7 — Set up the React frontend

Open a **new terminal window** (keep the backend terminal for later).

### Both Windows and Mac
```bash
npx create-react-app cie-frontend
```
This takes 2-3 minutes. Say YES if it asks to install `create-react-app`.

```bash
cd cie-frontend
npm install d3 react-syntax-highlighter axios
```

### Test the frontend runs
```bash
npm start
```
Your browser should automatically open `http://localhost:3000`
You should see the default React welcome page ✅

Press `Ctrl+C` to stop when done.

---

## STEP 8 — Get your GitHub Personal Access Token

1. Open your browser and go to: https://github.com/settings/tokens
2. Click **"Generate new token"** → select **"Generate new token (classic)"**
3. Fill in:
   - **Note:** `CIE Hackathon`
   - **Expiration:** 7 days (enough for the hackathon)
   - **Scopes:** Tick only `repo` → expand and tick `public_repo`
4. Scroll down and click **"Generate token"**
5. ⚠️ **Copy the token immediately** — GitHub only shows it once!
6. Open your `.env` file in `cie-backend/` and replace `your_token_here`:
```
GITHUB_PAT=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
BOB_API_KEY=your_bob_key_here
```

---

## STEP 9 — Configure IBM Bob MCP

1. Open VS Code
2. Open the IBM Bob panel (click Bob icon in sidebar)
3. Click the **Settings / gear icon**
4. Find the **MCP Servers** section
5. Click **"Add MCP config"** or **"Import config file"**
6. Point it to your `cie-project/mcp/bob-mcp-config.json` file
7. Bob will ask to install the GitHub MCP server — click **Allow**

### Load the rules file into Bob
1. In Bob settings, find **"Rules"** or **"Custom instructions"**
2. Click **"Import rules file"**
3. Select `cie-project/.bob/rules.md`
4. Save settings

### Test Bob is working
In the Bob chat panel, type:
```
List all files in https://github.com/expressjs/express
```
If Bob returns a list of files → MCP is working ✅
If Bob says it cannot access GitHub → check your PAT token in `bob-mcp-config.json`

---

## STEP 10 — Final verification checklist

Run through this before the hackathon starts:

### Terminal checks
Open a terminal and run each command:

```bash
python --version
# Should show: Python 3.10.x or higher

node --version
# Should show: v18.x.x or higher

npm --version
# Should show: 9.x.x or higher

git --version
# Should show: git version 2.x.x
```

### Backend check
```bash
# Windows:
cd cie-project\cie-backend
venv\Scripts\activate
uvicorn main:app --reload --port 4000

# Mac:
cd cie-project/cie-backend
source venv/bin/activate
uvicorn main:app --reload --port 4000
```
Visit `http://localhost:4000/health` → should return `{"status":"ok"}` ✅

### Frontend check
Open a second terminal:
```bash
cd cie-project/cie-frontend
npm start
```
Visit `http://localhost:3000` → React app loads ✅

### Bob check
In IBM Bob:
```
List all files in https://github.com/expressjs/express
```
Bob returns file list ✅

---

## Common Errors and Fixes

### "python is not recognised" (Windows)
Python was not added to PATH during install.
Fix: Uninstall Python, reinstall, and tick **"Add Python to PATH"** this time.

### "npm is not recognised" (Windows)
Node.js was not installed correctly.
Fix: Reinstall Node.js from https://nodejs.org and restart Command Prompt.

### "(venv) not appearing after activate"
Virtual environment was not created properly.
Fix:
```bash
rm -rf venv          # Mac
rmdir /s venv        # Windows
python -m venv venv
```
Then activate again.

### "pip install fails with error"
Usually a network or permission issue.
Fix:
```bash
pip install -r requirements.txt --trusted-host pypi.org --trusted-host files.pythonhosted.org
```

### "uvicorn: command not found"
Uvicorn is not installed or venv is not active.
Fix: Make sure `(venv)` is showing in your terminal, then:
```bash
pip install uvicorn
```

### "Bob cannot access GitHub"
The GitHub PAT is missing or wrong in the MCP config.
Fix:
1. Open `mcp/bob-mcp-config.json`
2. Replace `YOUR_PAT_TOKEN_HERE` with your actual token
3. Restart Bob

### "Port 4000 already in use"
Something else is running on port 4000.
Fix:
```bash
uvicorn main:app --reload --port 4001
```
Then update your frontend API calls to use port 4001.

### "Port 3000 already in use"
Something else is running on port 3000.
Fix: React will automatically ask if you want to use port 3001 — type `Y` and press Enter.

---

## You are ready! 🎉

Both terminals running:
- ✅ Backend at `http://localhost:4000`
- ✅ Frontend at `http://localhost:3000`
- ✅ Bob connected to GitHub MCP
- ✅ Rules file loaded into Bob

Go build CIE! 🚀
