"""Entry point for the OpenNews MCP server."""

import sys

# psycopg3 async requires SelectorEventLoop on Windows (ProactorEventLoop is unsupported).
if sys.platform == "win32":
    import asyncio, selectors  # noqa: E401
    asyncio.set_event_loop_policy(
        asyncio.WindowsSelectorEventLoopPolicy()
    )

from opennews_mcp.app import mcp

# Importing the tools package triggers registration of all @mcp.tool() decorators.
import opennews_mcp.tools  # noqa: F401


def main():
    """Run the MCP server (stdio transport by default)."""
    mcp.run()


if __name__ == "__main__":
    main()
