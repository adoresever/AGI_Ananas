# 字幕格式规范

本文档介绍 YouTube Clipper 中使用的字幕格式及其转换方法。

## 支持的格式

### 1. VTT (WebVTT)

WebVTT 是 Web 视频字幕标准格式。

#### 格式示例

```vtt
WEBVTT

1
00:00:00.000 --> 00:00:03.500
This is the first subtitle

2
00:00:03.500 --> 00:00:07.000
This is the second subtitle
```

#### 特点
- 头部必须是 `WEBVTT`
- 时间戳使用点 (`.`) 分隔毫秒
- 支持样式和位置信息
- YouTube 默认字幕格式

#### 完整示例

```vtt
WEBVTT

STYLE
::cue {
  background-color: rgba(0,0,0,0.8);
  color: white;
}

1
00:00:00.000 --> 00:00:03.500 align:start position:0%
<v Speaker>This is the first subtitle</v>

NOTE This is a comment

2
00:00:03.500 --> 00:00:07.000
This is the second subtitle
with multiple lines
```

---

### 2. SRT (SubRip)

SRT 是最常用的字幕格式，兼容性好。

#### 格式示例

```srt
1
00:00:00,000 --> 00:00:03,500
This is the first subtitle

2
00:00:03,500 --> 00:00:07,000
This is the second subtitle
```

#### 特点
- 没有头部
- 时间戳使用逗号 (`,`) 分隔毫秒
- 不支持样式（但 FFmpeg 可以覆盖）
- 兼容性最好

#### 多行文本

```srt
1
00:00:00,000 --> 00:00:03,500
This is the first line
This is the second line
This is the third line

2
00:00:03,500 --> 00:00:07,000
Single line subtitle
```

---

## VTT 与 SRT 对比

| 特性 | VTT | SRT |
|------|-----|-----|
| 头部 | 必须（`WEBVTT`） | 无 |
| 毫秒分隔符 | 点 (`.`) | 逗号 (`,`) |
| 样式支持 | 是 | 否 |
| 位置控制 | 是 | 否 |
| 注释支持 | 是 | 否 |
| 兼容性 | Web | 通用 |

---

## 格式转换

### VTT → SRT

#### Python 实现

```python
import re

def vtt_to_srt(vtt_content):
    # 1. 移除 WEBVTT 头部
    srt_content = re.sub(r'^WEBVTT.*?\n\n', '', vtt_content, flags=re.DOTALL)

    # 2. 移除样式信息
    srt_content = re.sub(r'STYLE.*?\n\n', '', srt_content, flags=re.DOTALL)

    # 3. 移除 NOTE
    srt_content = re.sub(r'NOTE.*?\n\n', '', srt_content, flags=re.DOTALL)

    # 4. 转换时间戳分隔符: . → ,
    srt_content = re.sub(
        r'(\d{2}:\d{2}:\d{2})\.(\d{3})',
        r'\1,\2',
        srt_content
    )

    # 5. 移除位置信息
    srt_content = re.sub(
        r'(-->.*?)\s+(align|position|line|size):.*',
        r'\1',
        srt_content
    )

    # 6. 移除说话人标签 <v Speaker>
    srt_content = re.sub(r'<v [^>]+>', '', srt_content)
    srt_content = re.sub(r'</v>', '', srt_content)

    return srt_content
```

#### 命令行工具

```bash
# 使用 ffmpeg
ffmpeg -i input.vtt output.srt

# 使用 sed
sed 's/\./,/3' input.vtt > output.srt  # 简单转换（不完整）
```

### SRT → VTT

#### Python 实现

```python
def srt_to_vtt(srt_content):
    # 1. 添加 WEBVTT 头部
    vtt_content = "WEBVTT\n\n" + srt_content

    # 2. 转换时间戳分隔符: , → .
    vtt_content = re.sub(
        r'(\d{2}:\d{2}:\d{2}),(\d{3})',
        r'\1.\2',
        vtt_content
    )

    return vtt_content
```

---

## 双语字幕

### SRT 格式

双语字幕在 SRT 中使用多行文本：

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

### 样式建议

烧录到视频时的样式：

```bash
ffmpeg -i video.mp4 \
  -vf "subtitles=bilingual.srt:force_style='FontSize=24,MarginV=30'" \
  output.mp4
```

推荐参数：
- `FontSize=24`: 适合 1080p 视频
- `MarginV=30`: 底部边距 30 像素
- 英文在上，中文在下

---

## 时间戳格式

### 完整格式

```
HH:MM:SS.mmm --> HH:MM:SS.mmm
```

- `HH`: 小时（00-99）
- `MM`: 分钟（00-59）
- `SS`: 秒（00-59）
- `mmm`: 毫秒（000-999）

