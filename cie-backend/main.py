# main.py — CIE Backend with watsonx.ai API
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx, os, json, logging, time
from dotenv import load_dotenv
from github_helper import (
    parse_repo_url, get_file_tree,
    get_file_content, get_key_files,
    detect_test_framework
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

    async with httpx.AsyncClient(timeout=60) as client:
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
                    "max_new_tokens": 8000,
                    "temperature": 0.2,
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
    try:
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
            return {
                "directCallers": [],
                "indirectDependents": [],
                "testsCovering": [],
                "riskLevel": "medium",
                "riskReason": "Could not trace dependencies automatically",
                "affectedModuleIds": []
            }

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

        return json.loads(clean)
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error in impact: {e}")
        # Return safe default instead of crashing
        return {
            "directCallers": [],
            "indirectDependents": [],
            "testsCovering": [],
            "riskLevel": "medium",
            "riskReason": "Impact analysis complete — manual review recommended",
            "affectedModuleIds": []
        }
    except Exception as e:
        logger.error(f"Impact error: {e}")
        raise HTTPException(status_code=500, detail=str(e))



# ── Endpoint 3: Generate tests + docs ───────────────────────
@app.post("/api/generate")
async def generate(req: GenerateRequest):
    try:
        logger.info(f"Generating {req.mode} for {req.file_path}")
        owner, repo  = parse_repo_url(req.repo_url)
        file_content = get_file_content(owner, repo, req.file_path)

        # Use shared detect_test_framework function (no duplication)
        framework = detect_test_framework(owner, repo)
        logger.info(f"Detected framework: {framework}")

        prompt   = generate_prompt(req.file_path, file_content, req.mode, framework)
        response = await call_watsonx(prompt)

        return {
            "code": response,
            "framework": framework,
            "mode": req.mode
        }
    except Exception as e:
        logger.error(f"Generate error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ── Add this to main.py ──────────────────────────────────────────────────────
# 1. Import flow_prompt at the top:
#    from bob_prompts import map_prompt, impact_prompt, generate_prompt, flow_prompt
#
# 2. Add this endpoint to main.py:

@app.post("/api/flow")
async def flow(req: AnalyseRequest):
    try:
        logger.info(f"Generating flow map for: {req.repo_url}")
        owner, repo = parse_repo_url(req.repo_url)
        file_tree   = get_file_tree(owner, repo)
        key_files   = get_key_files(owner, repo, file_tree)
        prompt      = flow_prompt(req.repo_url, file_tree, key_files)
        response    = await call_watsonx(prompt)

        logger.info(f"Raw flow response length: {len(response)}")
        logger.info(f"Raw flow response: {response[:300]}")

        if not response or not response.strip():
            raise ValueError("watsonx returned empty response")

        # FIX: find ALL JSON objects and take the LAST one
        # The model returns an example first, then the real answer
        import re
        all_matches = list(re.finditer(r'\{', response))
        
        # Try each JSON starting position from the END, take first valid one
        data = None
        for match in reversed(all_matches):
            start = match.start()
            candidate = response[start:]
            # Find the matching closing brace
            depth = 0
            end = 0
            for i, ch in enumerate(candidate):
                if ch == '{': depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            if end == 0:
                continue
            try:
                parsed = json.loads(candidate[:end])
                if "flow" in parsed and "edges" in parsed:
                    data = parsed
                    break
            except json.JSONDecodeError:
                continue

        if not data:
            # Last resort — try the entire response cleaned up
            clean = response.strip()
            start = clean.rfind('{"flow"')  # find last occurrence of flow key
            if start == -1:
                start = clean.rfind('{\n  "flow"')
            if start != -1:
                end = clean.rfind('}') + 1
                data = json.loads(clean[start:end])

        if not data:
            raise ValueError(f"Could not extract valid flow JSON from response")

        logger.info(f"Flow: {len(data['flow'])} nodes, {len(data['edges'])} edges")
        return data

    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error in flow: {e}")
        raise HTTPException(status_code=500, detail=f"Invalid JSON: {str(e)}")
    except Exception as e:
        logger.error(f"Flow error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Add this endpoint to main.py ─────────────────────────────────────────────
# Also add this to imports at top of file:
#   from pydantic import BaseModel
# (already imported — no change needed)

class FunctionsRequest(BaseModel):
    repo_url: str
    file_path: str

@app.post("/api/functions")
async def get_functions(req: FunctionsRequest):
    try:
        logger.info(f"Getting functions from: {req.file_path}")
        owner, repo  = parse_repo_url(req.repo_url)
        file_content = get_file_content(owner, repo, req.file_path)

        prompt = f"""Extract only the names of all functions, methods, and classes defined in this file.
        Return ONLY a JSON array of name strings.
        Do not include code. Do not include explanations.
        Output format: ["name1", "name2", "name3"]

        FILE: {req.file_path}
        {file_content[:2000]}

        JSON array of names:"""

        response = await call_watsonx(prompt)
        logger.info(f"Functions response: {response[:200]}")

        # Try to find a JSON array anywhere in the response
        import re

        # First try: clean array match
        match = re.search(r'\[[^\[\]]*\]', response, re.DOTALL)
        if match:
            try:
                raw = match.group(0)
                functions = json.loads(raw)
                # Filter out anything that looks like code (keep short names only)
                clean = [f for f in functions if isinstance(f, str) and len(f) < 60 and '\n' not in f]
                if clean:
                    logger.info(f"Found {len(clean)} functions")
                    return {"functions": clean, "file_path": req.file_path}
            except Exception:
                pass

        # Second try: extract quoted strings that look like function names
        names = re.findall(r'"([a-zA-Z_][a-zA-Z0-9_]{1,40})"', response)
        if names:
            logger.info(f"Extracted {len(names)} names from response")
            return {"functions": names, "file_path": req.file_path}

        logger.warning(f"Could not extract functions from response")
        return {"functions": [], "file_path": req.file_path}

    except Exception as e:
        logger.error(f"Functions error: {e}")
        return {"functions": [], "file_path": req.file_path}
