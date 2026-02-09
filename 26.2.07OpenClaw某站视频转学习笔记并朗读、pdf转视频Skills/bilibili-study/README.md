# Bilibili 视频学习笔记生成器

将 B站视频转化为口语化、可朗读的学习笔记。

## 功能

- 🔍 搜索 B站视频（关键词）
- 📥 下载字幕（优先官方字幕）
- ✂️ 语义切片（5句/200字切分）
- 📝 LLM 生成口语化笔记
- 💾 Markdown 格式输出

## 第一步：安装依赖

```bash
# 克隆或进入项目目录
cd bilibili-study

# 安装 Python 依赖
pip install -r requirements.txt
```

## 第二步：安装 FFmpeg（重要！）

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
1. 下载地址：https://www.gyan.dev/ffmpeg/builds/
2. 下载 `ffmpeg-release-essentials.zip`
3. 解压到 `C:\ffmpeg`
4. 将 `C:\ffmpeg\bin` 添加到系统环境变量 PATH

---

## 第三步：配置 API Key（必需）

### 获取 DeepSeek API Key

1. 打开 https://platform.deepseek.com
2. 注册/登录账号
3. 点击 **API Keys** → **Create New API Key**
4. 复制生成的 API Key（格式：`sk-xxxxxxx`）

### 配置环境变量

```bash
# 复制配置文件
cp .env.example .env

# 编辑配置文件（Windows 用 notepad，Mac/Linux 用 nano）
nano .env
```

`.env` 文件内容如下：

```bash
# 必填：DeepSeek API 配置
OPENAI_API_KEY=你的API_Key粘贴在这里
OPENAI_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat

# 可选：B站 Cookie（提升下载稳定性）
# 获取方法见下方"第四步"
BILIBILI_COOKIE=
```

**重要：把 `你的API_Key粘贴在这里` 替换成你真实的 API Key！**

---

## 第四步：配置 B站 Cookie（推荐）

> 💡 这一步**推荐但可选**。有 Cookie 下载更稳定，没有也能用。

### 方法一：使用命令自动获取（推荐）

确保你已用浏览器登录 B站，然后运行：

```bash
# Chrome 浏览器
yt-dlp --cookies-from-browser chrome --cookies src/cookie.txt

# Firefox 浏览器
yt-dlp --cookies-from-browser firefox --cookies src/cookie.txt
```

### 方法二：手动获取（按图操作）

1. 用浏览器打开 https://www.bilibili.com 并**登录**
2. 按 `F12` 打开开发者工具
3. 切换到 **Network（网络）** 标签
4. 刷新页面
5. 点击第一个请求
6. 找到 **Request Headers** → **cookie:**
7. 复制 **cookie:** 后面**所有内容**
8. 打开 `src/cookie.txt`，粘贴覆盖原内容

> 📁 参考截图：请查看 `获取cookie步骤/` 目录下的示意图

---

## 第五步：测试运行

```bash
# 处理单个视频（把链接换成你的）
python -m src.cli https://www.bilibili.com/video/BV1ux411c7hV

# 或搜索 UP 主的所有视频
python -m src.cli --up 纳米机器人

# 或关键词搜索
python -m src.cli --search GPT-4 教程
```

---

## 输出文件位置

```
study_notes/
└── {UP主名}/
    └── {日期}/
        ├── {视频标题}.md           # 口语化笔记（主要看这个）
        └── {视频标题}_original.txt # 原始字幕（可选）
```

---

## 常见问题

**Q: 提示 "No module named xxx"**
A: 运行 `pip install -r requirements.txt` 安装依赖

**Q: 字幕下载失败**
A: 尝试配置 B站 Cookie（第四步），或视频可能没有字幕

**Q: API 调用报错**
A: 检查 `.env` 中的 API Key 是否正确填入

**Q: FFmpeg 未找到**
A: 确认 FFmpeg 已安装并添加到系统 PATH

**Q: 提示 "bili bvid invalid"**
A: 检查视频链接格式是否正确，应为 https://www.bilibili.com/video/BVxxx

---

## 依赖列表

| 包名 | 用途 |
|------|------|
| yt-dlp | 视频/字幕下载 |
| requests | B站 API 请求 |
| webvtt-py | 字幕格式解析 |
| opencc | 繁简中文转换 |
| openai | LLM API 调用 |
| python-dotenv | 环境变量管理 |
| ffmpeg | 视频转录（系统级） |
