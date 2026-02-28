<p align="center">
  <b>Twitter MCP Server</b><br>
  Twitter/X Data · User Profiles · Tweet Search · Follower Events · KOL Tracking
</p>

<p align="center">
  <a href="./docs/README_ZH.md">中文</a> | <a href="./docs/README_JA.md">日本語</a> | <a href="./docs/README_KO.md">한국어</a>
</p>

---

## Quick Install

> **First, go to [https://6551.io/mcp](https://6551.io/mcp) to get your API Token.**

### Claude Code

```bash
claude mcp add twitter \
  -e TWITTER_TOKEN=<your-token> \
  -- uv --directory /path/to/twitter-mcp run twitter-mcp
```

> Replace `/path/to/twitter-mcp` with your local project path, and `<your-token>` with your Token.

### OpenClaw

```bash
export TWITTER_TOKEN="<your-token>"
cp -r openclaw-skill/opentwitter ~/.openclaw/skills/
```

---

## Let AI Review & Install For You

Not sure if this MCP is safe? Paste the prompt below to your AI assistant — it will review the source code first, then install if safe:

> **Copy this prompt and send it to your AI assistant (replace `<project-path>` and `<your-token>` with actual values):**

```text
Please review and install the twitter-mcp MCP server for me. The project is at <project-path>.

Steps:
1. Review these files for security:
   - src/twitter_mcp/api_client.py — Confirm it only connects to ai.6551.io, no data sent elsewhere
   - src/twitter_mcp/config.py — Confirm token is only read from local config.json or env vars, no hardcoded secrets or leaks
   - src/twitter_mcp/tools.py — Confirm all tools only perform API queries, no file writes, command execution, or dangerous operations
   - pyproject.toml — Confirm dependencies are only mcp, httpx, no suspicious packages
2. Tell me your conclusion: safe / risky / problematic, with specific reasons
3. If safe, run the install (get Token from https://6551.io/mcp):
   claude mcp add twitter -e TWITTER_TOKEN=<your-token> -- uv --directory <project-path> run twitter-mcp
```

---

## What Can It Do?

Once connected, just ask your AI assistant:

| You say | It does |
|---------|---------|
| "Show @elonmusk's Twitter profile" | Get user profile info |
| "What did @VitalikButerin tweet recently" | Get user's recent tweets |
| "Search Bitcoin related tweets" | Keyword search |
| "Find tweets with #crypto hashtag" | Hashtag search |
| "Popular tweets about ETH with 1000+ likes" | Search with engagement filters |
| "Who followed @elonmusk recently" | Get new follower events |
| "Who unfollowed @elonmusk" | Get unfollower events |
| "What tweets did @elonmusk delete" | Get deleted tweets |
| "Which KOLs follow @elonmusk" | Get KOL followers |

---

## Available Tools

| Tool | Description |
|------|-------------|
| `get_twitter_user` | Get user profile by username |
| `get_twitter_user_by_id` | Get user profile by numeric ID |
| `get_twitter_user_tweets` | Get recent tweets from a user |
| `search_twitter` | Search tweets with basic filters |
| `search_twitter_advanced` | Advanced search with multiple filters |
| `get_twitter_follower_events` | Get follower/unfollower events |
| `get_twitter_deleted_tweets` | Get deleted tweets from a user |
| `get_twitter_kol_followers` | Get KOL (Key Opinion Leader) followers |

---

## Configuration

### Get API Token

Go to [https://6551.io/mcp](https://6551.io/mcp) to get your API Token.

Set the environment variable:

```bash
# macOS / Linux
export TWITTER_TOKEN="<your-token>"

# Windows PowerShell
$env:TWITTER_TOKEN = "<your-token>"
```

| Variable | Required | Description |
|----------|----------|-------------|
| `TWITTER_TOKEN` | **Yes** | 6551 API Bearer Token (get from https://6551.io/mcp) |
| `TWITTER_API_BASE` | No | Override REST API URL |
| `TWITTER_MAX_ROWS` | No | Max results per query (default: 100) |

Also supports `config.json` in the project root (env vars take precedence):

```json
{
  "api_base_url": "https://ai.6551.io",
  "api_token": "<your-token>",
  "max_rows": 100
}
```

---

## Data Structures

### Twitter User

```json
{
  "userId": "44196397",
  "screenName": "elonmusk",
  "name": "Elon Musk",
  "description": "...",
  "followersCount": 170000000,
  "friendsCount": 500,
  "statusesCount": 30000,
  "verified": true
}
```

### Tweet

```json
{
  "id": "1234567890",
  "text": "Tweet content...",
  "createdAt": "2024-02-20T12:00:00Z",
  "retweetCount": 1000,
  "favoriteCount": 5000,
  "replyCount": 200,
  "userScreenName": "elonmusk",
  "hashtags": ["crypto", "bitcoin"],
  "urls": [{"url": "https://..."}]
}
```

---

<details>
<summary><b>Other Clients — Manual Install</b> (click to expand)</summary>

> In all configs below, replace `/path/to/twitter-mcp` with your actual local project path, and `<your-token>` with your Token from [https://6551.io/mcp](https://6551.io/mcp).

### Claude Desktop

Edit config (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "twitter": {
      "command": "uv",
      "args": ["--directory", "/path/to/twitter-mcp", "run", "twitter-mcp"],
      "env": {
        "TWITTER_TOKEN": "<your-token>"
      }
    }
  }
}
```

### Cursor

`~/.cursor/mcp.json` or Settings > MCP Servers:

```json
{
  "mcpServers": {
    "twitter": {
      "command": "uv",
      "args": ["--directory", "/path/to/twitter-mcp", "run", "twitter-mcp"],
      "env": {
        "TWITTER_TOKEN": "<your-token>"
      }
    }
  }
}
```

### Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "twitter": {
      "command": "uv",
      "args": ["--directory", "/path/to/twitter-mcp", "run", "twitter-mcp"],
      "env": {
        "TWITTER_TOKEN": "<your-token>"
      }
    }
  }
}
```

### Cline

VS Code sidebar > Cline > MCP Servers > Configure, edit `cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "twitter": {
      "command": "uv",
      "args": ["--directory", "/path/to/twitter-mcp", "run", "twitter-mcp"],
      "env": {
        "TWITTER_TOKEN": "<your-token>"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### Continue.dev

`~/.continue/config.yaml`:

```yaml
mcpServers:
  - name: twitter
    command: uv
    args:
      - --directory
      - /path/to/twitter-mcp
      - run
      - twitter-mcp
    env:
      TWITTER_TOKEN: <your-token>
```

### Cherry Studio

Settings > MCP Servers > Add > Type stdio: Command `uv`, Args `--directory /path/to/twitter-mcp run twitter-mcp`, Env `TWITTER_TOKEN`.

### Zed Editor

`~/.config/zed/settings.json`:

```json
{
  "context_servers": {
    "twitter": {
      "command": {
        "path": "uv",
        "args": ["--directory", "/path/to/twitter-mcp", "run", "twitter-mcp"],
        "env": {
          "TWITTER_TOKEN": "<your-token>"
        }
      }
    }
  }
}
```

### Any stdio MCP client

```bash
TWITTER_TOKEN=<your-token> \
  uv --directory /path/to/twitter-mcp run twitter-mcp
```

</details>

---

## Compatibility

| Client | Install Method | Status |
|--------|---------------|--------|
| **Claude Code** | `claude mcp add` | One-liner |
| **OpenClaw** | Copy skill directory | One-liner |
| Claude Desktop | JSON config | Supported |
| Cursor | JSON config | Supported |
| Windsurf | JSON config | Supported |
| Cline | JSON config | Supported |
| Continue.dev | YAML / JSON | Supported |
| Cherry Studio | GUI | Supported |
| Zed | JSON config | Supported |

---

## Related Projects

- [opennews-mcp](https://github.com/6551-io/opennews-mcp) - Crypto news MCP server with AI ratings

---

## Development

```bash
cd /path/to/twitter-mcp
uv sync
uv run twitter-mcp
```

```bash
# MCP Inspector
npx @modelcontextprotocol/inspector uv --directory /path/to/twitter-mcp run twitter-mcp
```

### Project Structure

```
├── README.md
├── docs/
│   ├── README_JA.md           # 日本語
│   └── README_KO.md           # 한국어
├── openclaw-skill/opentwitter/    # OpenClaw Skill
├── pyproject.toml
├── config.json
└── src/twitter_mcp/
    ├── server.py              # Entry point
    ├── app.py                 # FastMCP instance
    ├── config.py              # Config loader
    ├── api_client.py          # HTTP client
    └── tools.py               # 8 tools
```

## License

MIT
