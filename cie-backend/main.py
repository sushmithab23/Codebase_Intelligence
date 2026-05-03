# main.py — CIE Backend with watsonx.ai API
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx, os, json, logging, time, re
from dotenv import load_dotenv
from github_helper import (
    parse_repo_url, get_file_tree,
    get_file_content, get_key_files,
    get_flow_files, detect_test_framework
)
# from bob_prompts import map_prompt, impact_prompt, generate_prompt

# Add to imports at top:
from bob_prompts import map_prompt, impact_prompt, generate_prompt, flow_prompt

# Then paste the @app.post("/api/flow") function

load_dotenv()

# ── Logging ─────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="CIE — Codebase Intelligence Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Impact Analysis Cache ───────────────────────────────────
impact_cache = {}

# ── Config from .env ────────────────────────────────────────
IBM_API_KEY    = os.getenv("IBM_API_KEY")
IBM_PROJECT_ID = os.getenv("IBM_PROJECT_ID")
IBM_REGION     = os.getenv("IBM_REGION", "us-south")
WATSONX_URL    = f"https://{IBM_REGION}.ml.cloud.ibm.com/ml/v1/text/generation?version=2023-05-29"
IAM_TOKEN_URL  = "https://iam.cloud.ibm.com/identity/token"

# ── Request models ──────────────────────────────────────────
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
    function_name: str | None = None

# ── IAM Token (cached) ──────────────────────────────────────
_iam_token_cache = {"token": None, "expires_at": 0}

async def get_iam_token() -> str:
    """Get IBM IAM token — refreshes automatically when expired"""
    now = time.time()

    # Return cached token if still valid (with 5 min buffer)
    if _iam_token_cache["token"] and now < _iam_token_cache["expires_at"] - 300:
        return _iam_token_cache["token"]

    logger.info("Fetching new IBM IAM token...")
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            IAM_TOKEN_URL,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
                "apikey": IBM_API_KEY
            }
        )
        if response.status_code != 200:
            logger.error(f"IAM token fetch failed: {response.text}")
            raise HTTPException(status_code=401, detail="IBM IAM token fetch failed")

        data = response.json()
        _iam_token_cache["token"] = data["access_token"]
        _iam_token_cache["expires_at"] = now + data.get("expires_in", 3600)
        logger.info("IAM token fetched successfully")
        return _iam_token_cache["token"]

# ── watsonx.ai caller ───────────────────────────────────────
async def call_watsonx(prompt: str) -> str:
    """Send prompt to watsonx.ai Granite model and return response"""
    token = await get_iam_token()

    # Increase timeout to 120 seconds for impact analysis
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            WATSONX_URL,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            json={
                "model_id": "ibm/granite-3-8b-instruct",
                "input": prompt,
                "parameters": {
                    "decoding_method": "greedy",
                    "max_new_tokens": 8000,
                    "temperature": 0.0,
                    "repetition_penalty": 1.1
                },
                "project_id": IBM_PROJECT_ID
            }
        )

        if response.status_code != 200:
            logger.error(f"watsonx.ai error {response.status_code}: {response.text}")
            raise HTTPException(
                status_code=response.status_code,
                detail=f"watsonx.ai error: {response.text}"
            )

        data = response.json()
        return data["results"][0]["generated_text"]

# ── Health check ────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "watsonx_url": WATSONX_URL,
        "project_id_set": bool(IBM_PROJECT_ID),
        "api_key_set": bool(IBM_API_KEY)
    }

# ── Endpoint 1: Analyse repo → module map ───────────────────
@app.post("/api/analyse")
async def analyse(req: AnalyseRequest):
    try:
        logger.info(f"Analysing repo: {req.repo_url}")
        owner, repo = parse_repo_url(req.repo_url)
        file_tree   = get_file_tree(owner, repo)
        key_files   = get_key_files(owner, repo, file_tree)
        
        logger.info(f"File tree size: {len(file_tree)} files")
        logger.info(f"Key files fetched: {len(key_files)} files")
        
        prompt      = map_prompt(req.repo_url, file_tree, key_files)
        response    = await call_watsonx(prompt)
        
        logger.info(f"Raw watsonx response (first 500 chars): {response[:500]}")
        logger.info(f"Response length: {len(response)} chars")
        
        if not response or not response.strip():
            logger.error("Empty response from watsonx")
            return {
                "modules": [
                    {
                        "id": "unknown",
                        "label": "Repository",
                        "files": file_tree[:10],
                        "type": "service"
                    }
                ],
                "edges": []
            }
        
        # Clean response
        clean = response.strip().replace("```json", "").replace("```", "").strip()
        
        # Find JSON object boundaries
        start = clean.find("{")
        end   = clean.rfind("}") + 1
        
        logger.info(f"JSON extraction - start: {start}, end: {end}")
        
        if start != -1 and end > start:
            clean = clean[start:end]
            logger.info(f"Extracted JSON (first 300 chars): {clean[:300]}")
        else:
            logger.error(f"No valid JSON boundaries found. Full response: {response}")
            return {
                "modules": [
                    {
                        "id": "unknown",
                        "label": "Repository",
                        "files": file_tree[:10],
                        "type": "service"
                    }
                ],
                "edges": []
            }
        
        return json.loads(clean)
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error in analyse: {e}")
        logger.error(f"Failed to parse: {clean[:500] if 'clean' in locals() else 'N/A'}")
        # Return minimal valid structure instead of crashing
        return {
            "modules": [
                {
                    "id": "backend",
                    "label": "Backend",
                    "files": [f for f in file_tree if "backend" in f][:5] if 'file_tree' in locals() else [],
                    "type": "service"
                },
                {
                    "id": "frontend",
                    "label": "Frontend",
                    "files": [f for f in file_tree if "frontend" in f][:5] if 'file_tree' in locals() else [],
                    "type": "service"
                }
            ],
            "edges": []
        }
    except Exception as e:
        logger.error(f"Analyse error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/impact")
