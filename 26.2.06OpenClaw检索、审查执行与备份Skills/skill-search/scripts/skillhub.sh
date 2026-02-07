#!/usr/bin/env bash
# openclaw.sh - Search, discover, and load skills from OpenClaw registry
# Usage: bash openclaw.sh <command> [args] [options]

set -euo pipefail

BASE_URL="${OPENCLAW_BASE_URL:-https://skills.droyd.ai}"
EXTRACT_DIR="/tmp/openclaw-skills"

usage() {
    cat <<EOF
Usage: bash openclaw.sh <command> [args] [options]

Commands:
  search <query>              Search skills by query
    --categories <list>       Comma-separated category filters
    --tags <list>             Comma-separated tag filters
    --limit <n>               Results per page (default: 10, max: 50)
    --offset <n>              Pagination offset

  trending                    Browse trending skills
    --categories <list>       Comma-separated category filters
    --tags <list>             Comma-separated tag filters
    --window <period>         Time window: 48h, 7d, 30d, all (default: 48h)
    --limit <n>               Results per page (default: 12, max: 50)

  detail <author/skill>       Get detailed skill metadata

  content <author/skill>      Fetch full skill content
    --extract                 Extract files to $EXTRACT_DIR/<skill-name>/
    --json                    Return JSON format instead of text

EOF
    exit 1
}

# --- Helpers ---

urlencode() {
    python3 -c "import urllib.parse; print(urllib.parse.quote('$1', safe=''))"
}

json_pretty() {
    python3 -m json.tool 2>/dev/null || cat
}

# Parse skill files from concatenated text content and write to disk
extract_skill_files() {
    local skill_name="$1"
    local content="$2"
    local out_dir="${EXTRACT_DIR}/${skill_name}"

    mkdir -p "$out_dir"

    # Parse sections delimited by === filename ===
    python3 - "$out_dir" <<'PYEOF' "$content"
import sys, os, re

out_dir = sys.argv[1]
content = sys.argv[2] if len(sys.argv) > 2 else sys.stdin.read()

# Split on === filename === markers
sections = re.split(r'\n?=== (.+?) ===\n', content)

# sections[0] is any preamble before first marker (usually empty or metadata)
# sections[1], sections[2] = first filename, first content
# sections[3], sections[4] = second filename, second content, etc.

if len(sections) < 3:
    # No section markers found, write as single SKILL.md
    filepath = os.path.join(out_dir, "SKILL.md")
    with open(filepath, 'w') as f:
        f.write(content)
    print(f"  -> {filepath}")
else:
    for i in range(1, len(sections), 2):
        filename = sections[i].strip()
        file_content = sections[i + 1] if i + 1 < len(sections) else ""

        # Strip leading/trailing code fences if present
        file_content = re.sub(r'^```\w*\n', '', file_content)
        file_content = re.sub(r'\n```\s*$', '', file_content)

        filepath = os.path.join(out_dir, filename)
        os.makedirs(os.path.dirname(filepath), exist_ok=True)

        with open(filepath, 'w') as f:
            f.write(file_content)
        print(f"  -> {filepath}")

print(f"\nExtracted to: {out_dir}")
PYEOF
}

# --- Commands ---

cmd_search() {
    local query=""
    local categories="" tags="" limit="10" offset="0"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --categories) categories="$2"; shift 2 ;;
            --tags) tags="$2"; shift 2 ;;
            --limit) limit="$2"; shift 2 ;;
            --offset) offset="$2"; shift 2 ;;
            *) query="$1"; shift ;;
        esac
    done

    [[ -z "$query" ]] && { echo "Error: search query required"; usage; }

    local encoded_query
    encoded_query=$(urlencode "$query")

    local url="${BASE_URL}/api/search?q=${encoded_query}&limit=${limit}&offset=${offset}"
    [[ -n "$categories" ]] && url+="&categories=${categories}"
    [[ -n "$tags" ]] && url+="&tags=${tags}"

    local response
    response=$(curl -sS "$url")

    # Format output
    echo "$response" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f\"Found {data.get('total', 0)} results (showing {data.get('count', 0)})\n\")
