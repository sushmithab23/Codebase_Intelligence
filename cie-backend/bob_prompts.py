# bob_prompts.py — watsonx.ai prompt templates for CIE
# Optimised for ibm/granite-3-8b-instruct model

def map_prompt(repo_url: str, file_tree: list, key_files: dict) -> str:
    """Prompt to generate module map JSON from repo"""
    file_tree_str = "\n".join(file_tree[:50])  # limit to 50 files
    key_files_str = "\n\n".join([
        f"FILE: {path}\n{content[:500]}"
        for path, content in list(key_files.items())[:10]
    ])

    return f"""You are a code analysis AI. Analyze the structure of this GitHub repository: {repo_url}

FILE TREE (all files in repo):
{file_tree_str}

KEY FILE CONTENTS (sample files):
{key_files_str}

TASK: Create a module map showing how this codebase is organized.

Instructions:
1. Group related files into logical modules (e.g., "auth", "api", "database")
2. Identify module types: entry (main files), service (business logic), util (helpers), test, config
3. Identify dependencies between modules (which imports which)
4. Use lowercase IDs with no spaces (e.g., "user_service")

CRITICAL: You MUST respond with ONLY valid JSON. No text before or after. Start with {{ and end with }}.

Required JSON format:
{{
  "modules": [
    {{
      "id": "backend",
      "label": "Backend API",
      "files": ["cie-backend/main.py", "cie-backend/github_helper.py"],
      "type": "service"
    }}
  ],
  "edges": [
    {{
      "from": "backend",
      "to": "frontend",
      "type": "import"
    }}
  ]
}}

DO NOT include any explanation, markdown, or code blocks. ONLY the JSON object."""


def impact_prompt(repo_url: str, function_name: str, file_path: str, key_files: dict) -> str:
    """Prompt to analyse impact of changing a specific function"""
    
    # Count how many files we have
    file_count = len(key_files)
    
    key_files_str = "\n\n".join([
        f"=== FILE: {path} ===\n{content}"
        for path, content in key_files.items()
    ])

    return f"""You are analyzing the impact of modifying '{function_name}' in {file_path} from repository {repo_url}.

I am providing you with {file_count} files from the codebase. Search through ALL of them carefully.

CODEBASE FILES ({file_count} files):
{key_files_str}

ANALYSIS TASK:

Step 1: Find where '{function_name}' is DEFINED
- Look in {file_path} for the function definition

Step 2: Find DIRECT CALLERS
- Search for lines that call {function_name}() or use {function_name}
- Look for: {function_name}(, .{function_name}(, import {function_name}
- Record the file path and approximate line number

Step 3: Find INDIRECT DEPENDENTS
- Find files that import the file containing {function_name}
- These files depend on it indirectly

Step 4: Find TEST FILES
- Look for files with "test" in the name
- Check if they import or test {function_name}

Step 5: Assess RISK LEVEL
- high: Core function used in many places or entry points
- medium: Shared utility used in several places
- low: Isolated function with few callers

IMPORTANT: Even if you find just ONE caller, include it! Don't return empty arrays unless you truly found nothing.

CRITICAL: Respond with ONLY valid JSON. Start with {{ and end with }}.

{{
  "directCallers": [{{"file": "lib/application.js", "line": 136}}],
  "indirectDependents": ["lib/express.js"],
  "testsCovering": ["test/router.test.js"],
  "riskLevel": "high",
  "riskReason": "Core routing function called by application layer",
  "affectedModuleIds": ["router", "app"]
}}

DO NOT include explanations, markdown, or code blocks. ONLY the JSON object."""


