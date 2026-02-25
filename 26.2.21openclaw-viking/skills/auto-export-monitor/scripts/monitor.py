#!/usr/bin/env python3
"""
汽车出口政策新闻监控 (Auto Export Monitor)
==========================================
爬取权威网站最新政策动态，AI分析生成风险研判和决策建议。
输出格式化Markdown简报，供OpenClaw推送到钉钉群。

Usage:
    python3 monitor.py              # 完整运行：爬取 + AI分析
    python3 monitor.py --fetch-only # 仅爬取，不调用AI分析
    python3 monitor.py --test       # 测试模式：只爬第一个源的前3篇
"""

import os
import sys
import json
import time
import hashlib
import random
import argparse
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ============================================================
# 配置和初始化
# ============================================================

SCRIPT_DIR = Path(__file__).parent
SOURCES_FILE = SCRIPT_DIR / "sources.json"
HISTORY_FILE = SCRIPT_DIR / "history.json"
OUTPUT_DIR = SCRIPT_DIR / "output"

# 日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger("auto-export-monitor")

# 北京时间
BJT = timezone(timedelta(hours=8))


def load_json(path: Path) -> dict:
    """加载JSON文件"""
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_json(path: Path, data: dict):
    """保存JSON文件"""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def content_hash(text: str) -> str:
    """生成内容哈希，用于增量检测"""
    return hashlib.md5(text.encode("utf-8")).hexdigest()


# ============================================================
# 爬虫模块
# ============================================================

