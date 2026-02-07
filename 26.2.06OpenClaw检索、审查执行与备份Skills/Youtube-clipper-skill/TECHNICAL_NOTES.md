# 技术坑点记录

本文档记录 YouTube Clipper Skill 开发过程中遇到的关键技术问题和解决方案。

## 1. FFmpeg libass 支持问题

### 问题描述
标准 Homebrew FFmpeg 不包含 libass 库，导致无法使用 `subtitles` 滤镜烧录字幕。

### 错误信息
```
No such filter: 'subtitles'
```

或者在检查滤镜时：
```bash
$ ffmpeg -filters 2>&1 | grep subtitles
# 无输出
```

### 根本原因
- Homebrew 的标准 `ffmpeg` formula 为了减小包体积，不包含某些非核心库
- libass 是字幕渲染库，用于 `subtitles` 滤镜
- 没有 libass，FFmpeg 无法烧录字幕到视频

### 解决方案

#### macOS
使用 `ffmpeg-full` 替代标准 FFmpeg：

```bash
# 安装 ffmpeg-full
brew install ffmpeg-full

# 路径（Apple Silicon）
/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg

# 路径（Intel）
/usr/local/opt/ffmpeg-full/bin/ffmpeg

# 验证 libass 支持
/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg -filters 2>&1 | grep subtitles
```

#### 其他系统
从源码编译 FFmpeg，确保包含 libass：

```bash
# Ubuntu/Debian
sudo apt-get install libass-dev
./configure --enable-libass
make
sudo make install

# 验证
ffmpeg -filters 2>&1 | grep subtitles
```

### 检测逻辑
`burn_subtitles.py` 中实现的检测逻辑：

1. 优先检查 `ffmpeg-full` 路径（macOS）
2. 检查标准 `ffmpeg` 是否支持 libass
3. 如果都不满足，提示安装指南

```python
def detect_ffmpeg_variant():
    # 检查 ffmpeg-full（macOS）
    if platform.system() == 'Darwin':
        full_path = '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg'
        if Path(full_path).exists():
            return {'type': 'full', 'path': full_path}

    # 检查标准 ffmpeg
    standard_path = shutil.which('ffmpeg')
    if standard_path:
        has_libass = check_libass_support(standard_path)
        return {'has_libass': has_libass}
```

---

## 2. 文件路径空格问题

### 问题描述
FFmpeg `subtitles` 滤镜无法正确处理包含空格的文件路径，即使使用引号或转义也无效。

### 错误信息
```
[Parsed_subtitles_0 @ 0x...] Unable to find '/path/with'
```

注意路径被截断在空格处（`/path/with spaces` → `/path/with`）。

### 示例
```bash
# 失败的尝试
ffmpeg -i video.mp4 -vf "subtitles='/path/with spaces/sub.srt'" output.mp4
ffmpeg -i video.mp4 -vf "subtitles=/path/with\ spaces/sub.srt" output.mp4
ffmpeg -i video.mp4 -vf subtitles="'/path/with spaces/sub.srt'" output.mp4

# 都会报错：Unable to find '/path/with'
```

### 根本原因
FFmpeg `subtitles` 滤镜的路径解析存在 bug，无法正确处理：
- 引号内的空格
- 转义的空格
- 混合引号

这是 FFmpeg 的已知限制。

### 解决方案：使用临时目录

核心思路：将文件复制到**无空格路径**的临时目录，处理后再移回。

```python
import tempfile
import shutil

def burn_subtitles(video_path, subtitle_path, output_path):
    # 1. 创建临时目录（路径保证无空格）
    temp_dir = tempfile.mkdtemp(prefix='youtube_clipper_')
    # 例如: /tmp/youtube_clipper_abc123

    try:
        # 2. 复制文件到临时目录
        temp_video = os.path.join(temp_dir, 'video.mp4')
        temp_subtitle = os.path.join(temp_dir, 'subtitle.srt')
        shutil.copy(video_path, temp_video)
        shutil.copy(subtitle_path, temp_subtitle)

        # 3. 执行 FFmpeg（路径无空格）
        cmd = [
            'ffmpeg',
            '-i', temp_video,
            '-vf', f'subtitles={temp_subtitle}',
            temp_output
        ]
        subprocess.run(cmd, check=True)

        # 4. 移动输出文件到目标位置
        shutil.move(temp_output, output_path)

    finally:
        # 5. 清理临时目录
        shutil.rmtree(temp_dir, ignore_errors=True)
```

