# 🚗 汽车出口政策新闻监控 (Auto Export Monitor)

> 鑫智圈·AI政策风控内参 — 让中国汽车出海企业每天第一时间掌握政策动向

## 功能概述

自动爬取国内权威机构网站的最新政策和行业动态，通过AI分析生成风险研判和决策建议，
以《鑫智圈·政策风控内参》的形式推送到钉钉群。

**核心能力：**
- 📡 多源爬取：商务部、海关总署、中国信保、汽车流通协会等8个权威数据源
- 🔍 智能过滤：关键词匹配 + 增量检测，只推送新的、相关的内容
- 🤖 AI研判：通义千问大模型分析政策影响，生成风险等级和决策建议
- 📋 结构化输出：Markdown简报（钉钉推送）+ JSON报告（系统对接）

## 快速开始

### 1. 安装依赖

```bash
pip install requests beautifulsoup4 openai python-dotenv --break-system-packages
```

### 2. 配置 API Key

```bash
export DASHSCOPE_API_KEY="your-dashscope-api-key"
```

### 3. 部署到 OpenClaw

```bash
# 将整个目录复制到 OpenClaw skills 目录
cp -r auto-export-monitor/ /path/to/your/openclaw/skills/
```

### 4. 运行

```bash
# 完整运行（爬取 + AI分析）
python3 scripts/monitor.py

# 测试模式（只爬第一个源的前3篇，快速验证）
python3 scripts/monitor.py --test

# 仅爬取不分析（快速查看能抓到什么）
python3 scripts/monitor.py --fetch-only
```

## 输出示例

```
📋 鑫智圈·政策风控内参
📅 2026-02-24 08:00
📊 本次监控到 3 条新动态

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 [高风险] 土耳其对华电车加税40%
📌 来源：中国信保 | 类型：关税壁垒
📝 解读：土耳其政府为保护本土TOGG品牌，大幅提高进口门槛。直接打击整车出口利润。
💡 决策建议：
  1. [模式切换] 暂停CBU整车发货，切换为SKD半散件模式出口
  2. [风险对冲] 对在途订单投保出口信用险，防止买方违约
🛡️ 信保提示：强烈建议投保，关税突变属于典型国家风险
🔗 原文：https://...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🟢 [利好] 广东省加大汽配出口扶持力度
📌 来源：商务部 | 类型：产业扶持
📝 解读：新一轮出海扶持资金开放申报，最高200万。
💡 决策建议：
  1. [资金申报] 符合条件的企业尽快准备申报材料
  2. [政策研究] 关注其他省市是否跟进类似政策
🔗 原文：https://...
```

## 目录结构

```
auto-export-monitor/
├── SKILL.md              # OpenClaw 技能描述文件（入口）
├── README.md             # 本文件
└── scripts/
    ├── monitor.py        # 主脚本（爬取 + AI分析 + 输出）
    ├── sources.json      # 监控源配置（URL、关键词、优先级）
    ├── history.json      # 已抓取文章记录（增量检测）
    └── output/           # 生成的报告存放目录
        ├── report_YYYYMMDD_HHMM.md    # Markdown报告
        └── report_YYYYMMDD_HHMM.json  # JSON报告
```

## 配置说明

### sources.json

- `sources`: 监控源列表，每个源包含URL、分类、优先级、关键词
- `filter_keywords`: 全局过滤关键词，文章标题需命中至少一个
- `settings`: 爬虫设置（超时、延迟、最大抓取数等）

### 新增监控源

在 `sources.json` 的 `sources` 数组中添加：

```json
{
  "id": "new_source",
  "name": "新数据源名称",
  "category": "分类",
  "url": "https://example.com/news/",
  "priority": 2,
  "update_freq": "daily",
  "encoding": "utf-8",
  "keywords_boost": ["汽车", "出口"]
}
```

## 定时任务

通过 OpenClaw 对话设置：

```
请每天早上8点自动执行汽车出口政策监控，将结果发送到钉钉群
```

或通过系统 crontab：

```bash
# 每天早上8点执行
0 8 * * * cd /path/to/skills/auto-export-monitor && python3 scripts/monitor.py
```

## 后续扩展

当前Demo覆盖8个核心数据源。根据 `汽车出口新闻政策监控URL.xlsx` 规划，
后续可扩展至28个数据源，覆盖：
- 跨境物流/清关（阿联酋海关、泰国海关）
- 检验认证（中检集团、蚂蚁链）
- AI验车技术（百度智能云、腾讯云）
- VIN/车况数据（查博士、瓜子二手车）
