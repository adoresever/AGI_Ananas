---
name: bilibili-study
description: >
  Bilibili 视频学习笔记生成工具。输入 B站视频链接或 UP 主名，
  自动下载字幕并使用 LLM 生成**口语化、可朗读**的学习笔记。
  输出格式简洁精炼，适合转化为语音播客或有声读物。
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
model: claude-sonnet-4-5-20250514
---

# Bilibili 视频学习笔记生成器

本 Skill 用于将 B站视频快速转化为口语化、可朗读的学习笔记。

## 功能特性

- **视频搜索**：支持按 UP 主名或关键词搜索 B站视频
- **字幕下载**：自动下载官方字幕，无字幕时可选 ASR 转录
- **语义切片**：按"5句/200字"策略切分，保持语义完整
- **口语笔记**：LLM 生成简洁、可朗读的学习笔记
- **多格式输出**：Markdown 笔记 + 原始字幕文本

## 使用方式

### 方式 1：提供视频链接

```
请帮我处理这个 B站视频：https://www.bilibili.com/video/BVxxx
```

### 方式 2：搜索 UP 主

```
搜索 UP 主"纳米机器人"的视频
```

### 方式 3：关键词搜索

```
搜索"GPT-4 提示词"相关的 B站教程
```

## 输出示例

处理完成后生成的文件结构：

```
study_notes/
└── {UP主名}/
    └── {日期}/
        ├── {视频标题}.md
        └── {视频标题}_original.txt
```

**笔记内容预览：**

```markdown
# GPT-4 提示词完全指南

> 来源：https://www.bilibili.com/video/BVxxx
> UP主：xxx | 时长：32分钟

## 核心要点

**第一，明确任务目标。** 直接告诉 AI 你要什么，不要让它猜。

**第二，提供示例。** 告诉它"像这样写"，比描述风格更有效。

**第三，拆分任务。** 大问题拆成小步骤，一步步来。

## 详细内容

[00:00] 开场介绍...

[05:23] 首先，我们来...

## 总结

掌握 GPT-4 提示词的三个核心技巧：目标明确、给例子、拆任务。
```

## 技术实现

部分代码复用自 [ChatVid](https://github.com/anomalyco/ChatVid) 项目：
- B站搜索：`fetcher.py::search_bilibili`
- 字幕下载：`fetcher.py::download_subs_and_process_bilibili`
- 字幕解析：`processor.py::parse_vtt_to_semantic_chunks`
- 语义切片：`processor.py::semantic_chunking`

## 环境配置

1. 安装依赖：`pip install -r requirements.txt`
2. 配置 `.env` 文件（可选，提升下载稳定性）
3. 运行：`python -m src.cli <视频链接>`