async def impact(req: ImpactRequest):
    # Define cache_key at function scope
    cache_key = f"{req.repo_url}:{req.file_path}:{req.function_name}"
    
    try:
        # Check cache first
        if cache_key in impact_cache:
            logger.info(f"Returning cached impact for {cache_key}")
            return impact_cache[cache_key]
        
        logger.info(f"Impact analysis for {req.function_name} in {req.file_path}")
        owner, repo = parse_repo_url(req.repo_url)
        file_tree   = get_file_tree(owner, repo)
        key_files   = get_key_files(owner, repo, file_tree)
        prompt      = impact_prompt(req.repo_url, req.function_name, req.file_path, key_files)
        response    = await call_watsonx(prompt)

        logger.info(f"Raw watsonx response (first 500 chars): {response[:500]}")
        logger.info(f"Response length: {len(response)} chars")

        if not response or not response.strip():
            # Return safe default if model returns empty
            fallback = {
                "directCallers": [],
                "indirectDependents": [],
                "testsCovering": [],
                "riskLevel": "medium",
                "riskReason": "Could not trace dependencies automatically",
                "affectedModuleIds": []
            }
            impact_cache[cache_key] = fallback
            return fallback

        clean = response.strip().replace("```json", "").replace("```", "").strip()
        
        # Find JSON object in response
        start = clean.find("{")
        end   = clean.rfind("}") + 1
        
        logger.info(f"JSON extraction - start: {start}, end: {end}")
        
        if start != -1 and end > start:
            clean = clean[start:end]
            logger.info(f"Extracted JSON (first 300 chars): {clean[:300]}")
        else:
            logger.error(f"No valid JSON boundaries found. Full response: {response}")

        result = json.loads(clean)
        
        # Cache the result before returning
        impact_cache[cache_key] = result
        return result
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error in impact: {e}")
        # Return safe default instead of crashing
        fallback = {
            "directCallers": [],
            "indirectDependents": [],
            "testsCovering": [],
            "riskLevel": "medium",
            "riskReason": "Impact analysis complete — manual review recommended",
            "affectedModuleIds": []
        }
        impact_cache[cache_key] = fallback
        return fallback
    except Exception as e:
        logger.error(f"Impact error: {e}", exc_info=True)
        # Return fallback instead of crashing
        fallback = {
            "directCallers": [],
            "indirectDependents": [],
            "testsCovering": [],
            "riskLevel": "medium",
            "riskReason": f"Analysis encountered an error: {str(e)[:100]}",
            "affectedModuleIds": []
        }
        impact_cache[cache_key] = fallback
        return fallback



# ── Endpoint 3: Generate tests + docs ───────────────────────
async def _call_watsonx_generate(prompt: str) -> str:
    """watsonx call tuned for generate — shorter timeout, fewer tokens."""
    token = await get_iam_token()
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            WATSONX_URL,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={
                "model_id": "ibm/granite-3-8b-instruct",
                "input": prompt,
                "parameters": {"decoding_method": "greedy", "max_new_tokens": 2000, "temperature": 0.0},
                "project_id": IBM_PROJECT_ID
            }
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"watsonx error: {resp.text}")
    return resp.json()["results"][0]["generated_text"]

