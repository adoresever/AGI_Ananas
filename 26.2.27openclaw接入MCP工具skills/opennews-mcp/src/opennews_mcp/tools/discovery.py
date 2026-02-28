"""Discovery tools — list available news sources and categories."""

from mcp.server.fastmcp import Context

from opennews_mcp.app import mcp


@mcp.tool()
async def get_news_sources(ctx: Context) -> dict:
    """Get all available news source categories and their metadata.

    Returns a tree structure with engine types (news, listing, onchain, meme, market)
    and their sub-categories (Bloomberg, Reuters, Binance, etc.).

    Use this first to understand what news sources are available before searching.
    """
    api = ctx.request_context.lifespan_context.api

    try:
        result = await api.get_engine_tree()
        data = result.get("data", [])

        # Build a simplified summary
        sources = []
        for engine in data:
            categories = []
            for cat in engine.get("categories", []):
                categories.append({
                    "code": cat.get("code"),
                    "name": cat.get("name"),
                    "enName": cat.get("enName"),
                    "aiEnabled": cat.get("aiEnabled", False),
                })
            sources.append({
                "code": engine.get("code"),
                "name": engine.get("name"),
                "enName": engine.get("enName"),
                "category_count": len(categories),
                "categories": categories,
            })

        return {
            "success": True,
            "data": sources,
            "engine_count": len(sources),
        }
    except Exception as e:
        return {"success": False, "error": str(e) or repr(e)}


@mcp.tool()
async def list_news_types(ctx: Context) -> dict:
    """List all available news type codes for filtering.

    Returns a flat list of news source codes that can be used with
    the newsType parameter in search_news.
    """
    api = ctx.request_context.lifespan_context.api

    try:
        result = await api.get_engine_tree()
        data = result.get("data", [])

        types = []
        for engine in data:
            for cat in engine.get("categories", []):
                types.append({
                    "code": cat.get("code"),
                    "engineType": engine.get("code"),
                    "name": cat.get("enName") or cat.get("name"),
                })

        return {
            "success": True,
            "data": types,
            "count": len(types),
        }
    except Exception as e:
        return {"success": False, "error": str(e) or repr(e)}
