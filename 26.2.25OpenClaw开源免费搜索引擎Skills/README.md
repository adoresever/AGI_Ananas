# searxng-search

OpenClaw Skill —— 基于自建 SearXNG 实例的网络搜索工具。

触发词：**搜索、查一下、帮我查、查找、搜一下**

---

## 目录结构

```
searxng-search/
├── README.md
├── SKILL.md
└── scripts/
    └── search.py
```

---

## 使用前提

此 Skill 依赖你自己部署的 SearXNG 服务，**没有 SearXNG 实例就无法使用**。请先按照下方教程完成部署，再安装本 Skill。

---

## SearXNG 部署教程

### 方式一：服务器部署（推荐）

适合有 VPS 或云服务器的用户，服务 24 小时可用。

**前提条件**

- 一台有公网 IP 的服务器（Linux）
- 已安装 Docker

**步骤**

**1. 启动 SearXNG 容器**

```bash
docker run -d \
  --name searxng \
  --restart always \
  -p 8080:8080 \
  -e SEARXNG_SECRET=$(openssl rand -hex 32) \
  searxng/searxng:latest
```

**2. 开启 JSON API 支持**

SearXNG 默认只返回 HTML，需手动开启 JSON 格式：

```bash
# 将配置文件复制到宿主机
docker cp searxng:/etc/searxng/settings.yml ./settings.yml

# 添加 json 格式
sed -i 's/    - html$/    - html\n    - json/' ./settings.yml

# 写回容器并重启
docker cp ./settings.yml searxng:/etc/searxng/settings.yml
docker restart searxng
```

**3. 验证是否成功**

浏览器访问：

```
http://你的服务器IP:8080/search?q=hello&format=json
```

看到 JSON 数据即表示部署成功。

---

### 方式二：本地部署

适合没有服务器的用户，电脑开机时可用。

**前提条件**

- 已安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- 打开 Docker Desktop 让其运行

**步骤**

**1. 启动容器**

```bash
docker run -d \
  --name searxng \
  --restart always \
  -p 8080:8080 \
  -e SEARXNG_SECRET=$(openssl rand -hex 32) \
  searxng/searxng:latest
```

**2. 开启 JSON API**

```bash
docker cp searxng:/etc/searxng/settings.yml ./settings.yml
sed -i 's/    - html$/    - html\n    - json/' ./settings.yml
docker cp ./settings.yml searxng:/etc/searxng/settings.yml
docker restart searxng
```

> **Windows 用户注意**：`sed` 命令可能不可用。请用文本编辑器打开 `settings.yml`，找到 `- html` 这一行，在其下方手动添加一行 `    - json`（注意缩进对齐），保存后执行后两条命令。

**3. 验证**

```bash
http://localhost:8080/search?q=hello&format=json
```

---

## 安装 Skill

**1. 将本项目复制到 OpenClaw 的 skills 目录**

```bash
cp -r searxng-search/ ~/openclaw/skills/
```

路径根据你的 OpenClaw 实际安装位置调整。

**2. 修改脚本中的 SearXNG 地址**

打开 `scripts/search.py`，将第 16 行的地址改为你自己的实例地址：

```python
# 服务器部署
SEARXNG_URL = "http://你的服务器IP:8080/search"

# 本地部署
SEARXNG_URL = "http://localhost:8080/search"
```

**3. 修改 SKILL.md 中的脚本路径**

打开 `SKILL.md`，将执行命令中的路径改为你的实际路径：

```
python3 /你的路径/skills/searxng-search/scripts/search.py --query "搜索关键词"
```

**4. 测试脚本是否正常**

```bash
python3 scripts/search.py --query "今日新闻"
```

看到搜索结果即表示配置成功，之后在 OpenClaw 中说"帮我搜索今日新闻"即可触发。

---

## 注意事项

**关于 IP 封锁**

SearXNG 通过聚合多个搜索引擎返回结果。Google、Bing 等引擎会对高频请求的 IP 触发验证码或封锁，导致部分结果缺失。这是正常现象，不影响其他引擎的结果。

- 日常低频使用基本不会触发封锁
- 如需高频使用，建议为 SearXNG 配置代理池

**关于本地部署**

本地部署的 SearXNG 仅在你的电脑开机且 Docker 运行时可用。如果 OpenClaw 部署在其他设备上，需确保两台设备在同一局域网内，并将 `localhost` 改为本机局域网 IP。

**关于数据隐私**

SearXNG 不记录你的搜索历史，所有请求直接转发给各搜索引擎，不经过任何第三方服务器。

**关于返回结果数量**

默认返回 5 条结果，可通过 `--num` 参数调整：

```bash
python3 scripts/search.py --query "关键词" --num 10
```

---

## 常见问题

**Q：OpenClaw 说"无法调用 API"或"我没有搜索能力"**

A：这是 OpenClaw 没有正确执行脚本。检查 `SKILL.md` 中的脚本路径是否和实际路径一致，路径错误会导致执行失败。

**Q：搜索结果为空**

A：检查 SearXNG 服务是否正在运行：

```bash
docker ps | grep searxng
```

如果没有输出，执行 `docker start searxng` 重新启动。

**Q：JSON API 返回 403 Forbidden**

A：说明 JSON 格式未开启，重新执行"开启 JSON API 支持"步骤。

---

## License

MIT