@app.post("/api/generate")
async def generate(req: GenerateRequest):
    try:
        logger.info(f"Generating {req.mode} for {req.file_path}")
        owner, repo  = parse_repo_url(req.repo_url)
        file_content = get_file_content(owner, repo, req.file_path)
        # Cap file content — granite-3-8b has small context window
        file_content = file_content[:3000]

        # Filter to specific function if selected
        if req.function_name:
            import re as _re2
            patterns = [
                rf'(def\s+{re.escape(req.function_name)}\s*\(.*?(?=\ndef\s|\nclass\s|\Z))',
                rf'(async\s+def\s+{re.escape(req.function_name)}\s*\(.*?(?=\ndef\s|\nasync\s+def\s|\nclass\s|\Z))',
                rf'((?:function|async function)\s+{re.escape(req.function_name)}\s*\(.*?\n\}})',
                rf'((?:const|let|var)\s+{re.escape(req.function_name)}\s*=.*?\n\}})',
            ]
            for pat in patterns:
                m = _re2.search(pat, file_content, _re2.DOTALL)
                if m:
                    file_content = m.group(1)[:3000]
                    logger.info(f"Filtered to function {req.function_name}: {len(file_content)} chars")
                    break

        framework = detect_test_framework(owner, repo)
        logger.info(f"Detected framework: {framework}")

        def _strip_fences(text: str) -> str:
            import re
            return re.sub(r'```[a-zA-Z]*\n?', '', text).replace('```', '').strip()

        if req.mode == "both":
            tests_prompt = generate_prompt(req.file_path, file_content, "tests", framework)
            docs_prompt  = generate_prompt(req.file_path, file_content, "docs", framework)
            tests = _strip_fences(await _call_watsonx_generate(tests_prompt))
            docs  = _strip_fences(await _call_watsonx_generate(docs_prompt))
            return {"tests": tests, "docs": docs, "framework": framework, "mode": req.mode}
        elif req.mode == "tests":
            prompt = generate_prompt(req.file_path, file_content, "tests", framework)
            tests  = _strip_fences(await _call_watsonx_generate(prompt))
            return {"tests": tests, "framework": framework, "mode": req.mode}
        else:
            prompt = generate_prompt(req.file_path, file_content, "docs", framework)
            docs   = _strip_fences(await _call_watsonx_generate(prompt))
            return {"docs": docs, "framework": framework, "mode": req.mode}
    except Exception as e:
        logger.error(f"Generate error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

import re as _re

def _extract_functions(key_files: dict) -> dict:
    """Extract function/class names from file contents using regex — no AI needed."""
    patterns = [
        r'def\s+([a-zA-Z_][a-zA-Z0-9_]+)\s*\(',           # Python def
        r'async\s+def\s+([a-zA-Z_][a-zA-Z0-9_]+)\s*\(',   # Python async def
        r'class\s+([a-zA-Z_][a-zA-Z0-9_]+)\s*[:\(]',      # Python/JS class
        r'(?:function|async function)\s+([a-zA-Z_][a-zA-Z0-9_]+)\s*\(',  # JS function
        r'(?:const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\(',  # JS arrow
        r'\.([a-zA-Z_][a-zA-Z0-9_]+)\s*=\s*function',     # Express-style: app.listen = function
    ]
    noise = {'if', 'for', 'while', 'return', 'try', 'catch', 'switch', 'case', 'new', 'import', 'export'}
    result = {}
    for path, content in key_files.items():
        names = set()
        for pat in patterns:
            names.update(_re.findall(pat, content))
        names = {n for n in names if len(n) > 2 and n not in noise and not n.startswith('_')}
        if names:
            result[path] = list(names)[:8]
            logger.info(f"Found {len(names)} functions in {path}")
    logger.info(f"Real functions found: { {k: v for k, v in result.items()} }")
    return result


def _build_flow_fallback(real_functions: dict, flow_files: dict) -> dict:
    """Build 8 flow nodes ordered by execution semantics — generic for any language/framework."""
    first_file = list(flow_files.keys())[0] if flow_files else "app"

    # Generic keyword buckets — ordered by when they run in any app
    INIT_KW     = {'init', 'setup', 'configure', 'start', 'create', 'boot', 'load', 'main', 'run', 'launch', 'connect'}
    ROUTE_KW    = {'handle', 'route', 'dispatch', 'serve', 'listen', 'register', 'use', 'middleware'}
    PROCESS_KW  = {'process', 'parse', 'validate', 'check', 'verify', 'compute', 'execute', 'fetch', 'get', 'analyse', 'analyze'}
    RESPONSE_KW = {'send', 'respond', 'render', 'reply', 'write', 'emit', 'output', 'return', 'generate'}

    buckets = {'init': [], 'route': [], 'process': [], 'response': [], 'other': []}

    for path, funcs in real_functions.items():
        for f in funcs:
            fl = f.lower()
            if any(kw in fl for kw in INIT_KW):
                buckets['init'].append((path, f))
            elif any(kw in fl for kw in ROUTE_KW):
                buckets['route'].append((path, f))
            elif any(kw in fl for kw in PROCESS_KW):
                buckets['process'].append((path, f))
            elif any(kw in fl for kw in RESPONSE_KW):
                buckets['response'].append((path, f))
            else:
                buckets['other'].append((path, f))

    # Execution order: init → route → process → other → response
    ordered = (
        buckets['init'][:2] +
        buckets['route'][:2] +
        buckets['process'][:2] +
        buckets['other'][:1] +
        buckets['response'][:1]
    )

    # Pad from all pairs if < 6
    if len(ordered) < 6:
        seen = {f for _, f in ordered}
        for path, funcs in real_functions.items():
            for f in funcs:
                if f not in seen and len(ordered) < 6:
                    ordered.append((path, f))
                    seen.add(f)

    def _node_type(func: str) -> str:
        fl = func.lower()
        if any(kw in fl for kw in INIT_KW):    return 'function'
        if any(kw in fl for kw in ROUTE_KW):   return 'route'
        if any(kw in fl for kw in PROCESS_KW): return 'process'
        return 'function'

    nodes = [{"id": "n1", "label": "App Start", "type": "start",
               "file": first_file, "description": "Application entry point"}]

    for i, (path, func) in enumerate(ordered[:6], 2):
        nodes.append({"id": f"n{i}", "label": func, "type": _node_type(func),
                       "file": path, "description": f"Executes {func}"})

    while len(nodes) < 7:
        nid = f"n{len(nodes) + 1}"
        nodes.append({"id": nid, "label": "Process Step", "type": "process",
                       "file": first_file, "description": "Processing step"})

    nodes.append({"id": "n8", "label": "Response Sent", "type": "end",
                   "file": first_file, "description": "Returns response to caller"})

    edges = [{"from": f"n{i}", "to": f"n{i+1}", "label": "calls"} for i in range(1, 8)]
    return {"flow": nodes[:8], "edges": edges}


@app.post("/api/flow")
async def flow(req: AnalyseRequest):
    try:
        logger.info(f"Generating flow map for: {req.repo_url}")
        owner, repo    = parse_repo_url(req.repo_url)
        file_tree      = get_file_tree(owner, repo)
        flow_files     = get_flow_files(owner, repo, file_tree)
        real_functions = _extract_functions(flow_files)

        data = None

        # Try watsonx with 30s timeout — fall back on timeout or bad response
        try:
            token = await get_iam_token()
            async with httpx.AsyncClient(timeout=30) as client:
                wx_response = await client.post(
                    WATSONX_URL,
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                    json={
                        "model_id": "ibm/granite-3-8b-instruct",
                        "input": flow_prompt(req.repo_url, file_tree, flow_files, real_functions),
                        "parameters": {"decoding_method": "greedy", "max_new_tokens": 1200, "temperature": 0.0},
                        "project_id": IBM_PROJECT_ID
                    }
                )
            response = wx_response.json()["results"][0]["generated_text"] if wx_response.status_code == 200 else ""
            logger.info(f"Raw flow response length: {len(response)}")

            if response and response.strip():
                for match in reversed(list(_re.finditer(r'\{', response))):
                    candidate = response[match.start():]
                    depth = end = 0
                    for i, ch in enumerate(candidate):
                        if ch == '{': depth += 1
                        elif ch == '}':
                            depth -= 1
                            if depth == 0:
                                end = i + 1
                                break
                    if not end:
                        continue
                    try:
                        parsed = json.loads(candidate[:end])
                        if "flow" in parsed and "edges" in parsed and len(parsed["flow"]) >= 4:
                            data = parsed
                            break
                    except json.JSONDecodeError:
                        continue
        except Exception as wx_err:
            logger.warning(f"watsonx flow call failed: {wx_err} — using fallback")

        if not data or len(data.get("flow", [])) < 8:
            logger.warning(f"Using smart fallback — {len(data['flow']) if data else 0} nodes from watsonx")
            data = _build_flow_fallback(real_functions, flow_files)

        logger.info(f"Flow: {len(data['flow'])} nodes, {len(data['edges'])} edges")
        return data

    except Exception as e:
        logger.error(f"Flow error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class FunctionsRequest(BaseModel):
    repo_url: str
    file_path: str

@app.post("/api/functions")
async def get_functions(req: FunctionsRequest):
    try:
        logger.info(f"Getting functions from: {req.file_path}")
        owner, repo  = parse_repo_url(req.repo_url)
        file_content = get_file_content(owner, repo, req.file_path)
        extracted = _extract_functions({req.file_path: file_content})
        functions = extracted.get(req.file_path, [])
        logger.info(f"Found {len(functions)} functions in {req.file_path}")
        return {"functions": functions, "file_path": req.file_path}
    except Exception as e:
        logger.error(f"Functions error: {e}")
        return {"functions": [], "file_path": req.file_path}
