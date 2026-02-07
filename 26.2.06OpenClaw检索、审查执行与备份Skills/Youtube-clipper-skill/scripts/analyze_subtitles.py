#!/usr/bin/env python3
"""
分析字幕并生成章节
解析 VTT 字幕文件，准备数据供 Claude AI 分析
"""

import sys
import re
import json
from pathlib import Path
from typing import List, Dict

from utils import (
    time_to_seconds,
    seconds_to_time,
    get_video_duration_display
)


def parse_vtt(vtt_path: str) -> List[Dict]:
    """
    解析 VTT 字幕文件

    Args:
        vtt_path: VTT 文件路径

    Returns:
        List[Dict]: 字幕列表，每项包含 {start, end, text}

    Example:
        [
            {'start': 0.0, 'end': 3.5, 'text': 'Hello world'},
            {'start': 3.5, 'end': 7.2, 'text': 'This is a test'},
            ...
        ]
    """
    vtt_path = Path(vtt_path)

    if not vtt_path.exists():
        raise FileNotFoundError(f"Subtitle file not found: {vtt_path}")

    print(f"📊 解析字幕文件: {vtt_path.name}")

    subtitles = []

    with open(vtt_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 移除 WEBVTT 头部和样式信息
    content = re.sub(r'^WEBVTT.*?\n\n', '', content, flags=re.DOTALL)
    content = re.sub(r'STYLE.*?-->', '', content, flags=re.DOTALL)

    # 分割字幕块
    blocks = content.strip().split('\n\n')

    for block in blocks:
        lines = block.strip().split('\n')

        if len(lines) < 2:
            continue

        # 查找时间戳行
        timestamp_line = None
        text_lines = []

        for line in lines:
            # 匹配时间戳格式: 00:00:00.000 --> 00:00:03.000
            if '-->' in line:
                timestamp_line = line
            elif line and not line.isdigit():  # 跳过序号
                text_lines.append(line)

        if not timestamp_line or not text_lines:
            continue

        # 解析时间戳
        try:
            # 移除可能的位置信息（如 align:start position:0%）
            timestamp_line = re.sub(r'align:.*|position:.*', '', timestamp_line).strip()

            times = timestamp_line.split('-->')
            start_str = times[0].strip()
            end_str = times[1].strip()

            start = time_to_seconds(start_str)
            end = time_to_seconds(end_str)

            # 合并文本行
            text = ' '.join(text_lines)

            # 清理 HTML 标签（如果有）
            text = re.sub(r'<[^>]+>', '', text)

            # 清理特殊字符
            text = text.strip()

            if text:
                subtitles.append({
                    'start': start,
                    'end': end,
                    'text': text
                })

        except Exception as e:
            # 跳过无法解析的字幕块
            continue

    print(f"   找到 {len(subtitles)} 条字幕")

    if subtitles:
        total_duration = subtitles[-1]['end']
        print(f"   总时长: {get_video_duration_display(total_duration)}")

    return subtitles


def prepare_analysis_data(subtitles: List[Dict], target_chapter_duration: int = 180) -> Dict:
    """
    准备数据供 Claude AI 分析

    Args:
        subtitles: 字幕列表
        target_chapter_duration: 目标章节时长（秒），默认 180 秒（3 分钟）

    Returns:
        Dict: {
            'subtitle_text': 带时间戳的完整字幕文本,
            'total_duration': 总时长,
            'subtitle_count': 字幕条数,
            'target_chapter_duration': 目标章节时长,
            'estimated_chapters': 预估章节数
        }
    """
    if not subtitles:
        raise ValueError("No subtitles to analyze")

    print(f"\n📝 准备分析数据...")

    # 将字幕合并为带时间戳的完整文本
    full_text_lines = []

    for sub in subtitles:
        time_str = seconds_to_time(sub['start'], include_hours=True, use_comma=False)
        full_text_lines.append(f"[{time_str}] {sub['text']}")

    full_text = '\n'.join(full_text_lines)

    total_duration = subtitles[-1]['end']
    estimated_chapters = max(1, int(total_duration / target_chapter_duration))

    print(f"   总时长: {get_video_duration_display(total_duration)}")
    print(f"   字幕条数: {len(subtitles)}")
    print(f"   目标章节时长: {target_chapter_duration} 秒 ({target_chapter_duration // 60} 分钟)")
    print(f"   预估章节数: {estimated_chapters}")

    return {
        'subtitle_text': full_text,
        'total_duration': total_duration,
        'subtitle_count': len(subtitles),
        'target_chapter_duration': target_chapter_duration,
        'estimated_chapters': estimated_chapters,
        'subtitles_raw': subtitles  # 保留原始数据供后续使用
    }


def save_analysis_data(data: Dict, output_path: str):
    """
    保存分析数据到 JSON 文件

    Args:
        data: 分析数据
        output_path: 输出文件路径
    """
    output_path = Path(output_path)

    # 创建输出目录
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # 保存为 JSON
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"✅ 分析数据已保存: {output_path}")


def main():
    """命令行入口"""
    if len(sys.argv) < 2:
        print("Usage: python analyze_subtitles.py <vtt_file> [target_duration] [output_json]")
        print("\nArguments:")
        print("  vtt_file         - VTT 字幕文件路径")
        print("  target_duration  - 目标章节时长（秒），默认 180")
        print("  output_json      - 输出 JSON 文件路径（可选）")
        print("\nExample:")
        print("  python analyze_subtitles.py video.en.vtt")
        print("  python analyze_subtitles.py video.en.vtt 240")
        print("  python analyze_subtitles.py video.en.vtt 240 analysis.json")
        sys.exit(1)

    vtt_file = sys.argv[1]
    target_duration = int(sys.argv[2]) if len(sys.argv) > 2 else 180
    output_json = sys.argv[3] if len(sys.argv) > 3 else None

    try:
        # 解析字幕
        subtitles = parse_vtt(vtt_file)

        if not subtitles:
            print("❌ 未找到有效字幕")
            sys.exit(1)

        # 准备分析数据
        analysis_data = prepare_analysis_data(subtitles, target_duration)

        # 输出字幕文本（供 Claude 分析）
        print("\n" + "="*60)
        print("字幕文本（前 50 行预览）:")
        print("="*60)
        lines = analysis_data['subtitle_text'].split('\n')
        preview_lines = lines[:50]
        print('\n'.join(preview_lines))
        if len(lines) > 50:
            print(f"\n... （还有 {len(lines) - 50} 行）")

        # 保存到文件（如果指定）
        if output_json:
            save_analysis_data(analysis_data, output_json)

        # 输出摘要信息
        print("\n" + "="*60)
        print("分析摘要:")
        print("="*60)
        print(json.dumps({
            'total_duration': analysis_data['total_duration'],
            'total_duration_display': get_video_duration_display(analysis_data['total_duration']),
            'subtitle_count': analysis_data['subtitle_count'],
            'target_chapter_duration': analysis_data['target_chapter_duration'],
            'estimated_chapters': analysis_data['estimated_chapters']
        }, indent=2, ensure_ascii=False))

        print("\n💡 提示：现在可以使用 Claude AI 分析上述字幕文本，生成精细章节")

    except Exception as e:
        print(f"\n❌ 错误: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
