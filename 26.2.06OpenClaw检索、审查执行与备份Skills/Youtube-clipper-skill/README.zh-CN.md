# YouTube Clipper Skill

> Claude Code 的 AI 智能视频剪辑工具。下载视频、生成语义章节、剪辑片段、翻译双语字幕并烧录字幕到视频。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)

[English](README.md) | 简体中文

[功能特性](#功能特性) • [安装](#安装) • [使用方法](#使用方法) • [系统要求](#系统要求) • [配置](#配置) • [常见问题](#常见问题)

---

## 功能特性

- **AI 语义分析** - 通过理解视频内容生成精细章节（每个 2-5 分钟），而非机械按时间切分
- **精确剪辑** - 使用 FFmpeg 以帧精度提取视频片段
- **双语字幕** - 批量翻译字幕为中英双语，减少 95% 的 API 调用
- **字幕烧录** - 将双语字幕硬编码到视频中，支持自定义样式
- **内容总结** - 自动生成适合社交媒体的文案（小红书、抖音、微信公众号）

---

## 安装

### 方式 1: npx skills（推荐）

```bash
npx skills add https://github.com/op7418/Youtube-clipper-skill
```

该命令会自动将 skill 安装到 `~/.claude/skills/youtube-clipper/` 目录。

### 方式 2: 手动安装

```bash
git clone https://github.com/op7418/Youtube-clipper-skill.git
cd Youtube-clipper-skill
bash install_as_skill.sh
```

安装脚本会：
- 复制文件到 `~/.claude/skills/youtube-clipper/`
- 安装 Python 依赖（yt-dlp、pysrt、python-dotenv）
- 检查系统依赖（Python、yt-dlp、FFmpeg）
- 创建 `.env` 配置文件

---

## 系统要求

### 系统依赖

| 依赖项 | 版本 | 用途 | 安装方法 |
|--------|------|------|----------|
| **Python** | 3.8+ | 脚本执行 | [python.org](https://www.python.org/downloads/) |
| **yt-dlp** | 最新版 | YouTube 视频下载 | `brew install yt-dlp` (macOS)<br>`sudo apt install yt-dlp` (Ubuntu)<br>`pip install yt-dlp` (pip) |
| **FFmpeg with libass** | 最新版 | 视频处理和字幕烧录 | `brew install ffmpeg-full` (macOS)<br>`sudo apt install ffmpeg libass-dev` (Ubuntu) |

### Python 包

安装脚本会自动安装以下包：
- `yt-dlp` - YouTube 下载器
- `pysrt` - SRT 字幕解析器
- `python-dotenv` - 环境变量管理

### 重要：FFmpeg libass 支持

**macOS 用户注意**：Homebrew 的标准 `ffmpeg` 包不包含 libass 支持（字幕烧录必需）。你必须安装 `ffmpeg-full`：

```bash
# 卸载标准 ffmpeg（如果已安装）
brew uninstall ffmpeg

# 安装 ffmpeg-full（包含 libass）
brew install ffmpeg-full
```

**验证 libass 支持**：
```bash
ffmpeg -filters 2>&1 | grep subtitles
# 应该输出：subtitles    V->V  (...)
```

---

## 使用方法

### 在 Claude Code 中使用

只需告诉 Claude 剪辑一个 YouTube 视频：

```
Clip this YouTube video: https://youtube.com/watch?v=VIDEO_ID
```

或者

```
剪辑这个 YouTube 视频：https://youtube.com/watch?v=VIDEO_ID
```

### 工作流程

1. **环境检测** - 验证 yt-dlp、FFmpeg 和 Python 依赖
2. **视频下载** - 下载视频（最高 1080p）和英文字幕
3. **AI 章节分析** - Claude 分析字幕生成语义章节（每个 2-5 分钟）
4. **用户选择** - 选择要剪辑的章节和处理选项
5. **处理** - 剪辑视频、翻译字幕、烧录字幕（如果需要）
6. **输出** - 组织文件到 `./youtube-clips/<时间戳>/`

### 输出文件

每个剪辑的章节包含：

```
./youtube-clips/20260122_143022/
└── 章节标题/
    ├── 章节标题_clip.mp4              # 原始剪辑（无字幕）
    ├── 章节标题_with_subtitles.mp4   # 带烧录字幕的视频
    ├── 章节标题_bilingual.srt        # 双语字幕文件
    └── 章节标题_summary.md           # 社交媒体文案
```

---

## 配置

本 skill 使用环境变量进行自定义配置。编辑 `~/.claude/skills/youtube-clipper/.env`：

### 主要设置

```bash
# FFmpeg 路径（留空则自动检测）
FFMPEG_PATH=

# 输出目录（默认：当前工作目录）
OUTPUT_DIR=./youtube-clips

# 视频质量限制（720、1080、1440、2160）
MAX_VIDEO_HEIGHT=1080

# 翻译批次大小（推荐 20-25）
TRANSLATION_BATCH_SIZE=20

# 目标翻译语言
TARGET_LANGUAGE=中文

# 目标章节时长（秒，推荐 180-300）
TARGET_CHAPTER_DURATION=180
```

完整配置选项请参见 [.env.example](.env.example)。

---

## 使用示例

### 示例 1：从技术访谈中提取精华

**输入**：
```
剪辑这个视频：https://youtube.com/watch?v=Ckt1cj0xjRM
```

**输出**（AI 生成的章节）：
```
1. [00:00 - 03:15] AGI 是指数曲线而非时间点
2. [03:15 - 06:30] 中国在 AI 领域的差距
3. [06:30 - 09:45] 芯片禁令的影响
...
```

**结果**：选择章节 → 获得带双语字幕的剪辑视频 + 社交媒体文案

### 示例 2：从课程视频创建短片

**输入**：
```
剪辑这个讲座视频并创建双语字幕：https://youtube.com/watch?v=LECTURE_ID
```

**选项**：
- 生成双语字幕：是
- 烧录字幕到视频：是
- 生成总结：是

**结果**：可直接在社交媒体平台分享的高质量剪辑视频

---

## 核心差异化功能

### AI 语义章节分析

与机械按时间切分不同，本 skill 使用 Claude AI 来：
- 理解内容语义
- 识别自然的主题转换点
- 生成有意义的章节标题和摘要
- 确保完整覆盖，无遗漏

**示例**：
```
❌ 机械切分：[0:00-30:00]、[30:00-60:00]
✅ AI 语义分析：
   - [00:00-03:15] AGI 定义
   - [03:15-07:30] 中国的 AI 格局
   - [07:30-12:00] 芯片禁令影响
```

### 批量翻译优化

一次翻译 20 条字幕，而非逐条翻译：
- 减少 95% 的 API 调用
- 速度提升 10 倍
- 更好的翻译一致性

### 双语字幕格式

生成的字幕文件同时包含英文和中文：

```srt
1
00:00:00,000 --> 00:00:03,500
This is the English subtitle
这是中文字幕

2
00:00:03,500 --> 00:00:07,000
Another English line
另一行中文
```

---

## 常见问题

### FFmpeg 字幕烧录失败

**错误**：`Option not found: subtitles` 或 `filter not found`

**解决方案**：安装 `ffmpeg-full`（macOS）或确保安装了 `libass-dev`（Ubuntu）：
```bash
# macOS
brew uninstall ffmpeg
brew install ffmpeg-full

# Ubuntu
sudo apt install ffmpeg libass-dev
```

### 视频下载速度慢

**解决方案**：在 `.env` 中设置代理：
```bash
YT_DLP_PROXY=http://proxy-server:port
# 或
YT_DLP_PROXY=socks5://proxy-server:port
```

### 字幕翻译失败

**原因**：API 限流或网络问题

**解决方案**：skill 会自动重试最多 3 次。如果持续失败，请检查：
- 网络连接
- Claude API 状态
- 减少 `.env` 中的 `TRANSLATION_BATCH_SIZE`

### 文件名包含特殊字符

**问题**：文件名中的 `:`、`/`、`?` 等可能导致错误

**解决方案**：skill 会自动清理文件名：
- 移除特殊字符：`/ \ : * ? " < > |`
- 将空格替换为下划线
- 限制长度为 100 字符

---

## 文档

- **[SKILL.md](SKILL.md)** - 完整工作流程和技术细节
- **[TECHNICAL_NOTES.md](TECHNICAL_NOTES.md)** - 实现笔记和设计决策
- **[FIXES_AND_IMPROVEMENTS.md](FIXES_AND_IMPROVEMENTS.md)** - 更新日志和 Bug 修复
- **[references/](references/)** - FFmpeg、yt-dlp 和字幕格式指南

---

## 贡献

欢迎贡献！请：
- 通过 [GitHub Issues](https://github.com/op7418/Youtube-clipper-skill/issues) 报告 Bug
- 提交功能请求
- 为改进提交 Pull Request

---

## 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

---

## 致谢

- **[Claude Code](https://claude.ai/claude-code)** - AI 驱动的 CLI 工具
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** - YouTube 下载引擎
- **[FFmpeg](https://ffmpeg.org/)** - 视频处理利器

---

<div align="center">

**Made with ❤️ by [op7418](https://github.com/op7418)**

如果这个 skill 对你有帮助，请给个 ⭐️

</div>