class NewsFetcher:
    """新闻爬取器：支持多源爬取、关键词过滤、增量检测"""

    def __init__(self, config: dict, history: dict):
        self.sources = config["sources"]
        self.filter_keywords = config["filter_keywords"]
        self.settings = config["settings"]
        self.history = history
        self.session = requests.Session()

    def _get_headers(self) -> dict:
        """随机User-Agent"""
        ua = random.choice(self.settings["user_agents"])
        return {
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive",
        }

    def _delay(self):
        """随机延迟，避免被封"""
        delay = random.uniform(
            self.settings["request_delay_min"],
            self.settings["request_delay_max"]
        )
        time.sleep(delay)

    def _fetch_page(self, url: str, encoding: str = "utf-8") -> str | None:
        """获取单个页面HTML"""
        try:
            resp = self.session.get(
                url,
                headers=self._get_headers(),
                timeout=self.settings["request_timeout"],
                verify=False  # 部分政府网站SSL证书有问题
            )
            resp.encoding = encoding
            if resp.status_code == 200:
                return resp.text
            else:
                log.warning(f"HTTP {resp.status_code}: {url}")
                return None
        except requests.RequestException as e:
            log.error(f"请求失败 {url}: {e}")
            return None

    def _extract_articles_generic(self, html: str, base_url: str, source: dict) -> list[dict]:
        """
        通用文章提取器
        从列表页HTML中提取文章标题和链接。
        采用多种策略匹配不同网站的页面结构。
        """
        soup = BeautifulSoup(html, "html.parser")
        articles = []
        seen_urls = set()

        # 策略1: 查找常见的新闻列表结构
        # 大多数政府/机构网站使用 <li><a> 或 <div><a> 结构
        link_candidates = []

        # 优先查找新闻列表区域内的链接
        for container_selector in [
            "div.news-list", "div.list", "ul.news_list", "div.content-list",
            "div.main-content", "div.article-list", "div.news",
            "div.list-content", "div.right-content", "div.con_list",
            "ul.list", "div.newsList", "div.news_con",
            "table.list", "div#list", "div.mod-list",
        ]:
            container = soup.select_one(container_selector)
            if container:
                link_candidates = container.find_all("a", href=True)
                if link_candidates:
                    break

        # 如果没找到容器，回退到全页面搜索
        if not link_candidates:
            link_candidates = soup.find_all("a", href=True)

        for link in link_candidates:
            title = link.get_text(strip=True)
            href = link.get("href", "")

            # 过滤条件
            if not title or len(title) < 6:
                continue
            if not href:
                continue

            # 跳过导航链接、锚点、JavaScript
            skip_patterns = [
                "javascript:", "#", "mailto:", "tel:",
                "index.html", "index.shtml", "index.htm",
                "/search", "/login", "/register",
            ]
            if any(p in href.lower() for p in skip_patterns):
                # 但保留包含日期模式的index页面（某些网站的文章页就是index.html）
                if not any(y in href for y in ["2024", "2025", "2026"]):
                    continue

            # 构建完整URL
            if href.startswith("http"):
                full_url = href
            elif href.startswith("//"):
                full_url = "https:" + href
            elif href.startswith("/"):
                from urllib.parse import urlparse
                parsed = urlparse(base_url)
                full_url = f"{parsed.scheme}://{parsed.netloc}{href}"
            else:
                full_url = base_url.rstrip("/") + "/" + href

            # 去重
            if full_url in seen_urls:
                continue
            seen_urls.add(full_url)

            articles.append({
                "title": title,
                "url": full_url,
                "source_id": source["id"],
                "source_name": source["name"],
                "category": source["category"],
                "fetch_time": datetime.now(BJT).isoformat(),
            })

        return articles[:self.settings["max_articles_per_source"]]

    def _is_relevant(self, article: dict, source: dict) -> bool:
        """
        关键词过滤：判断文章是否与汽车出口相关。
        - auto_relevant=true 的源：天然相关（如汽车流通协会），所有文章都保留
        - 其他源：使用两级过滤（源专属关键词 + 通用关键词）
        """
        # 天然相关的源，所有文章都视为相关
        if source.get("auto_relevant", False):
            return True

        text = article["title"].lower()

        # 源专属关键词（优先级高，命中一个即可）
        for kw in source.get("keywords_boost", []):
            if kw.lower() in text:
                return True

        # 通用关键词（需要命中至少一个）
        for kw in self.filter_keywords:
            if kw.lower() in text:
                return True

        return False

    def _is_new(self, article: dict) -> bool:
        """增量检测：通过URL哈希判断是否已抓取过"""
        url_hash = content_hash(article["url"])
        return url_hash not in self.history.get("articles", {})

    def _mark_fetched(self, article: dict, detail_text: str = ""):
        """标记文章为已抓取"""
        url_hash = content_hash(article["url"])
        if "articles" not in self.history:
            self.history["articles"] = {}
        self.history["articles"][url_hash] = {
            "title": article["title"],
            "url": article["url"],
            "source": article["source_name"],
            "fetched_at": datetime.now(BJT).isoformat(),
            "content_hash": content_hash(detail_text) if detail_text else "",
        }

    def _fetch_detail(self, url: str, encoding: str = "utf-8") -> str:
        """获取文章详情页正文"""
        html = self._fetch_page(url, encoding)
        if not html:
            return ""

        soup = BeautifulSoup(html, "html.parser")

        # 移除script和style
        for tag in soup(["script", "style", "nav", "header", "footer"]):
            tag.decompose()

        # 尝试多种正文容器选择器
        content_selectors = [
            "div.article-content", "div.content", "div.TRS_Editor",
            "div.article", "div.detail-content", "div.news-content",
            "div.main-text", "div.text", "div.con_text", "div.artical",
            "article", "div#content", "div.pages_content",
            "div.Custom_UniformBlock", "div.article-body",
        ]

        for selector in content_selectors:
            content_div = soup.select_one(selector)
            if content_div:
                text = content_div.get_text(separator="\n", strip=True)
                if len(text) > 100:  # 正文至少100字
                    return text[:5000]  # 限制长度，节省API调用成本

        # 回退：取body全部文本
        body = soup.find("body")
        if body:
            text = body.get_text(separator="\n", strip=True)
            # 取中间部分（跳过头尾导航）
            lines = [l.strip() for l in text.split("\n") if len(l.strip()) > 15]
            return "\n".join(lines[:80])[:5000]

        return ""

    def fetch_all(self, test_mode: bool = False) -> list[dict]:
        """
        主爬取流程：
        1. 逐源爬取列表页
        2. 关键词过滤
        3. 增量检测
        4. 爬取新文章详情页
        """
        all_new_articles = []
        sources = self.sources[:1] if test_mode else self.sources

        for source in sources:
            log.info(f"📡 正在爬取: {source['name']} ({source['url']})")

            # 爬取列表页
            html = self._fetch_page(source["url"], source.get("encoding", "utf-8"))
            if not html:
                log.warning(f"⚠️  跳过 {source['name']}：无法获取页面")
                continue

            # 提取文章列表
            articles = self._extract_articles_generic(html, source["url"], source)
            log.info(f"   找到 {len(articles)} 篇文章")

            # 关键词过滤
            relevant = [a for a in articles if self._is_relevant(a, source)]
            log.info(f"   关键词匹配 {len(relevant)} 篇")

            # 增量检测
            new_articles = [a for a in relevant if self._is_new(a)]
            log.info(f"   新增文章 {len(new_articles)} 篇")

            if test_mode:
                new_articles = new_articles[:3]

            # 爬取详情页
            detail_count = 0
            for article in new_articles:
                if detail_count >= self.settings["max_detail_fetch"]:
                    break

                log.info(f"   📄 抓取详情: {article['title'][:40]}...")
                self._delay()
                detail_text = self._fetch_detail(article["url"], source.get("encoding", "utf-8"))

                if detail_text:
                    article["content"] = detail_text
                    detail_count += 1
                else:
                    article["content"] = article["title"]  # 回退到标题

                # 标记为已抓取
                self._mark_fetched(article, detail_text)
                all_new_articles.append(article)

            self._delay()

        # 更新历史记录
        self.history["last_run"] = datetime.now(BJT).isoformat()
        save_json(HISTORY_FILE, self.history)

        log.info(f"\n✅ 爬取完成：共获取 {len(all_new_articles)} 篇新文章")
        return all_new_articles


