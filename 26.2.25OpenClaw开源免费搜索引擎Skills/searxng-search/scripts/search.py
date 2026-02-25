#!/usr/bin/env python3
"""
SearXNG 搜索脚本

用法:
    python3 search.py --query "搜索关键词"
    python3 search.py --query "搜索关键词" --num 5
"""

import argparse
import json
import sys
import requests

# ========== 配置 ==========
SEARXNG_URL = "http://localhost:8080/search"
DEFAULT_NUM = 5
# ==========================


def search(query, num=DEFAULT_NUM):
    """调用SearXNG JSON API搜索"""
    params = {
        "q": query,
        "format": "json",
        "pageno": 1,
    }

    try:
        resp = requests.get(SEARXNG_URL, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.ConnectionError:
        print("错误: 无法连接到SearXNG服务，请检查服务是否运行", file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.Timeout:
        print("错误: 搜索请求超时", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        sys.exit(1)

    results = data.get("results", [])[:num]

    if not results:
        print("未找到相关结果")
        return

    for i, item in enumerate(results, 1):
        title = item.get("title", "无标题")
        url = item.get("url", "")
        content = item.get("content", "无摘要")
        print(f"{i}. {title}")
        print(f"   {content}")
        print(f"   🔗 {url}")
        print()


def main():
    parser = argparse.ArgumentParser(description="SearXNG 网络搜索")
    parser.add_argument("--query", "-q", required=True, help="搜索关键词")
    parser.add_argument("--num", "-n", type=int, default=DEFAULT_NUM, help=f"返回结果数量（默认{DEFAULT_NUM}）")
    args = parser.parse_args()

    search(args.query, args.num)


if __name__ == "__main__":
    main()
