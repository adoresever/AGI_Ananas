"""字幕解析与语义切片模块"""
import re
import webvtt
from opencc import OpenCC
from pathlib import Path

converter = OpenCC('t2s')
EMOJI_RE = re.compile(r'[\u263a-\u263b\u2700-\u27bf]|[\u2000-\u3300]|[\ud83c-\ud83e][\ud000-\udfff]')

def parse_time_to_seconds(time_str):
    """将时间字符串转换为秒数
    
    支持格式：
    - HH:MM:SS,mmm (SRT)
    - HH:MM:SS.mmm (VTT)
    - MM:SS (简化)
    """
    time_str = time_str.strip()
    
    try:
        if ',' in time_str:
            time_str = time_str.replace(',', '.')
        
        parts = time_str.split(':')
        if len(parts) == 3:
            h, m, s = parts
            return float(h) * 3600 + float(m) * 60 + float(s)
        elif len(parts) == 2:
            m, s = parts
            return float(m) * 60 + float(s)
    except:
        pass
    
    return 0

def parse_srt_to_chunks(srt_path):
    """解析 SRT 字幕文件并转换为语义块
    
    Args:
        srt_path: SRT 文件路径
    
    Returns:
        list: 语义块列表 [{'text': str, 'start': float}]
    """
    chunks = []
    char_items = []
    
    try:
        with open(srt_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        blocks = content.strip().split('\n\n')
        
        for block in blocks:
            lines = block.strip().split('\n')
            if len(lines) < 3:
                continue
            
            time_line = None
            text_lines = []
            
            for line in lines:
                if '-->' in line:
                    time_line = line
                elif line and not line.isdigit():
                    text_lines.append(line)
            
            if not time_line or not text_lines:
                continue
            
            times = time_line.split('-->')
            if len(times) != 2:
                continue
            
            start_time = parse_time_to_seconds(times[0].strip())
            text = ' '.join(text_lines)
            
            if not text:
                continue
            
            duration = (parse_time_to_seconds(times[1].strip()) - start_time) / len(text) if len(text) > 0.1 else 0.1
            
            for i, char in enumerate(text):
                char_items.append({'char': char, 'start': start_time + i * duration})
        
        chunks = semantic_chunking(char_items)
        
    except Exception as e:
        print(f"❌ SRT 解析失败: {e}")
    
    return chunks

def parse_vtt_to_chunks(vtt_path):
    """解析 VTT 字幕文件并转换为语义块
    
    Args:
        vtt_path: VTT 文件路径
    
    Returns:
        list: 语义块列表 [{'text': str, 'start': float}]
    """
    char_items = []
    try:
        for caption in webvtt.read(vtt_path):
            start = caption.start_in_seconds
            end = caption.end_in_seconds
            text = caption.text.strip()
            if not text:
                continue
            duration = (end - start) / len(text)
            for i, char in enumerate(text):
                char_items.append({'char': char, 'start': start + i * duration})
        return semantic_chunking(char_items)
    except Exception as e:
        print(f"❌ VTT 解析失败: {e}")
        return []

def parse_subtitle_to_chunks(subtitle_path):
    """通用的字幕解析函数（支持 SRT 和 VTT）
    
    Args:
        subtitle_path: 字幕文件路径
    
    Returns:
        list: 语义块列表
    """
    ext = Path(subtitle_path).suffix.lower()
    
    if ext == '.srt':
        return parse_srt_to_chunks(subtitle_path)
    elif ext == '.vtt':
        return parse_vtt_to_chunks(subtitle_path)
    else:
        print(f"⚠️ 不支持的字幕格式: {ext}")
        return []

def semantic_chunking(char_items, max_sentences=5, min_chars=200, max_chars=230):
    """语义切片逻辑：5句一切 或 200-230字一切
    
    Args:
        char_items: 字符级时间戳列表 [{'char': str, 'start': float}]
        max_sentences: 最大句子数（默认5）
        min_chars: 最小字符数（默认200）
        max_chars: 最大字符数（默认230）
    
    Returns:
        list: 语义块列表 [{'text': str, 'start': float}]
    """
    if not char_items:
        return []
    
    chunks = []
    current_text = ""
    current_start = None
    sentence_count = 0
    end_puncs = set("。！？.!?")
    
    for item in char_items:
        if current_start is None:
            current_start = item['start']
        
        char = item['char']
        current_text += char
        
        if char in end_puncs:
            sentence_count += 1
            if sentence_count >= max_sentences or len(current_text) >= min_chars:
                txt = EMOJI_RE.sub('', converter.convert(current_text)).strip()
                if txt:
                    chunks.append({'text': txt, 'start': current_start})
                current_text, current_start, sentence_count = "", None, 0
                continue
        
        if len(current_text) >= max_chars:
            txt = EMOJI_RE.sub('', converter.convert(current_text)).strip()
            if txt:
                chunks.append({'text': txt, 'start': current_start})
            current_text, current_start, sentence_count = "", None, 0
    
    if current_text:
        txt = EMOJI_RE.sub('', converter.convert(current_text)).strip()
        if txt:
            chunks.append({'text': txt, 'start': current_start})
    
    return chunks

def format_timestamp(seconds):
    """将秒数格式化为 [MM:SS]"""
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    return f"[{mins:02d}:{secs:02d}]"

def chunks_to_text(chunks):
    """将语义块合并为纯文本"""
    return '\n'.join([chunk['text'] for chunk in chunks])
