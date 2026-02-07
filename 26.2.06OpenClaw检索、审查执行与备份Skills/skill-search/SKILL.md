---
name: skill-search
description: Search, discover, and dynamically load skills from the ClawHub registry at skills.droyd.ai. Use when an agent needs a capability it doesn't have, wants to find tools for a specific task, or needs to browse trending/popular skills. Triggers include requests to find skills, search for tools, discover capabilities, load a skill dynamically, check what skills exist for a domain, or run a skill without installing it. Also use when the user asks about available OpenClaw/ClawHub skills, wants to explore skill categories, or needs to fetch and execute skill content on the fly.
---

# Skill Search

Dynamically search, discover, and load skills from the ClawHub registry without permanent installation.

**Base URL**: `https://skills.droyd.ai`

## Workflow

### 1. Search for Skills

Use the search script to find skills by query, category, or tags:

```bash
bash scripts/skillhub.sh search "browser automation"
bash scripts/skillhub.sh search "trading" --categories crypto,defi
bash scripts/skillhub.sh search "pdf" --limit 5
```

### 2. Browse Trending

Discover popular and high-quality skills:

```bash
bash scripts/skillhub.sh trending
bash scripts/skillhub.sh trending --categories coding --window 7d
```

### 3. Get Skill Details

Inspect a specific skill's metadata, quality scores, dependencies, and required API keys:

```bash
bash scripts/skillhub.sh detail author/skill-name
```

### 4. Fetch Skill Content

Retrieve the full skill content (SKILL.md, scripts, references) for reading or execution:

```bash
# Print content to stdout
bash scripts/skillhub.sh content author/skill-name

# Extract to a temp folder for agent execution
bash scripts/skillhub.sh content author/skill-name --extract
# Files are written to /tmp/openclaw-skills/skill-name/
```

When `--extract` is used, skill files are parsed from the concatenated content response and written to individual files under `/tmp/openclaw-skills/{skill-name}/`. The agent can then read and execute these files directly.

### 5. Execute a Loaded Skill

After extracting, read the skill's SKILL.md for instructions:

```bash
cat /tmp/openclaw-skills/{skill-name}/SKILL.md
```

Then follow the loaded skill's instructions, running any bundled scripts from the extracted directory.

## Categories

Available category filters: `devops`, `browser`, `productivity`, `marketing`, `prediction_markets`, `location`, `communication`, `media`, `finance`, `crypto`, `trading`, `gaming`, `defi`, `image`, `video`, `smart-home`, `security`, `search`, `notes`, `calendar`, `coding`, `token_launchpad`, `voice`, `email`, `messaging`, `social`, `music`, `database`, `monitoring`, `backup`, `wallet`, `food`, `health`, `other`.

## Permanent Installation

To install a skill permanently via ClawHub CLI instead of dynamic loading:

```bash
clawhub install {skill_name}
```

## API Reference

For detailed API parameters and response schemas, see [references/api.md](references/api.md).