def generate_prompt(file_path: str, file_content: str, mode: str, framework: str) -> str:
    """Prompt to generate tests and/or documentation for a file"""

    if mode == "tests":
        task = f"""Generate a complete unit test suite using {framework}.

Requirements:
- Cover happy path, edge cases, and failure/error scenarios
- Use descriptive test names: 'should return X when Y'
- Group tests in describe/class blocks by function
- Add a comment above each test explaining WHY that case matters
- Include any necessary mocks or fixtures
- Match the coding style of the file above"""

    elif mode == "docs":
        task = """For each function and class defined in this file, write a documentation entry in this exact format:

### functionName
**What it does:** one sentence description of purpose
**Parameters:** param1 (type) — description | param2 (type) — description | none
**Returns:** what it returns, or "nothing"
**Side effects:** any mutations or I/O, or "none"

List ONLY functions that are actually defined in the FILE CONTENTS above.
Do NOT invent functions. Do NOT include require/import statements.
Output plain text only — no code blocks, no backticks."""

    else:  # both
        task = f"""Generate TWO sections separated by a divider.

SECTION 1 — TESTS
Write a complete unit test suite using {framework}.
- Happy path, edge cases, failure scenarios
- Descriptive test names: should X when Y
- Raw code only, no fences

--- DOCS ---

SECTION 2 — DOCS
For each function defined in the file, write:
### functionName
**What it does:** one sentence
**Parameters:** param (type) — description | none
**Returns:** description
**Side effects:** description or none"""

    return f"""You are a senior engineer generating {mode} for this file.

FILE PATH: {file_path}
TEST FRAMEWORK: {framework}

FILE CONTENTS:
{file_content}

TASK:
{task}

Output ONLY the result. No preamble. No markdown code fences. No explanation."""

def flow_prompt(repo_url: str, file_tree: list, key_files: dict, real_functions: dict = None) -> str:
    top_files = dict(list(key_files.items())[:3])
    files_str = "\n\n".join([
        f"=== {path} ===\n{content[:300]}"
        for path, content in top_files.items()
    ])

    func_hints = ""
    if real_functions:
        hints = []
        for path, funcs in list(real_functions.items())[:5]:
            if funcs:
                hints.append(f"{path}: {', '.join(funcs[:6])}")
        if hints:
            func_hints = "\n\nFUNCTIONS IN CODEBASE:\n" + "\n".join(hints)

    return f"""Analyze this GitHub repository and map its execution flow: {repo_url}

FILES:
{files_str}{func_hints}

Output ONLY this JSON with EXACTLY 8 nodes. Replace each label/file/description with real values from the files above. No text before or after the JSON.

{{"flow":[{{"id":"n1","label":"REPLACE_app_start","type":"start","file":"REPLACE_file","description":"REPLACE_desc"}},{{"id":"n2","label":"REPLACE_init","type":"function","file":"REPLACE_file","description":"REPLACE_desc"}},{{"id":"n3","label":"REPLACE_route","type":"route","file":"REPLACE_file","description":"REPLACE_desc"}},{{"id":"n4","label":"REPLACE_validate","type":"decision","file":"REPLACE_file","description":"REPLACE_desc"}},{{"id":"n5","label":"REPLACE_process","type":"function","file":"REPLACE_file","description":"REPLACE_desc"}},{{"id":"n6","label":"REPLACE_helper","type":"process","file":"REPLACE_file","description":"REPLACE_desc"}},{{"id":"n7","label":"REPLACE_respond","type":"function","file":"REPLACE_file","description":"REPLACE_desc"}},{{"id":"n8","label":"REPLACE_response_sent","type":"end","file":"REPLACE_file","description":"REPLACE_desc"}}],"edges":[{{"from":"n1","to":"n2","label":"starts"}},{{"from":"n2","to":"n3","label":"registers"}},{{"from":"n3","to":"n4","label":"calls"}},{{"from":"n4","to":"n5","label":"valid"}},{{"from":"n4","to":"n8","label":"invalid"}},{{"from":"n5","to":"n6","label":"calls"}},{{"from":"n6","to":"n7","label":"calls"}},{{"from":"n7","to":"n8","label":"returns"}}]}}"""