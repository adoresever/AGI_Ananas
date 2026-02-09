"""B站视频字幕下载模块"""
import yt_dlp
import os
import subprocess
import sys
from pathlib import Path

TEMP_SUB_DIR = 'temp_subs'
COOKIES_FILE = 'cookies.txt'

def extract_cookies_from_browser():
    """从浏览器提取 cookies 到文件"""
    browsers = ['chrome', 'firefox', 'brave', 'edge']
    
    for browser in browsers:
        try:
            cmd = [
                'yt-dlp',
                '--cookies-from-browser', browser,
                '--cookies', COOKIES_FILE,
                '--list-subs', 'https://www.bilibili.com/video/BVtest123'
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            if os.path.exists(COOKIE_FILE):
                with open(COOKIE_FILE, 'r') as f:
                    content = f.read()
                if 'SESSDATA' in content or 'bili_jct' in content:
                    print(f"✓ 已从 {browser} 获取 cookies")
                    return True
        except:
            continue
    
    return False

def download_subs_and_process(url, enable_asr=False):
    """下载 B站视频字幕并处理

    Args:
        url: B站视频 URL
        enable_asr: 是否启用 ASR 转录（无字幕时）

    Returns:
        dict: {'chunks': [...], 'title': str, 'vid': str, 'thumb': str}
    """
    base_dir = Path(__file__).parent.parent
    temp_dir = base_dir / TEMP_SUB_DIR
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    cookies_path = base_dir / COOKIES_FILE
    if not cookies_path.exists() or cookies_path.stat().st_size < 1000:
        extract_cookies_from_browser()
    
    video_id = None
    subtitle_path = None
    
    sub_langs = 'ai-zh,zh-CN,zh-Hans'
    cmd = [
        'yt-dlp',
        '--cookies', str(cookies_path),
        '--quiet',
        '--skip-download',
        '--write-subs',
        '--write-auto-subs',
        '--sub-langs', sub_langs,
        '-o', str(temp_dir / '%(id)s.%(ext)s'),
        url
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        if result.returncode != 0:
            print(f"❌ yt-dlp 失败: {result.stderr}")
            return {'chunks': None, 'title': None, 'vid': None, 'thumb': None}
        
        info_cmd = [
            'yt-dlp',
            '--cookies', str(cookies_path),
            '--quiet',
            '--print', '%(title)s',
            '--print', '%(id)s',
            '--print', '%(thumbnail)s',
            url
        ]
        info_result = subprocess.run(info_cmd, capture_output=True, text=True, timeout=60)
        lines = info_result.stdout.strip().split('\n')
        if len(lines) >= 3:
            video_title = lines[-3]
            video_id = lines[-2]
            thumbnail = lines[-1]
        else:
            video_title = None
            video_id = None
            thumbnail = None
            
    except Exception as e:
        print(f"❌ 下载失败: {e}")
        return {'chunks': None, 'title': None, 'vid': None, 'thumb': None}

    subtitle_path = None
    if video_id:
        for f in temp_dir.iterdir():
            if video_id in f.name and (f.suffix == '.srt' or f.suffix == '.vtt'):
                subtitle_path = f
                break

    if subtitle_path:
        from src.parser import parse_subtitle_to_chunks
        chunks = parse_subtitle_to_chunks(str(subtitle_path))
        try:
            subtitle_path.unlink()
        except:
            pass

        mp4_path = temp_dir / f"{video_id}.mp4"
        if mp4_path.exists():
            try:
                mp4_path.unlink()
            except:
                pass

        if chunks:
            return {
                'chunks': chunks,
                'title': video_title,
                'vid': video_id,
                'thumb': thumbnail
            }

    if enable_asr:
        from src.asr import transcribe_audio
        char_items = transcribe_audio(audio_path)
        try:
            os.remove(audio_path)
        except:
            pass
        if char_items:
            from src.parser import semantic_chunking
            chunks = semantic_chunking(char_items)
            return {
                'chunks': chunks,
                'title': video_title,
                'vid': video_id,
                'thumb': thumbnail
            }

    return {
        'chunks': None,
        'title': video_title,
        'vid': video_id,
        'thumb': thumbnail
    }

def download_audio(url, video_id):
    """下载视频音频（用于 ASR）"""
    if not video_id:
        return None
    
    audio_path = f"{video_id}.wav"
    opts = {
        'quiet': True,
        'format': 'bestaudio/best',
        'outtmpl': f"{video_id}_audio",
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
            'preferredquality': '192'
        }]
    }

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])

        audio_file = f"{video_id}_audio.wav"
        if os.path.exists(audio_file):
            if os.path.exists(audio_path):
                os.remove(audio_path)
            os.rename(audio_file, audio_path)
            return audio_path

        for f in os.listdir('.'):
            if f.startswith(video_id) and f.endswith('.wav'):
                return f

    except Exception as e:
        print(f"❌ 音频下载失败: {e}")

    return None
