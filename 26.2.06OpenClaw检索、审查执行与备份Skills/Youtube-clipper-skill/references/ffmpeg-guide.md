# FFmpeg 使用指南

FFmpeg 是一个强大的多媒体处理工具，本文档介绍在 YouTube Clipper 中使用的核心命令。

## 安装

### macOS
```bash
# 标准版本（不支持字幕烧录）
brew install ffmpeg

# 完整版本（推荐，支持字幕烧录）
brew install ffmpeg-full
```

### Linux (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install ffmpeg libass-dev
```

### 验证安装
```bash
# 检查版本
ffmpeg -version

# 检查 libass 支持（字幕烧录必需）
ffmpeg -filters 2>&1 | grep subtitles
```

## 常用命令

### 1. 剪辑视频

```bash
# 精确剪辑（从 30 秒开始，持续 60 秒）
ffmpeg -ss 30 -i input.mp4 -t 60 -c copy output.mp4

# 从 01:30:00 到 01:33:15
ffmpeg -ss 01:30:00 -i input.mp4 -to 01:33:15 -c copy output.mp4
```

**参数说明**:
- `-ss`: 起始时间
- `-i`: 输入文件
- `-t`: 持续时间
- `-to`: 结束时间
- `-c copy`: 直接复制流，不重新编码（快速且无损）

### 2. 烧录字幕

```bash
# 烧录 SRT 字幕到视频
ffmpeg -i input.mp4 \
  -vf "subtitles=subtitle.srt" \
  -c:a copy \
  output.mp4

# 自定义字幕样式
ffmpeg -i input.mp4 \
  -vf "subtitles=subtitle.srt:force_style='FontSize=24,MarginV=30'" \
  -c:a copy \
  output.mp4
```

**注意**:
- 需要 libass 支持
- 路径不能包含空格（使用临时目录解决）
- 视频会重新编码（比剪辑慢）

### 3. 视频压缩

```bash
# 使用 H.264 压缩
ffmpeg -i input.mp4 \
  -c:v libx264 \
  -crf 23 \
  -c:a aac \
  output.mp4
```

**CRF 值**:
- 18: 高质量，文件较大
- 23: 平衡（推荐）
- 28: 低质量，文件较小

### 4. 提取音频

```bash
# 提取为 MP3
ffmpeg -i input.mp4 -vn -acodec libmp3lame -q:a 2 output.mp3

# 提取为 AAC
ffmpeg -i input.mp4 -vn -c:a copy output.aac
```

### 5. 视频信息

```bash
# 查看视频详细信息
ffmpeg -i input.mp4

# 查看简洁信息
ffprobe -v error -show_format -show_streams input.mp4
```

## 字幕相关

### 烧录双语字幕

```bash
# 双语字幕（每条字幕包含两行）
ffmpeg -i input.mp4 \
  -vf "subtitles=bilingual.srt:force_style='FontSize=24,MarginV=30'" \
  -c:a copy \
  output.mp4
```

### 调整字幕样式

可用样式选项：
- `FontSize`: 字体大小（推荐 20-28）
- `MarginV`: 垂直边距（推荐 20-40）
- `FontName`: 字体名称
- `PrimaryColour`: 主要颜色
- `OutlineColour`: 描边颜色
- `Bold`: 粗体（0 或 1）

示例：
```bash
subtitles=subtitle.srt:force_style='FontSize=28,MarginV=40,Bold=1'
```

## 性能优化

### 硬件加速

```bash
# macOS (VideoToolbox)
ffmpeg -hwaccel videotoolbox -i input.mp4 ...

# NVIDIA GPU
ffmpeg -hwaccel cuda -i input.mp4 ...
```

### 多线程

```bash
# 使用 4 个线程
ffmpeg -threads 4 -i input.mp4 ...
```

## 常见问题

### Q: 字幕烧录失败，提示 "No such filter: 'subtitles'"

A: FFmpeg 没有 libass 支持。macOS 需要安装 `ffmpeg-full`。

### Q: 路径包含空格导致字幕烧录失败

A: 使用临时目录，将文件复制到无空格路径再处理。

### Q: 视频质量下降

A: 使用 `-c copy` 直接复制流，或降低 CRF 值（如 18）。

### Q: 处理速度慢

A:
- 使用硬件加速 (`-hwaccel`)
- 剪辑时使用 `-c copy`
- 增加线程数 (`-threads`)

## 参考链接

- [FFmpeg 官方文档](https://ffmpeg.org/documentation.html)
- [FFmpeg Wiki](https://trac.ffmpeg.org/wiki)
- [Subtitles 滤镜文档](https://ffmpeg.org/ffmpeg-filters.html#subtitles)
