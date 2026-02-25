---
name: auto-export-monitor
description: "汽车出口政策新闻监控：自动爬取商务部、海关总署、中国信保、汽车流通协会等权威网站的最新政策和行业动态，AI分析生成风险研判和决策建议。Use when: (1) 用户询问汽车出口政策/关税/法规变化, (2) 需要获取最新汽车行业新闻, (3) 定时推送政策情报简报, (4) 查询某国出口风险评级。触发词: 汽车出口、政策监控、风险预警、关税变化、出口信保、行业动态。"
version: 1.0.0
metadata:
  openclaw:
    emoji: "🚗"
    requires:
      bins:
        - python3
      env:
        - DASHSCOPE_API_KEY
    primaryEnv: DASHSCOPE_API_KEY
---

# 汽车出口政策新闻监控 (Auto Export Monitor)

## When to Use

✅ **USE this skill when:**
- 需要获取最新的汽车出口政策、关税变化、行业动态
- 定时推送《鑫智圈·政策风控内参》到钉钉群
- 用户询问某国汽车出口风险或政策
- 需要分析政策对主机厂/贸易商的影响

❌ **DON'T use this skill when:**
- 查询汽车价格或销售数据（非政策类）
- 查询国内汽车销量排名
- 非汽车行业的政策咨询

## Setup

### 1. 安装 Python 依赖

```bash
pip install requests beautifulsoup4 openai python-dotenv --break-system-packages
```

### 2. 配置环境变量

确保 `DASHSCOPE_API_KEY` 已设置（通义千问 API Key）：

```bash
export DASHSCOPE_API_KEY="your-dashscope-api-key"
```

或在 `~/.openclaw/openclaw.json` 中配置：

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "your-dashscope-api-key"
  }
}
```

## Commands

### 立即执行一次完整监控

```bash
python3 scripts/monitor.py
```

运行后会：
1. 爬取所有配置的监控源
2. 过滤出汽车出口相关的新文章
3. 用 AI 生成政策情报分析
4. 输出格式化的 Markdown 简报

### 仅爬取不分析（快速测试）

```bash
python3 scripts/monitor.py --fetch-only
```

### 查看当前监控源配置

```bash
cat scripts/sources.json
```

### 查看已抓取历史

```bash
cat scripts/history.json
```

## Output Format

每次运行输出一份《鑫智圈·政策风控内参》，格式为 Markdown，示例：

```
📋 鑫智圈·政策风控内参
📅 2026-02-24

━━━━━━━━━━━━━━━━━━━━

🔴 [高风险] 土耳其对电动车加征40%关税
📌 来源：中国信保
📝 解读：土耳其政府为保护本土品牌，大幅提高进口门槛
🏭 影响：直接打击整车出口利润，可能导致订单违约风险
💡 建议：
  1. 暂停整车(CBU)发货，评估SKD模式可行性
  2. 对在途订单投保出口信用险
  3. 关注RCEP框架下替代路径

━━━━━━━━━━━━━━━━━━━━

🟡 [关注] 商务部发布二手车出口新规
...
```

## Scheduling (定时任务)

建议通过 OpenClaw 的定时任务在每天早上 8:00 自动执行：

```
每天早上8点执行一次汽车出口政策监控，将结果发送到钉钉群
```

## Data Sources (监控源)

| 优先级 | 来源 | 分类 | 更新频率 |
|--------|------|------|----------|
| ⭐⭐⭐ | 商务部-外贸司公告 | 政府政策 | 周更 |
| ⭐⭐⭐ | 海关总署-公告栏 | 政府政策 | 日更 |
| ⭐⭐⭐ | 中国信保-新闻中心 | 出口信用险 | 周更 |
| ⭐⭐⭐ | 中国信保-国别风险 | 出口信用险 | 月更 |
| ⭐⭐⭐ | 中国汽车流通协会 | 行业新闻 | 日更 |
| ⭐⭐ | 国务院-政策文库 | 政府政策 | 日更 |
| ⭐⭐ | 中国汽车工业协会 | 行业新闻 | 日更 |
| ⭐⭐ | 商务部-对外贸易 | 政府政策 | 周更 |
