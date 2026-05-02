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
        task = """Generate inline documentation for every function and class.

Requirements:
- Match the existing doc style (JSDoc, docstrings, etc.)
- Include: purpose, parameters (name + type + description), return value, raises/throws, example
- Describe what the code DOES — not what it should do
- Flag any functions that appear to have side effects"""

    else:  # both
        task = f"""Generate TWO sections:

1. TESTS — Complete unit test suite using {framework}
   - Happy path, edge cases, failure scenarios
   - Descriptive test names
   - Comments explaining WHY each test exists

2. DOCS — Inline documentation for every function
   - Parameters, return values, examples
   - Match existing doc style"""

    return f"""You are a senior engineer generating {mode} for this file.

FILE PATH: {file_path}
TEST FRAMEWORK: {framework}

FILE CONTENTS:
{file_content}

TASK:
{task}

Return the generated code only.
No explanation before or after.
No markdown code fences.
Just the raw code."""