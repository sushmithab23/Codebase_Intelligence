# github_helper.py — GitHub API utilities for CIE
from github import Github
import os
import logging
from dotenv import load_dotenv

load_dotenv()

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_github_client():
    return Github(os.getenv("GITHUB_PAT"))

def parse_repo_url(url: str) -> tuple[str, str]:
    """Extract owner and repo name from GitHub URL
    Example: https://github.com/expressjs/express → ('expressjs', 'express')
    """
    if not url or "github.com" not in url:
        raise ValueError(f"Invalid GitHub URL: {url}")
    parts = url.rstrip("/").split("/")
    if len(parts) < 2:
        raise ValueError("URL must contain owner/repo path")
    return parts[-2], parts[-1]

def get_file_tree(owner: str, repo: str) -> list[str]:
    """Get flat list of all file paths in the repo"""
    g = get_github_client()
    repository = g.get_repo(f"{owner}/{repo}")
    tree = repository.get_git_tree("HEAD", recursive=True)
    return [item.path for item in tree.tree if item.type == "blob"]

def get_file_content(owner: str, repo: str, path: str) -> str:
    """Get decoded content of a specific file"""
    g = get_github_client()
    repository = g.get_repo(f"{owner}/{repo}")
    file = repository.get_contents(path)
    return file.decoded_content.decode("utf-8")

def get_key_files(owner: str, repo: str, file_tree: list[str]) -> dict:
    """Fetch contents of the most important files for Bob to analyse.
    Limits to 20 files and 2000 chars per file to stay within token limits.
    """
    key_extensions = ['.py', '.js', '.ts', '.jsx', '.tsx', '.json', '.md']
    skip_folders   = [
        'node_modules', 'venv', '__pycache__',
        '.git', 'build', 'dist', '.next', 'coverage'
    ]

    key_files = {}
    count = 0

    for path in file_tree:
        # Skip unwanted folders
        if any(skip in path for skip in skip_folders):
            continue
        # Only fetch key file types
        if any(path.endswith(ext) for ext in key_extensions):
            try:
                content = get_file_content(owner, repo, path)
                key_files[path] = content[:2000]  # cap per file
                count += 1
            except Exception as e:
                logger.warning(f"Failed to fetch {path}: {e}")
        # Cap at 20 files to avoid GitHub rate limits
        if count >= 20:
            break

    return key_files

def detect_test_framework(owner: str, repo: str) -> str:
    """Detect the test framework used in the repo"""
    # Check Python
    try:
        req = get_file_content(owner, repo, "requirements.txt")
        if "pytest" in req:
            return "pytest"
        if "unittest" in req:
            return "unittest"
    except Exception as e:
        logger.warning(f"Could not read requirements.txt: {e}")

    # Check JavaScript/TypeScript
    try:
        pkg = get_file_content(owner, repo, "package.json")
        if "jest" in pkg:
            return "jest"
        if "vitest" in pkg:
            return "vitest"
        if "mocha" in pkg:
            return "mocha"
    except Exception as e:
        logger.warning(f"Could not read package.json: {e}")

    # Default fallback
    return "pytest"