# ============================================================
# AI分析模块
# ============================================================

class PolicyAnalyzer:
    """政策分析器：调用通义千问(qwen-max-latest)进行AI分析"""

    def __init__(self):
        self.api_key = self._load_api_key()
        if not self.api_key:
            log.warning("⚠️  DASHSCOPE_API_KEY 未找到，将跳过AI分析")

    def _load_api_key(self) -> str:
        """
        按优先级读取 API Key：
        1. 环境变量 DASHSCOPE_API_KEY
        2. ~/.openclaw/openclaw.json 中的 dashscope 配置
        """
        # 优先从环境变量读取
        key = os.environ.get("DASHSCOPE_API_KEY", "")
        if key:
            log.info("🔑 API Key 来源: 环境变量")
            return key

        # 回退：从 openclaw.json 读取
        openclaw_config = Path.home() / ".openclaw" / "openclaw.json"
        if openclaw_config.exists():
            try:
                with open(openclaw_config, "r", encoding="utf-8") as f:
                    config = json.load(f)
                key = (config.get("models", {})
                       .get("providers", {})
                       .get("dashscope", {})
                       .get("apiKey", ""))
                if key:
                    log.info("🔑 API Key 来源: ~/.openclaw/openclaw.json")
                    return key
            except Exception as e:
                log.warning(f"读取 openclaw.json 失败: {e}")

        return ""

    def _call_qwen(self, prompt: str) -> str:
        """调用通义千问API（兼容OpenAI接口）"""
        if not self.api_key:
            return ""

        try:
            from openai import OpenAI
            client = OpenAI(
                api_key=self.api_key,
                base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
            )
            response = client.chat.completions.create(
                model="qwen-max-latest",
                messages=[
                    {"role": "system", "content": self._system_prompt()},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=2000,
            )
            return response.choices[0].message.content
        except ImportError:
            log.warning("openai 库未安装，尝试使用 requests 直接调用")
            return self._call_qwen_raw(prompt)
        except Exception as e:
            log.error(f"AI分析失败: {e}")
            return ""

    def _call_qwen_raw(self, prompt: str) -> str:
        """备用方案：直接用requests调用DashScope API"""
        try:
            resp = requests.post(
                "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "qwen-max-latest",
                    "messages": [
                        {"role": "system", "content": self._system_prompt()},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.3,
                    "max_tokens": 2000,
                },
                timeout=60,
            )
            data = resp.json()
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            log.error(f"AI分析失败(raw): {e}")
            return ""

    def _system_prompt(self) -> str:
        return """你是「鑫智圈」平台的汽车产业出海风控分析师。
你的任务是分析来自权威机构（商务部、海关总署、中国信保、行业协会等）的政策文章，
为中国汽车及零部件出口企业（主机厂、贸易商）提供精准的风险研判和决策建议。

分析要求：
1. 用"大白话"说清政策核心，不要照搬官话
2. 明确风险等级：🔴高危 / 🟡关注 / 🟢利好
3. 聚焦对汽车出口的具体影响
4. 给出可执行的应对建议（不是泛泛而谈）
5. 如涉及风险，提醒是否需要投保出口信用险

请严格按照以下JSON格式输出（不要输出其他内容）：
{
  "policy_brief": "一句话概括（不超过25字）",
  "risk_level": "red/yellow/green",
  "risk_type": "关税壁垒/技术标准/外汇管制/政治风险/反倾销/产业扶持/市场动态/其他",
  "affected_segments": ["整车出口", "零部件出口", "售后市场", "投资建厂"],
  "impact_analysis": "对主机厂/配件生产商/贸易商的具体影响（2-3句话）",
  "action_suggestions": [
    {"strategy": "策略方向", "action": "具体动作"},
    {"strategy": "策略方向", "action": "具体动作"}
  ],
  "insurance_hint": "是否建议投保及理由（一句话，无需投保则填空字符串）"
}"""

    def analyze_article(self, article: dict) -> dict:
        """分析单篇文章"""
        prompt = f"""请分析以下来自「{article['source_name']}」的政策/行业文章：

标题：{article['title']}

正文内容：
{article.get('content', article['title'])[:3000]}

请按要求输出JSON分析结果。"""

        log.info(f"🤖 AI分析: {article['title'][:40]}...")
        result_text = self._call_qwen(prompt)

        if not result_text:
            return self._fallback_analysis(article)

        # 解析JSON
        try:
            # 清理可能的markdown代码块标记
            cleaned = result_text.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned
                cleaned = cleaned.rsplit("```", 1)[0] if "```" in cleaned else cleaned
                cleaned = cleaned.strip()
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()

            analysis = json.loads(cleaned)
            return analysis
        except json.JSONDecodeError:
            log.warning(f"AI返回的JSON解析失败，使用原始文本")
            return self._fallback_analysis(article, result_text)

    def _fallback_analysis(self, article: dict, raw_text: str = "") -> dict:
        """AI分析失败时的回退方案"""
        return {
            "policy_brief": article["title"][:25],
            "risk_level": "yellow",
            "risk_type": "其他",
            "affected_segments": ["待分析"],
            "impact_analysis": raw_text[:200] if raw_text else "文章内容待人工分析。",
            "action_suggestions": [
                {"strategy": "关注", "action": "建议人工阅读原文进行判断"}
            ],
            "insurance_hint": ""
        }

    def analyze_batch(self, articles: list[dict]) -> list[dict]:
        """批量分析文章"""
        results = []
        for article in articles:
            analysis = self.analyze_article(article)
            article["ai_analysis"] = analysis
            results.append(article)
            time.sleep(1)  # API调用间隔
        return results


# ============================================================
# 输出格式化模块
# ============================================================

class ReportFormatter:
    """报告格式化器：生成Markdown格式的政策情报简报"""

    RISK_EMOJI = {
        "red": "🔴",
        "yellow": "🟡",
        "green": "🟢",
    }

    RISK_LABEL = {
        "red": "高风险",
        "yellow": "关注",
        "green": "利好",
    }

    def format_report(self, articles: list[dict]) -> str:
        """生成完整的政策情报简报"""
        now = datetime.now(BJT)
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:%M")

        lines = []
        lines.append(f"📋 鑫智圈·政策风控内参")
        lines.append(f"📅 {date_str} {time_str}")
        lines.append(f"📊 本次监控到 {len(articles)} 条新动态")
        lines.append("")

        if not articles:
            lines.append("✅ 今日暂无与汽车出口相关的新政策动态。")
            return "\n".join(lines)

        # 按风险等级排序：red > yellow > green
        risk_order = {"red": 0, "yellow": 1, "green": 2}
        articles.sort(
            key=lambda a: risk_order.get(
                a.get("ai_analysis", {}).get("risk_level", "yellow"), 1
            )
        )

        for i, article in enumerate(articles, 1):
            analysis = article.get("ai_analysis", {})
            risk_level = analysis.get("risk_level", "yellow")
            emoji = self.RISK_EMOJI.get(risk_level, "🟡")
            label = self.RISK_LABEL.get(risk_level, "关注")

            lines.append("━" * 30)
            lines.append(f"{emoji} [{label}] {analysis.get('policy_brief', article['title'][:25])}")
            lines.append(f"📌 来源：{article['source_name']} | 类型：{analysis.get('risk_type', '—')}")
            lines.append(f"📝 解读：{analysis.get('impact_analysis', '—')}")

            # 决策建议
            suggestions = analysis.get("action_suggestions", [])
            if suggestions:
                lines.append("💡 决策建议：")
                for j, sug in enumerate(suggestions, 1):
                    lines.append(f"  {j}. [{sug.get('strategy', '')}] {sug.get('action', '')}")

            # 信保提示
            hint = analysis.get("insurance_hint", "")
            if hint:
                lines.append(f"🛡️ 信保提示：{hint}")

            lines.append(f"🔗 原文：{article['url']}")
            lines.append("")

        lines.append("━" * 30)
        lines.append("📡 数据源：商务部/海关总署/中国信保/汽车流通协会")
        lines.append("🤖 分析引擎：鑫智圈AI政策分析系统")
        lines.append("⚠️ 以上分析仅供参考，具体决策请结合实际情况")

        return "\n".join(lines)

    def format_json_report(self, articles: list[dict]) -> dict:
        """生成JSON格式的完整报告（供后续系统对接）"""
        now = datetime.now(BJT)
        return {
            "report_id": f"RPT{now.strftime('%Y%m%d%H%M')}",
            "generated_at": now.isoformat(),
            "report_type": "鑫智圈·政策风控内参",
            "total_articles": len(articles),
            "risk_summary": {
                "red": sum(1 for a in articles if a.get("ai_analysis", {}).get("risk_level") == "red"),
                "yellow": sum(1 for a in articles if a.get("ai_analysis", {}).get("risk_level") == "yellow"),
                "green": sum(1 for a in articles if a.get("ai_analysis", {}).get("risk_level") == "green"),
            },
            "articles": [
                {
                    "title": a["title"],
                    "url": a["url"],
                    "source": a["source_name"],
                    "category": a["category"],
                    "fetch_time": a["fetch_time"],
                    "ai_analysis": a.get("ai_analysis", {}),
                }
                for a in articles
            ],
        }


# ============================================================
# 主流程
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="汽车出口政策新闻监控")
    parser.add_argument("--fetch-only", action="store_true", help="仅爬取，不调用AI分析")
    parser.add_argument("--test", action="store_true", help="测试模式：仅爬取第一个源的前3篇")
    args = parser.parse_args()

    # 禁用SSL警告（部分政府网站SSL证书有问题）
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    log.info("🚗 汽车出口政策新闻监控 启动")
    log.info(f"📅 {datetime.now(BJT).strftime('%Y-%m-%d %H:%M:%S')} (北京时间)")
    log.info("")

    # 加载配置
    config = load_json(SOURCES_FILE)
    if not config:
        log.error("❌ sources.json 配置文件不存在或为空")
        sys.exit(1)

    history = load_json(HISTORY_FILE)

    # Step 1: 爬取
    log.info("=" * 50)
    log.info("📡 Step 1: 爬取新闻列表")
    log.info("=" * 50)
    fetcher = NewsFetcher(config, history)
    new_articles = fetcher.fetch_all(test_mode=args.test)

    if not new_articles:
        log.info("📭 本次没有发现新的相关文章")
        # 仍然输出空报告
        formatter = ReportFormatter()
        report_md = formatter.format_report([])
        print("\n" + report_md)
        return

    # Step 2: AI分析
    if not args.fetch_only:
        log.info("")
        log.info("=" * 50)
        log.info("🤖 Step 2: AI政策分析")
        log.info("=" * 50)
        analyzer = PolicyAnalyzer()
        analyzed_articles = analyzer.analyze_batch(new_articles)
    else:
        analyzed_articles = new_articles
        log.info("⏭️  跳过AI分析 (--fetch-only)")

    # Step 3: 生成报告
    log.info("")
    log.info("=" * 50)
    log.info("📋 Step 3: 生成政策情报简报")
    log.info("=" * 50)
    formatter = ReportFormatter()

    # Markdown 报告（用于钉钉推送）
    report_md = formatter.format_report(analyzed_articles)

    # JSON 报告（用于后续系统对接）
    report_json = formatter.format_json_report(analyzed_articles)

    # 保存报告
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now(BJT).strftime("%Y%m%d_%H%M")

    md_path = OUTPUT_DIR / f"report_{date_str}.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(report_md)

    json_path = OUTPUT_DIR / f"report_{date_str}.json"
    save_json(json_path, report_json)

    log.info(f"📄 Markdown报告: {md_path}")
    log.info(f"📄 JSON报告: {json_path}")

    # 输出到stdout（供OpenClaw读取并推送钉钉）
    print("\n" + "=" * 50)
    print(report_md)
    print("=" * 50)

    log.info("\n✅ 监控完成！")


if __name__ == "__main__":
    main()
