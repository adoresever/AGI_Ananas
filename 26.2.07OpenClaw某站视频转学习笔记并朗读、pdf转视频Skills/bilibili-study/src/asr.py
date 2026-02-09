"""ASR 转录模块（可选）"""
import os

def transcribe_audio(audio_path):
    """转录音频文件
    
    Args:
        audio_path: 音频文件路径
    
    Returns:
        list: 字符级时间戳列表 [{'char': str, 'start': float}]
    
    Note:
        需要配置 ENABLE_ASR=true 并安装 SenseVoice 或其他 ASR 引擎
    """
    print("⚠️ ASR 功能需要额外配置")
    print("请设置环境变量 ENABLE_ASR=true 并安装 ASR 引擎")
    return None

def transcribe_url(video_url):
    """转录视频 URL（流式）
    
    Args:
        video_url: 视频直链
    
    Returns:
        list: 字符级时间戳列表
    """
    print("⚠️ ASR 功能需要额外配置")
    return None
