# OpenClaw API Reference

Base URL: `https://skills.droyd.ai`

## Endpoints

### GET /api/search

Hybrid vector + BM25 search with RRF fusion.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | required | Search query |
| `categories` | string | - | Comma-separated category filters |
| `tags` | string | - | Comma-separated tag filters |
| `limit` | number | 20 | Max 50 |
| `offset` | number | 0 | Pagination |
| `include_test` | string | false | Include test skills |

Rate limit: 5/sec burst, 20/min sustained. Returns `429` when exceeded.

Response fields per skill: `skill_id`, `slug`, `title`, `description`, `enhanced_description`, `author`, `categories`, `tags`, `quality_score`, `value_score`, `text_rank`, `match_headline`, `fusion_score`.

### GET /api/trending

Trending skills by velocity + quality signals.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `time_window` | string | 48h | `48h`, `7d`, `30d`, `all` |
| `quality_weight` | number | 0.3 | 0=pure velocity, 1=pure quality |
| `categories` | string | - | Comma-separated |
| `tags` | string | - | Comma-separated |
| `min_quality_score` | number | 0 | Minimum threshold |
| `min_value_score` | number | 0 | Minimum threshold |
| `limit` | number | 12 | Max 50 |
| `offset` | number | 0 | Pagination |

Additional response fields: `downloads_48h`, `downloads_7d`, `downloads_30d`, `all_time_downloads`, `freshness_score`, `author_score`, `trending_rank_score`.

### GET /api/skill/{author}/{skill-name}

Detailed skill metadata.

Response includes: `slug`, `skill_name`, `title`, `description`, `enhanced_description`, `author`, `categories`, `tags`, `quality_score`, `value_score`, `complexity_tier`, `skill_type`, `required_api_keys`, `dependencies`, `code_languages`, `output_types`, `version`, `openclaw_url`, `malicious_probability`, `stars`, `upvotes`, `files[]`.

### GET /api/skill-content/{author}/{skill-name}

Full skill file contents. Also available via `/api/skill/by-id/{id}/content`.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `format` | string | text | `text` or `json` |

Text format returns files concatenated with `=== filename ===` section markers. JSON format wraps in `{slug, skill_id, version, required_api_keys, content}`.

### GET /api/health

Returns `{status, service, timestamp, version}`.