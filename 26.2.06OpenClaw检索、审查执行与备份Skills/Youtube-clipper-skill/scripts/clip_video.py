#!/usr/bin/env python3
"""
剪辑视频片段
使用 FFmpeg 精确剪辑视频，保持原始质量
"""

import sys
import shutil
import subprocess
from pathlib import Path
from typing import Union

from utils import (
    time_to_seconds,
    seconds_to_time,
    format_file_size,
    get_video_duration_display
)


def clip_video(
    video_path: str,
    start_time: Union[str, float],
    end_time: Union[str, float],
    output_path: str,
    ffmpeg_path: str = None
) -> str:
    """
    剪辑视频片段

    Args:
        video_path: 输入视频路径
        start_time: 起始时间（秒数或时间字符串，如 "00:01:30"）
        end_time: 结束时间（秒数或时间字符串）
        output_path: 输出视频路径
        ffmpeg_path: FFmpeg 可执行文件路径（可选）

    Returns:
        str: 输出视频路径

    Raises:
        FileNotFoundError: 输入文件不存在
        RuntimeError: FFmpeg 执行失败
    """
    video_path = Path(video_path)
    output_path = Path(output_path)

    # 验证输入文件
    if not video_path.exists():
        raise FileNotFoundError(f"Video file not found: {video_path}")

    # 转换时间为秒数
    if isinstance(start_time, str):
        start_seconds = time_to_seconds(start_time)
    else:
        start_seconds = float(start_time)

    if isinstance(end_time, str):
        end_seconds = time_to_seconds(end_time)
    else:
        end_seconds = float(end_time)

    # 验证时间范围
    if start_seconds >= end_seconds:
        raise ValueError(f"Start time ({start_seconds}s) must be before end time ({end_seconds}s)")

    duration = end_seconds - start_seconds

    # 检测 FFmpeg
    if ffmpeg_path is None:
        ffmpeg_path = shutil.which('ffmpeg')
        if not ffmpeg_path:
            raise RuntimeError("FFmpeg not found. Please install FFmpeg.")

    print(f"\n✂️  剪辑视频片段...")
    print(f"   输入: {video_path.name}")
    print(f"   起始时间: {seconds_to_time(start_seconds)} ({start_seconds}s)")
    print(f"   结束时间: {seconds_to_time(end_seconds)} ({end_seconds}s)")
    print(f"   片段时长: {get_video_duration_display(duration)}")
    print(f"   输出: {output_path.name}")

    # 创建输出目录
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # 构建 FFmpeg 命令
    # 使用 -ss 和 -t 进行精确剪辑
    # -c copy: 直接复制流，不重新编码（快速且无损）
    cmd = [
        ffmpeg_path,
        '-ss', str(start_seconds),  # 起始时间
        '-i', str(video_path),       # 输入文件
        '-t', str(duration),         # 持续时间
        '-c', 'copy',                # 直接复制，不重新编码
        '-y',                        # 覆盖输出文件
        str(output_path)
    ]

    print(f"   执行 FFmpeg...")

    # 执行 FFmpeg
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        print(f"\n❌ FFmpeg 执行失败:")
        print(result.stderr)
        raise RuntimeError(f"FFmpeg failed with return code {result.returncode}")

    # 验证输出文件
    if not output_path.exists():
        raise RuntimeError("Output file not created")

    # 获取文件大小
    output_size = output_path.stat().st_size
    print(f"✅ 剪辑完成")
    print(f"   输出文件: {output_path}")
    print(f"   文件大小: {format_file_size(output_size)}")

    return str(output_path)


def extract_subtitle_segment(
    subtitles: list,
    start_time: float,
    end_time: float,
    adjust_timestamps: bool = True
) -> list:
    """
    从完整字幕中提取指定时间段的字幕

    Args:
        subtitles: 完整字幕列表（每项包含 {start, end, text}）
        start_time: 起始时间（秒）
        end_time: 结束时间（秒）
        adjust_timestamps: 是否调整时间戳（减去起始时间）

    Returns:
        list: 提取的字幕列表
    """
    segment_subtitles = []

    for sub in subtitles:
        # 字幕在时间范围内
        if sub['start'] >= start_time and sub['end'] <= end_time:
            if adjust_timestamps:
                # 调整时间戳（相对于片段起始时间）
                adjusted_sub = {
                    'start': sub['start'] - start_time,
                    'end': sub['end'] - start_time,
                    'text': sub['text']
                }
                segment_subtitles.append(adjusted_sub)
            else:
                segment_subtitles.append(sub.copy())

        # 字幕跨越时间范围边界（部分重叠）
        elif sub['start'] < end_time and sub['end'] > start_time:
            if adjust_timestamps:
                adjusted_sub = {
                    'start': max(0, sub['start'] - start_time),
                    'end': min(end_time - start_time, sub['end'] - start_time),
                    'text': sub['text']
                }
                segment_subtitles.append(adjusted_sub)
            else:
                segment_subtitles.append(sub.copy())

    return segment_subtitles


def save_subtitles_as_srt(subtitles: list, output_path: str):
    """
    保存字幕为 SRT 格式

    Args:
        subtitles: 字幕列表
        output_path: 输出文件路径
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        for i, sub in enumerate(subtitles, 1):
            # SRT 序号
            f.write(f"{i}\n")

            # SRT 时间戳（使用逗号分隔毫秒）
            start_time = seconds_to_time(sub['start'], include_hours=True, use_comma=True)
            end_time = seconds_to_time(sub['end'], include_hours=True, use_comma=True)
            f.write(f"{start_time} --> {end_time}\n")

            # 字幕文本
            f.write(f"{sub['text']}\n")

            # 空行分隔
            f.write("\n")

    print(f"✅ 字幕已保存: {output_path}")


def main():
    """命令行入口"""
    if len(sys.argv) < 5:
        print("Usage: python clip_video.py <video> <start_time> <end_time> <output>")
        print("\nArguments:")
        print("  video      - 输入视频文件路径")
        print("  start_time - 起始时间（秒数或时间字符串，如 00:01:30）")
        print("  end_time   - 结束时间（秒数或时间字符串）")
        print("  output     - 输出视频文件路径")
        print("\nExample:")
        print("  python clip_video.py input.mp4 0 195 output.mp4")
        print("  python clip_video.py input.mp4 00:00:00 00:03:15 output.mp4")
        print("  python clip_video.py input.mp4 01:30:00 01:33:15 output.mp4")
        sys.exit(1)

    video_path = sys.argv[1]
    start_time = sys.argv[2]
    end_time = sys.argv[3]
    output_path = sys.argv[4]

    try:
        result_path = clip_video(video_path, start_time, end_time, output_path)
        print(f"\n✨ 完成！输出文件: {result_path}")

    except Exception as e:
        print(f"\n❌ 错误: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
