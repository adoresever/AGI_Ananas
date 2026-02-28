"""FastMCP application instance and lifespan."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

from mcp.server.fastmcp import FastMCP

from opentwitter_mcp.api_client import TwitterAPIClient


@dataclass
class AppContext:
    """Shared application state available to all tools via ctx."""
    api: TwitterAPIClient


@asynccontextmanager
async def app_lifespan(server: FastMCP) -> AsyncIterator[AppContext]:
    """Manage the API client lifecycle."""
    api = TwitterAPIClient()
    try:
        yield AppContext(api=api)
    finally:
        await api.close()


# ---------- FastMCP instance ----------
mcp = FastMCP(
    "twitter-6551",
    lifespan=app_lifespan,
    json_response=True,
)