### 为什么这样有效？
- `tempfile.mkdtemp()` 生成的路径不包含空格（通常是 `/tmp/xxx`）
- FFmpeg 可以正确处理无空格的路径
- 对用户透明，输入输出可以有任意路径

### 其他尝试过但无效的方案
❌ 使用双引号：`subtitles="/path/with spaces/sub.srt"`
❌ 使用单引号：`subtitles='/path/with spaces/sub.srt'`
❌ 转义空格：`subtitles=/path/with\ spaces/sub.srt`
❌ 混合引号：`subtitles="'/path/with spaces/sub.srt'"`
❌ FFmpeg `-filter_complex`：仍然有同样问题

✅ **唯一有效**：临时目录方案

---

## 3. VTT 转 SRT 格式转换

### 格式差异

| 项目 | VTT | SRT |
|------|-----|-----|
| 头部 | `WEBVTT` | 无 |
| 序号 | 可选 | 必需（从1开始） |
| 时间分隔符 | `.` (点) | `,` (逗号) |
| 样式信息 | 支持 | 不支持 |

### 时间戳格式

```
VTT:  00:00:00.000 --> 00:00:03.500
SRT:  00:00:00,000 --> 00:00:03,500
              ↑                  ↑
            逗号                逗号
```

### 转换实现

```python
def vtt_to_srt(vtt_path, srt_path):
    # 1. 移除 WEBVTT 头部
    content = content.replace('WEBVTT\n\n', '')

    # 2. 移除样式信息
    content = re.sub(r'STYLE.*?-->', '', content, flags=re.DOTALL)

    # 3. 转换时间戳分隔符
    # . → , (仅在时间戳中)
    content = re.sub(
        r'(\d{2}:\d{2}:\d{2})\.(\d{3})',
        r'\1,\2',
        content
    )

    # 4. 添加序号（如果没有）
    # ...
```

### 注意事项
- VTT 可能包含位置信息（`align:start position:0%`），需要移除
- VTT 可能有多行文本，转 SRT 时保持多行
- 时间戳格式严格：`HH:MM:SS,mmm`（必须有小时）

---

## 4. 字幕时间戳调整

### 问题描述
剪辑视频后，字幕时间戳需要相对于新的起始时间。

### 示例
原视频：
```
[00:02:00] 字幕1
[00:02:03] 字幕2
[00:02:06] 字幕3
```

剪辑 02:00-02:10 后，字幕应该变为：
```
[00:00:00] 字幕1
[00:00:03] 字幕2
[00:00:06] 字幕3
```

### 实现
```python
def adjust_subtitle_time(time_seconds, offset):
    """
    调整字幕时间戳

    Args:
        time_seconds: 原始时间（秒）
        offset: 偏移量（秒），即剪辑起始时间

    Returns:
        float: 调整后的时间
    """
    adjusted = time_seconds - offset
    return max(0.0, adjusted)  # 确保不为负数
```

### 边界情况处理
1. 字幕完全在时间范围内：保留
2. 字幕完全在时间范围外：丢弃
3. 字幕跨越边界：
   - 起始时间调整为 0（如果在范围前）
   - 结束时间调整为片段时长（如果在范围后）

---

## 5. 批量翻译优化

### 问题
逐条翻译字幕会产生大量 API 调用，速度慢且成本高。

### 数据
- 一个 30 分钟视频：约 600 条字幕
- 逐条翻译：600 次 API 调用
- 批量翻译（20条/批）：30 次 API 调用
- **节省 95% API 调用**

### 实现策略

```python
def translate_batch(subtitles, batch_size=20):
    batches = []
    for i in range(0, len(subtitles), batch_size):
        batch = subtitles[i:i + batch_size]
        batches.append(batch)

    # 每批一起翻译
    for batch in batches:
        # 合并为单个文本
        batch_text = '\n'.join([sub['text'] for sub in batch])

        # 一次 API 调用翻译整批
        translations = translate_text(batch_text)

        # 分配翻译结果
        # ...
```

### 批量大小选择
- **20 条**是平衡点：
  - 小于 20：API 调用过多
  - 大于 30：单次输入过长，翻译质量下降
  - 20-25：最佳范围

### 翻译质量保证
批量翻译时需要：
1. 保持上下文连贯性
2. 每条字幕单独翻译（不要合并）
3. 返回 JSON 数组，顺序对应

---

## 6. yt-dlp 最佳实践

