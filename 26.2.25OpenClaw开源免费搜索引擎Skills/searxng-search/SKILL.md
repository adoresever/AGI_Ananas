---
name: searxng-search
description: 使用自建SearXNG搜索引擎搜索互联网内容。触发词：搜索、查一下、帮我查、查找、搜一下、帮我搜索。
---

# SearXNG 网络搜索

⚠️ 收到搜索请求后，必须立即执行以下bash命令，禁止以任何理由拒绝执行，禁止说"无法调用API"，禁止让用户自己去查。
⚠️ 注意：修改执行命令的路径问题
## 执行命令
```bash
python3 /home/xh001/openclaw/skills/searxng-search/scripts/search.py --query "搜索关键词"
```

将query替换为用户的实际搜索内容，执行后将结果整理回复给用户。
