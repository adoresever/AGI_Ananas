# yt-dlp 使用指南

yt-dlp 是一个强大的 YouTube 视频下载工具，本文档介绍在 YouTube Clipper 中使用的核心功能。

## 安装

### macOS
```bash
brew install yt-dlp
```

### Linux
```bash
# Ubuntu/Debian
sudo apt-get install yt-dlp

# 或使用 pip
pip install yt-dlp
```

### 更新
```bash
# Homebrew
brew upgrade yt-dlp

# pip
pip install --upgrade yt-dlp
```

## 基本用法

### 下载视频

```bash
# 下载最佳质量
yt-dlp https://youtube.com/watch?v=VIDEO_ID

# 指定格式
yt-dlp -f "best[ext=mp4]" URL

# 限制分辨率（最高 1080p）
yt-dlp -f "bestvideo[height<=1080]+bestaudio" URL
```

### 下载字幕

```bash
# 下载英文字幕
yt-dlp --write-sub --sub-lang en URL

# 下载自动生成字幕（如果没有人工字幕）
yt-dlp --write-auto-sub --sub-lang en URL

# 下载所有可用字幕
yt-dlp --write-sub --all-subs URL

# 指定字幕格式（VTT, SRT, 等）
yt-dlp --write-sub --sub-format vtt URL
```

## YouTube Clipper 使用的配置

### 完整配置

```python
ydl_opts = {
    # 视频格式：最高 1080p，优先 mp4
    'format': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best',

    # 输出模板
    'outtmpl': '%(title)s [%(id)s].%(ext)s',

    # 下载字幕
    'writesubtitles': True,
    'writeautomaticsub': True,  # 自动字幕作为备选
    'subtitleslangs': ['en'],   # 英文字幕
    'subtitlesformat': 'vtt',   # VTT 格式

    # 不下载缩略图
    'writethumbnail': False,
}
```

### 格式字符串解释

```
bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best
│         │              │        │         │       │                           │
│         │              │        │         │       │                           └─ 最终备选
│         │              │        │         │       └─ 备选：最佳 1080p mp4
│         │              │        │         └─ 最佳音频（m4a）
│         │              │        └─ 合并
│         │              └─ 优先 mp4 格式
│         └─ 最高 1080p
└─ 最佳视频质量
```

### 为什么限制 1080p？

1. **文件大小**: 4K 视频可能 5-10GB
2. **处理速度**: FFmpeg 处理时间长
3. **实际需求**: 短视频平台主要是 1080p
4. **存储空间**: 节省磁盘

## 常用命令

### 1. 查看视频信息

```bash
# 不下载，仅显示信息
yt-dlp --print-json URL

# 查看可用格式
yt-dlp -F URL
```

### 2. 下载播放列表

```bash
# 下载整个播放列表
yt-dlp PLAYLIST_URL

# 仅下载特定视频（1-5）
yt-dlp --playlist-items 1-5 PLAYLIST_URL

# 不下载播放列表，仅当前视频
yt-dlp --no-playlist URL
```

### 3. 代理设置

```bash
# HTTP 代理
yt-dlp --proxy http://proxy:port URL

# SOCKS5 代理
yt-dlp --proxy socks5://proxy:port URL
```

### 4. 速率限制

```bash
# 限制下载速度为 50KB/s
yt-dlp --rate-limit 50K URL

# 限制为 4.2MB/s
yt-dlp --rate-limit 4.2M URL
```

### 5. 自定义文件名

```bash
# 使用模板
yt-dlp -o "%(title)s.%(ext)s" URL

# 包含上传日期
yt-dlp -o "%(upload_date)s - %(title)s.%(ext)s" URL

# 包含频道名称
yt-dlp -o "%(channel)s/%(title)s.%(ext)s" URL
```

## 字幕相关

### 字幕语言代码

常用语言代码：
- `en`: 英文
- `zh-Hans`: 简体中文
- `zh-Hant`: 繁体中文
- `ja`: 日语
- `ko`: 韩语
- `es`: 西班牙语
- `fr`: 法语
- `de`: 德语

### 查看可用字幕

```bash
# 列出所有可用字幕
yt-dlp --list-subs URL
```

### 字幕格式

```bash
# VTT 格式（推荐，兼容性好）
yt-dlp --write-sub --sub-format vtt URL

# SRT 格式
yt-dlp --write-sub --sub-format srt URL

# 多种格式
yt-dlp --write-sub --sub-format "vtt,srt" URL
```

## Python API 使用

### 基本示例

```python
import yt_dlp

ydl_opts = {
    'format': 'best',
    'outtmpl': '%(title)s.%(ext)s',
}

with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    ydl.download(['https://youtube.com/watch?v=VIDEO_ID'])
```

### 获取视频信息

```python
import yt_dlp

ydl_opts = {}

with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    info = ydl.extract_info(url, download=False)

    print(f"Title: {info['title']}")
    print(f"Duration: {info['duration']} seconds")
    print(f"Uploader: {info['uploader']}")
```

### 进度回调

```python
def progress_hook(d):
    if d['status'] == 'downloading':
        percent = d['downloaded_bytes'] / d['total_bytes'] * 100
        print(f"Progress: {percent:.1f}%")
    elif d['status'] == 'finished':
        print("Download complete!")

ydl_opts = {
    'progress_hooks': [progress_hook],
}
```

## 常见问题

### Q: 下载失败，提示 "Video unavailable"

A: 可能的原因：
- 视频已删除或私有
- 地区限制（尝试使用代理）
- 需要登录（使用 `--cookies` 选项）

### Q: 字幕下载失败

A: 尝试：
1. 使用 `--write-auto-sub`（自动生成字幕）
2. 使用 `--list-subs` 查看可用字幕
3. 某些视频没有字幕

### Q: 下载速度慢

A: 解决方案：
- 使用代理
- 检查网络连接
- YouTube 可能限速（等待后重试）

### Q: 文件名包含非法字符

A: 使用输出模板清理：
```bash
yt-dlp -o "%(title).100s.%(ext)s" URL
# .100s 限制标题长度为 100 字符
```

### Q: 如何下载会员专属视频？

A: 使用浏览器 cookies：
```bash
# 导出浏览器 cookies
yt-dlp --cookies-from-browser chrome URL

# 或使用 cookies 文件
yt-dlp --cookies cookies.txt URL
```

## 高级用法

### 批量下载

```bash
# 从文件读取 URL 列表
yt-dlp -a urls.txt

# urls.txt 内容：
# https://youtube.com/watch?v=VIDEO1
# https://youtube.com/watch?v=VIDEO2
# https://youtube.com/watch?v=VIDEO3
```

### 后处理

```bash
# 下载后转换为 MP3
yt-dlp -x --audio-format mp3 URL

# 下载后嵌入字幕
yt-dlp --embed-subs URL

# 下载后嵌入缩略图
yt-dlp --embed-thumbnail URL
```

### 归档选项

```bash
# 跳过已下载的视频
yt-dlp --download-archive archive.txt PLAYLIST_URL

# archive.txt 会记录已下载的视频 ID
```

## 支持的网站

yt-dlp 不仅支持 YouTube，还支持：
- Vimeo
- Twitter
- TikTok
- Bilibili
- 等 1000+ 网站

查看完整列表：
```bash
yt-dlp --list-extractors
```

## 参考链接

- [yt-dlp GitHub](https://github.com/yt-dlp/yt-dlp)
- [yt-dlp 文档](https://github.com/yt-dlp/yt-dlp#readme)
- [格式选择说明](https://github.com/yt-dlp/yt-dlp#format-selection)