print(f\"Search weights: vector={data.get('weights', {}).get('vector', 'N/A')}, bm25={data.get('weights', {}).get('bm25', 'N/A')}\n\")
for s in data.get('skills', []):
    print(f\"  {s['slug']}\")
    print(f\"    {s.get('enhanced_description') or s.get('description', 'No description')}\")
    cats = ', '.join(s.get('categories', []))
    tags = ', '.join(s.get('tags', [])[:5])
    print(f\"    Categories: {cats}  |  Tags: {tags}\")
    print(f\"    Quality: {s.get('quality_score', 'N/A')}  |  Value: {s.get('value_score', 'N/A')}  |  Fusion: {s.get('fusion_score', 'N/A')}\")
    if s.get('match_headline'):
        import re
        headline = re.sub('<[^>]+>', '', s['match_headline'])
        print(f\"    Match: {headline}\")
    print()
"
}

cmd_trending() {
    local categories="" tags="" window="48h" limit="12"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --categories) categories="$2"; shift 2 ;;
            --tags) tags="$2"; shift 2 ;;
            --window) window="$2"; shift 2 ;;
            --limit) limit="$2"; shift 2 ;;
            *) shift ;;
        esac
    done

    local url="${BASE_URL}/api/trending?time_window=${window}&limit=${limit}"
    [[ -n "$categories" ]] && url+="&categories=${categories}"
    [[ -n "$tags" ]] && url+="&tags=${tags}"

    local response
    response=$(curl -sS "$url")

    echo "$response" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f\"Trending Skills (window: {data.get('time_window', 'N/A')})\n\")
for i, s in enumerate(data.get('skills', []), 1):
    print(f\"  {i}. {s['slug']}\")
    print(f\"     {s.get('enhanced_description') or s.get('description', 'No description')}\")
    cats = ', '.join(s.get('categories', []))
    print(f\"     Categories: {cats}\")
    print(f\"     Quality: {s.get('quality_score', 'N/A')}  |  Value: {s.get('value_score', 'N/A')}\")
    d48 = s.get('downloads_48h', 0)
    d7 = s.get('downloads_7d', 0)
    d30 = s.get('downloads_30d', 0)
    print(f\"     Downloads: 48h={d48}  7d={d7}  30d={d30}  all={s.get('all_time_downloads', 0)}\")
    print(f\"     Rank Score: {s.get('trending_rank_score', 'N/A')}\")
    print()
"
}

cmd_detail() {
    local slug="$1"
    [[ -z "$slug" ]] && { echo "Error: skill slug required (author/skill-name)"; usage; }

    local response
    response=$(curl -sS "${BASE_URL}/api/skill/${slug}")

    echo "$response" | python3 -c "
import sys, json
s = json.load(sys.stdin)
print(f\"Skill: {s['slug']}\")
print(f\"Title: {s.get('title', 'N/A')}\")
print(f\"Author: {s.get('author', 'N/A')}\")
print(f\"Version: {s.get('version', 'N/A')}\")
print()
print(f\"Description: {s.get('enhanced_description') or s.get('description', 'N/A')}\")
print()
cats = ', '.join(s.get('categories', []))
tags = ', '.join(s.get('tags', []))
print(f\"Categories: {cats}\")
print(f\"Tags: {tags}\")
print(f\"Complexity: {s.get('complexity_tier', 'N/A')}  |  Type: {s.get('skill_type', 'N/A')}\")
print(f\"Quality: {s.get('quality_score', 'N/A')}  |  Value: {s.get('value_score', 'N/A')}  |  Malicious: {s.get('malicious_probability', 'N/A')}\")
print()
api_keys = s.get('required_api_keys', [])
deps = s.get('dependencies', [])
langs = s.get('code_languages', [])
if api_keys: print(f\"Required API Keys: {', '.join(api_keys)}\")
if deps: print(f\"Dependencies: {', '.join(deps)}\")
if langs: print(f\"Languages: {', '.join(langs)}\")
print()
print(f\"Stars: {s.get('stars', 0)}  |  Upvotes: {s.get('upvotes', 0)}\")
if s.get('openclaw_url'): print(f\"URL: {s['openclaw_url']}\")
print(f\"Install: clawhub install {s.get('skill_name', s['slug'].split('/')[-1])}\")
print()
files = s.get('files', [])
if files:
    print('Files:')
    for f in files:
        size = f.get('size', 0)
        print(f\"  {f['path']} ({size} bytes)\")
"
}

cmd_content() {
    local slug="" extract=false format="text"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --extract) extract=true; shift ;;
            --json) format="json"; shift ;;
            *) slug="$1"; shift ;;
        esac
    done

    [[ -z "$slug" ]] && { echo "Error: skill slug required (author/skill-name)"; usage; }

    local url="${BASE_URL}/api/skill-content/${slug}"
    [[ "$format" == "json" ]] && url+="?format=json"

    local response
    response=$(curl -sS "$url")

    if $extract; then
        local skill_name
        skill_name=$(echo "$slug" | cut -d'/' -f2)
        echo "Extracting skill files for: ${slug}"
        extract_skill_files "$skill_name" "$response"
    else
        echo "$response"
    fi
}

# --- Main ---

[[ $# -lt 1 ]] && usage

command="$1"; shift

case "$command" in
    search)   cmd_search "$@" ;;
    trending) cmd_trending "$@" ;;
    detail)   cmd_detail "$@" ;;
    content)  cmd_content "$@" ;;
    help|-h|--help) usage ;;
    *) echo "Unknown command: $command"; usage ;;
esac