### 示例

```
00:00:00.000  # 0 秒
00:00:03.500  # 3.5 秒
00:01:30.250  # 1 分 30.25 秒
01:23:45.678  # 1 小时 23 分 45.678 秒
```

### 注意事项

1. 小时部分是可选的，但为了兼容性，建议总是包含
2. VTT 使用点 (`.`)，SRT 使用逗号 (`,`)
3. 毫秒必须是 3 位数（不足补 0）

---

## 时间调整

### 场景：视频剪辑后调整字幕

剪辑视频 02:00-02:10 后，字幕时间戳需要调整：

#### 原始字幕

```srt
1
00:02:00,000 --> 00:02:03,500
First subtitle

2
00:02:03,500 --> 00:02:07,000
Second subtitle
```

#### 调整后字幕

```srt
1
00:00:00,000 --> 00:00:03,500
First subtitle

2
00:00:03,500 --> 00:00:07,000
Second subtitle
```

#### Python 实现

```python
def adjust_subtitle_time(subtitles, offset_seconds):
    """
    调整字幕时间戳

    Args:
        subtitles: 字幕列表
        offset_seconds: 偏移量（秒），即剪辑起始时间

    Returns:
        调整后的字幕列表
    """
    adjusted = []

    for sub in subtitles:
        adjusted_sub = {
            'start': max(0, sub['start'] - offset_seconds),
            'end': max(0, sub['end'] - offset_seconds),
            'text': sub['text']
        }

        # 仅保留在有效范围内的字幕
        if adjusted_sub['end'] > 0:
            adjusted.append(adjusted_sub)

    return adjusted
```

---

## 字幕编码

### 推荐编码

**UTF-8**（无 BOM）

### 检查编码

```bash
file -i subtitle.srt
# 输出: subtitle.srt: text/plain; charset=utf-8
```

### 转换编码

```bash
# GBK → UTF-8
iconv -f GBK -t UTF-8 input.srt > output.srt

# 移除 BOM
sed -i '1s/^\xEF\xBB\xBF//' subtitle.srt
```

---

## 字幕验证

### 检查项目

1. **时间戳格式**: 是否符合规范
2. **时间顺序**: 起始时间 < 结束时间
3. **重叠检测**: 相邻字幕是否重叠
4. **编码检查**: 是否 UTF-8
5. **空行检查**: 字幕间是否有空行分隔

### Python 验证脚本

```python
def validate_srt(srt_path):
    errors = []

    with open(srt_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 分割字幕块
    blocks = content.strip().split('\n\n')

    prev_end_time = 0

    for i, block in enumerate(blocks):
        lines = block.split('\n')

        if len(lines) < 3:
            errors.append(f"Block {i+1}: Invalid format (< 3 lines)")
            continue

        # 检查序号
        try:
            seq = int(lines[0])
            if seq != i + 1:
                errors.append(f"Block {i+1}: Invalid sequence number ({seq})")
        except ValueError:
            errors.append(f"Block {i+1}: Invalid sequence number")

        # 检查时间戳
        timestamp_pattern = r'(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})'
        match = re.match(timestamp_pattern, lines[1])

        if not match:
            errors.append(f"Block {i+1}: Invalid timestamp format")
            continue

        start_str, end_str = match.groups()
        start_time = time_to_seconds(start_str)
        end_time = time_to_seconds(end_str)

        # 检查时间逻辑
        if start_time >= end_time:
            errors.append(f"Block {i+1}: Start time >= End time")

        if start_time < prev_end_time:
            errors.append(f"Block {i+1}: Overlaps with previous subtitle")

        prev_end_time = end_time

    return errors
```

---

## 常见问题

### Q: FFmpeg 无法读取字幕，提示编码错误

A: 确保字幕是 UTF-8 编码，且没有 BOM：
```bash
iconv -f GBK -t UTF-8 input.srt > output.srt
sed -i '1s/^\xEF\xBB\xBF//' output.srt
```

### Q: 字幕显示乱码

A: 检查编码：
```bash
file -i subtitle.srt
# 如果不是 UTF-8，转换编码
```

### Q: VTT 字幕在某些播放器无法显示

A: 尝试转换为 SRT 格式，兼容性更好。

### Q: 双语字幕中文字太挤

A: 增加字体大小和边距：
```bash
subtitles=sub.srt:force_style='FontSize=28,MarginV=40'
```

---

## 参考链接

- [WebVTT 规范](https://www.w3.org/TR/webvtt1/)
- [SRT 格式说明](https://en.wikipedia.org/wiki/SubRip)
- [FFmpeg Subtitles 滤镜](https://ffmpeg.org/ffmpeg-filters.html#subtitles)
