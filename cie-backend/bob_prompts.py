# bob_prompts.py — watsonx.ai prompt templates for CIE

def map_prompt(repo_url: str, file_tree: list, key_files: dict) -> str:
    """Prompt to generate module map JSON from repo"""
    file_tree_str  = "\n".join(file_tree)
    key_files_str  = "\n\n".join([
        f"=== {path} ===\n{content}"
        for path, content in key_files.items()
    ])

    return f"""You are analysing the GitHub repository: {repo_url}

FILE TREE:
{file_tree_str}

KEY FILE CONTENTS:
{key_files_str}

Your task: Analyse the repository structure and return a module map.

Rules:
- Group files by feature/module, not by file type
- Identify entry points, services, utilities, tests, and config files
- Identify which modules import or depend on each other
- Use short, human-readable labels for module names
- Module IDs must be unique lowercase strings with no spaces

Return ONLY a valid JSON object with this exact schema.
No explanation. No markdown. No extra text. Just the JSON:

{{
  "modules": [
    {{
      "id": "string",
      "label": "string",
      "files": ["string"],
      "type": "entry|service|util|test|config"
    }}
  ],
  "edges": [
    {{
      "from": "moduleId",
      "to": "moduleId",
      "type": "import|extends|calls"
    }}
  ]
}}"""


def impact_prompt(repo_url: str, function_name: str, file_path: str, key_files: dict) -> str:
    """Prompt to analyse impact of changing a specific function"""
    key_files_str = "\n\n".join([
        f"=== {path} ===\n{content}"
        for path, content in key_files.items()
    ])

    return f"""You are a senior engineer analysing the codebase: {repo_url}

The developer wants to modify this function:
- Function name: {function_name}
- Located in: {file_path}

CODEBASE CONTEXT:
{key_files_str}

Your task: Trace all dependencies and callers of this function across the codebase.

Rules:
- Only reference files that actually exist in the codebase context above
- Be specific — use real file paths and line numbers where visible
- Risk level: low (isolated util), medium (shared service), high (core/entry point)
- affectedModuleIds must match module IDs that would appear in the codebase map

Return ONLY a valid JSON object. No explanation. No markdown. Just the JSON:

{{
  "directCallers": [
    {{"file": "string", "line": 0}}
  ],
  "indirectDependents": ["string"],
  "testsCovering": ["string"],
  "riskLevel": "low|medium|high",
  "riskReason": "string (max 20 words)",
  "affectedModuleIds": ["string"]
}}"""


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