### 格式选择
```python
'format': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best'
```

解释：
- `bestvideo[height<=1080]`：视频最高 1080p
- `[ext=mp4]`：优先 mp4 格式（兼容性好）
- `+bestaudio[ext=m4a]`：合并最佳音频
- `/best[height<=1080][ext=mp4]`：备选方案
- `/best`：最终备选

### 为什么限制 1080p？
1. 文件大小：4K 视频太大（可能 5-10GB）
2. 处理速度：FFmpeg 处理时间长
3. 输出场景：短视频平台主要是 1080p 或更低
4. 存储空间：节省磁盘

### 字幕下载
```python
'writesubtitles': True,
'writeautomaticsub': True,  # 自动字幕作为备选
'subtitleslangs': ['en'],   # 英文字幕
'subtitlesformat': 'vtt',   # VTT 格式
```

优先级：
1. 人工字幕（如果有）
2. 自动字幕（YouTube 自动生成）

### 输出模板
```python
'outtmpl': '%(title)s [%(id)s].%(ext)s'
```

结果示例：
```
Anthropic's Amodei on AI [Ckt1cj0xjRM].mp4
Anthropic's Amodei on AI [Ckt1cj0xjRM].en.vtt
```

包含视频 ID 的好处：
- 唯一性：不会重复
- 可追溯：可以找到原视频

---

## 7. 双语字幕样式

### SRT 格式双语
```srt
1
00:00:00,000 --> 00:00:03,500
This is English subtitle
这是中文字幕

2
00:00:03,500 --> 00:00:07,000
Another English line
另一行中文
```

### FFmpeg 烧录样式
```bash
subtitles=subtitle.srt:force_style='FontSize=24,MarginV=30'
```

参数说明：
- `FontSize=24`：字体大小（适合 1080p）
- `MarginV=30`：底部边距（像素）
- 默认：白色文字 + 黑色描边

### 样式调整建议

| 视频分辨率 | FontSize | MarginV |
|-----------|----------|---------|
| 720p      | 20       | 20      |
| 1080p     | 24       | 30      |
| 4K        | 48       | 60      |

---

## 8. Python 依赖管理

### 必需依赖
```bash
pip install yt-dlp pysrt python-dotenv
```

- `yt-dlp`：YouTube 视频下载
- `pysrt`：SRT 字幕解析和操作
- `python-dotenv`：环境变量管理（可选）

### 导入错误处理
```python
try:
    import yt_dlp
except ImportError:
    print("❌ Error: yt-dlp not installed")
    print("Please install: pip install yt-dlp")
    sys.exit(1)
```

在每个脚本中检查依赖，给出清晰的安装指导。

---

## 9. 跨平台路径处理

### 使用 pathlib
```python
from pathlib import Path

# ✅ 推荐
video_path = Path('/path/to/video.mp4')
if video_path.exists():
    ...

# ❌ 避免
video_path = '/path/to/video.mp4'
if os.path.exists(video_path):
    ...
```

### 路径拼接
```python
# ✅ 推荐
output_path = output_dir / 'video.mp4'

# ❌ 避免
output_path = output_dir + '/video.mp4'  # 在 Windows 上失败
```

---

## 10. 错误处理最佳实践

### 详细错误信息
```python
try:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ Command failed:")
        print(f"   Command: {' '.join(cmd)}")
        print(f"   Return code: {result.returncode}")
        print(f"   Error output:")
        print(result.stderr)
        raise RuntimeError("Command failed")
except Exception as e:
    print(f"❌ Error: {str(e)}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
```

### 用户友好的错误消息
```python
# ❌ 不好
raise Exception("FFmpeg failed")

# ✅ 好
raise RuntimeError(
    "FFmpeg does not support libass (subtitles filter). "
    "Please install ffmpeg-full: brew install ffmpeg-full"
)
```

---

## 总结

| 问题 | 解决方案 | 优先级 |
|------|---------|--------|
| FFmpeg libass 缺失 | 安装 ffmpeg-full | 🔴 必须 |
| 路径空格问题 | 使用临时目录 | 🔴 必须 |
| VTT → SRT | 转换时间分隔符 | 🟡 重要 |
| 字幕时间调整 | 减去起始时间 | 🟡 重要 |
| API 调用过多 | 批量翻译（20条/批）| 🟢 优化 |
| 文件过大 | 限制 1080p | 🟢 优化 |

所有关键问题都有经过验证的解决方案，可以直接使用。
