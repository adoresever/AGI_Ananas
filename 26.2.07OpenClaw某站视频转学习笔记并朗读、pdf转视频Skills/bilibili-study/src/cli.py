"""命令行入口模块"""
import os
import sys
from datetime import datetime
from pathlib import Path

from src.search import search_bilibili
from src.download import download_subs_and_process
from src.summarize import generate_spoken_note, save_note, save_original_transcript
from src.config import ASR_ENABLED

def ensure_cookies():
    """确保 Cookie 文件存在"""
    if not os.path.exists('cookies.txt'):
        print("⚠️ 未找到 cookies.txt，将使用无登录状态下载")
        print("   部分视频可能无法下载字幕")
        print("   如需提升下载稳定性，请配置 BILIBILI_COOKIE 环境变量")
        print()

def select_video(videos):
    """让用户选择要处理的视频
    
    Args:
        videos: 视频列表
    
    Returns:
        dict: 用户选择的视频
    """
    print(f"\n找到 {len(videos)} 个视频：\n")
    for i, v in enumerate(videos, 1):
        duration = v.get('duration', '未知')
        pubdate = v.get('pubdate', '未知')
        print(f"{i}. {v['title']}")
        print(f"   作者：{v['author']} | 时长：{duration} | 发布时间：{pubdate}")
        print(f"   链接：{v['url']}")
        print()
    
    while True:
        try:
            choice = input(f"请选择要处理的视频 (1-{len(videos)})，或输入 0 退出: ").strip()
            if choice == '0':
                print("已退出")
                sys.exit(0)
            idx = int(choice) - 1
            if 0 <= idx < len(videos):
                return videos[idx]
            print(f"无效选择，请输入 1-{len(videos)}")
        except ValueError:
            print("请输入数字")

def create_output_dir(author):
    """创建输出目录
    
    Args:
        author: UP 主名称
    
    Returns:
        Path: 输出目录路径
    """
    date_str = datetime.now().strftime('%Y-%m-%d')
    output_dir = Path(f"study_notes/{author}/{date_str}")
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir

def process_single_video(video_url, output_dir=None, save_original=False):
    """处理单个视频
    
    Args:
        video_url: 视频 URL
        output_dir: 输出目录
        save_original: 是否保存原始字幕
    
    Returns:
        str: 笔记文件路径
    """
    print(f"\n📥 正在处理: {video_url}")
    print("   下载字幕中...")
    
    result = download_subs_and_process(video_url, enable_asr=ASR_ENABLED)
    
    if not result['chunks']:
        if ASR_ENABLED:
            print("❌ 字幕下载失败且 ASR 未成功")
        else:
            print("❌ 字幕下载失败")
            print("   提示：可以设置 ENABLE_ASR=true 启用 ASR 自动转录")
        return None
    
    print(f"   ✓ 获取到 {len(result['chunks'])} 个语义块")
    print("   🤖 生成学习中...")
    
    # 构建视频信息，使用中文键名以匹配summarize.py中的使用
    video_info = {
        'title': result['title'],
        'author': '',  # 直接提供URL时无法获取作者
        'duration': '',  # 暂时无法获取时长
        'url': video_url
    }
    
    note_content = generate_spoken_note(result['chunks'], video_info)
    
    if not note_content:
        print("❌ 笔记生成失败")
        return None
    
    if not output_dir:
        output_dir = create_output_dir(video_info['author'] or 'unknown')
    
    note_path = save_note(note_content, video_info, output_dir)
    print(f"   ✓ 笔记已保存: {note_path}")
    
    if save_original:
        orig_path = save_original_transcript(result['chunks'], video_info, output_dir)
        print(f"   ✓ 原始字幕已保存: {orig_path}")
    
    return note_path

def main():
    """主函数"""
    print("=" * 50)
    print("  Bilibili 视频学习笔记生成器 v1.0")
    print("=" * 50)
    print()
    
    ensure_cookies()
    
    if len(sys.argv) < 2:
        print("用法:")
        print("  python -m src.cli <视频链接>")
        print("  python -m src.cli --search <关键词>")
        print("  python -m src.cli --up <UP主名>")
        print()
        print("示例:")
        print("  python -m src.cli https://www.bilibili.com/video/BVxxx")
        print("  python -m src.cli --search GPT-4 教程")
        print("  python -m src.cli --up 纳米机器人")
        sys.exit(1)
    
    if sys.argv[1] == '--search':
        keyword = ' '.join(sys.argv[2:]) if len(sys.argv) > 2 else ''
        if not keyword:
            print("请提供搜索关键词")
            sys.exit(1)
        
        print(f"🔍 搜索: {keyword}")
        videos = search_bilibili(keyword)
        
        if not videos:
            print("未找到相关视频")
            sys.exit(0)
        
        video = select_video(videos)
        output_dir = create_output_dir(video['author'])
        process_single_video(video['url'], output_dir)
    
    elif sys.argv[1] == '--up':
        up_name = ' '.join(sys.argv[2:]) if len(sys.argv) > 2 else ''
        if not up_name:
            print("请提供 UP 主名称")
            sys.exit(1)
        
        print(f"🔍 搜索 UP 主: {up_name}")
        videos = search_bilibili(up_name)
        
        if not videos:
            print("未找到相关视频")
            sys.exit(0)
        
        video = select_video(videos)
        output_dir = create_output_dir(video['author'])
        process_single_video(video['url'], output_dir)
    
    else:
        video_url = sys.argv[1]
        process_single_video(video_url)

if __name__ == '__main__':
    main()
