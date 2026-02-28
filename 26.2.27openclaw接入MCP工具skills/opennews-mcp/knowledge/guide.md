# OpenNews MCP Server — Usage Guide

## Overview

This MCP server provides access to crypto news from the 6551 news platform
via REST API and WebSocket. It replaces direct database access with API calls.

## Available Tools

### Discovery
- **get_news_sources**: Get all available news source categories (Bloomberg, Reuters, etc.)
- **list_news_types**: Flat list of news type codes for filtering

### News Search
- **get_latest_news**: Get most recent news (no filters)
- **search_news**: Search by keyword
- **search_news_by_coin**: Search by coin symbol (BTC, ETH, SOL, etc.)
- **get_news_by_source**: Filter by source (Bloomberg, Reuters, Coindesk, etc.)
- **get_news_by_engine**: Filter by engine type (news, listing, onchain, meme, market)
- **search_news_by_date**: Search within a date range

### AI Ratings
- **get_high_score_news**: Get articles with high AI scores (>=70)
- **get_news_by_signal**: Filter by trading signal (long/short/neutral)

### Real-time
- **subscribe_latest_news**: Connect to WebSocket for live news updates

## Workflow Examples

1. **Quick market overview**: `get_latest_news(limit=10)`
2. **Coin-specific research**: `search_news_by_coin(coin="BTC", limit=20)`
3. **Source-specific feed**: `get_news_by_source(source="Bloomberg")`
4. **Bullish signals**: `get_news_by_signal(signal="long")`
5. **High-impact news**: `get_high_score_news(min_score=80)`

## Data Structure

Each news article contains:
- `id`: Unique article ID
- `text`: Article headline/content
- `newsType`: Source type (Bloomberg, Reuters, etc.)
- `engineType`: Engine category (news, listing, onchain, etc.)
- `link`: URL to original article
- `coins`: Array of related coins with symbol, market_type, match
- `aiRating`: AI analysis with score, grade, signal, summary, enSummary
- `ts`: Timestamp of the article
