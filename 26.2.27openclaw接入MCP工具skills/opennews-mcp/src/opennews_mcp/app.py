"""FastMCP application instance, lifespan, and knowledge resources."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from opennews_mcp.api_client import NewsAPIClient, NewsWSClient

# Knowledge directory (project root / knowledge)
KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent.parent / "knowledge"


@dataclass
class AppContext:
    """Shared application state available to all tools via ctx."""
    api: NewsAPIClient
    ws: NewsWSClient


@asynccontextmanager
async def app_lifespan(server: FastMCP) -> AsyncIterator[AppContext]:
    """Manage the API client lifecycle."""
    api = NewsAPIClient()
    ws = NewsWSClient()
    try:
        yield AppContext(api=api, ws=ws)
    finally:
        await api.close()
        await ws.close()


# ---------- FastMCP instance ----------
mcp = FastMCP(
    "opennews-6551",
    lifespan=app_lifespan,
    json_response=True,
)


# ---------- Knowledge resources ----------
def _read_knowledge(name: str) -> str:
    path = KNOWLEDGE_DIR / name
    if path.exists():
        return path.read_text(encoding="utf-8")
    return f"Knowledge file '{name}' not found."


@mcp.resource("knowledge://guide")
async def knowledge_guide() -> str:
    """Usage guide — tool workflows, search strategies, best practices."""
    return _read_knowledge("guide.md")
