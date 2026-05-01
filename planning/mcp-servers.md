# CIE — MCP Server Configuration

## Recommended MCP Servers for this project

### 1. GitHub MCP Server (ESSENTIAL)
**Why:** Lets Bob fetch repo file trees, read file contents, and list branches
directly without manual upload. This powers the "upload repo by URL" feature.

**Source:** https://github.com/github/github-mcp-server

**Config:**
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<your_token_here>"
      }
    }
  }
}
```

**What Bob can do with it:**
- `get_file_contents` — read any file in the repo
- `list_files` — get full file tree
- `search_code` — find where a function is used (powers impact analysis)
- `get_pull_request` — future feature: PR description generation

---

### 2. Playwright MCP Server (RECOMMENDED for debugging)
**Why:** Lets Bob take screenshots of your own demo UI during development
and flag layout bugs automatically. Saves hours of manual QA.

**Source:** https://github.com/microsoft/playwright-mcp

**Config:**
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

**What Bob can do with it:**
- `browser_navigate` — open your local dev server
- `browser_take_screenshot` — visually inspect the UI
- `browser_click` / `browser_type` — interact with the demo flow end to end

---

### 3. Filesystem MCP Server (OPTIONAL — local dev only)
**Why:** If testing with local repos instead of GitHub URLs, Bob can read
the file system directly.

**Config:**
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/your/test/repos"
      ]
    }
  }
}
```

---

## Combined config (bob-mcp-config.json)
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<your_token_here>"
      }
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

## Priority order
| Server | Priority | Why |
|---|---|---|
| GitHub MCP | MUST HAVE | Powers the entire repo ingestion flow |
| Playwright MCP | SHOULD HAVE | Debug your own UI with Bob's help |
| Filesystem MCP | NICE TO HAVE | Only needed for local repo testing |

## Setup steps
1. Create a GitHub Personal Access Token (PAT) with `repo` read scope
2. Add the token to your environment or `.env` file
3. Place `bob-mcp-config.json` in your project root
4. In Bob settings, point to this config file
5. Test with: "List all files in github.com/expressjs/express"
