#!/usr/bin/env python3
"""
烧录字幕到视频
处理 FFmpeg libass 支持和路径空格问题
"""

import sys
import os
import shutil
import subprocess
import tempfile
import platform
from pathlib import Path
from typing import Dict, Optional

from utils import format_file_size


def detect_ffmpeg_variant() -> Dict:
    """
    检测 FFmpeg 版本和 libass 支持

    Returns:
        Dict: {
            'type': 'full' | 'standard' | 'none',
            'path': FFmpeg 可执行文件路径,
            'has_libass': 是否支持 libass
        }
    """
    print("🔍 检测 FFmpeg 环境...")

    # 优先检查 ffmpeg-full（macOS）
    if platform.system() == 'Darwin':
        # Apple Silicon
        full_path_arm = '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg'
        # Intel
        full_path_intel = '/usr/local/opt/ffmpeg-full/bin/ffmpeg'

        for full_path in [full_path_arm, full_path_intel]:
            if Path(full_path).exists():
                has_libass = check_libass_support(full_path)
                print(f"   找到 ffmpeg-full: {full_path}")
                print(f"   libass 支持: {'✅ 是' if has_libass else '❌ 否'}")
                return {
                    'type': 'full',
                    'path': full_path,
                    'has_libass': has_libass
                }

    # 检查标准 FFmpeg
    standard_path = shutil.which('ffmpeg')
    if standard_path:
        has_libass = check_libass_support(standard_path)
        variant_type = 'full' if has_libass else 'standard'
        print(f"   找到 FFmpeg: {standard_path}")
        print(f"   类型: {variant_type}")
        print(f"   libass 支持: {'✅ 是' if has_libass else '❌ 否'}")
        return {
            'type': variant_type,
            'path': standard_path,
            'has_libass': has_libass
        }

    # 未找到 FFmpeg
    print("   ❌ 未找到 FFmpeg")
    return {
        'type': 'none',
        'path': None,
        'has_libass': False
    }


def check_libass_support(ffmpeg_path: str) -> bool:
    """
    检查 FFmpeg 是否支持 libass（字幕烧录必需）

    Args:
        ffmpeg_path: FFmpeg 可执行文件路径

    Returns:
        bool: 是否支持 libass
    """
    try:
        # 检查是否有 subtitles 滤镜
        result = subprocess.run(
            [ffmpeg_path, '-filters'],
            capture_output=True,
            text=True,
            timeout=5
        )

        # 查找 subtitles 滤镜
        return 'subtitles' in result.stdout.lower()

    except Exception:
        return False


def install_ffmpeg_full_guide():
    """
    显示安装 ffmpeg-full 的指南
    """
    print("\n" + "="*60)
    print("⚠️  需要安装 ffmpeg-full 才能烧录字幕")
    print("="*60)

    if platform.system() == 'Darwin':
        print("\nmacOS 安装方法:")
        print("  brew install ffmpeg-full")
        print("\n安装后，FFmpeg 路径:")
        print("  /opt/homebrew/opt/ffmpeg-full/bin/ffmpeg  (Apple Silicon)")
        print("  /usr/local/opt/ffmpeg-full/bin/ffmpeg     (Intel)")
    else:
        print("\n其他系统:")
        print("  请从源码编译 FFmpeg，确保包含 libass 支持")
        print("  参考: https://trac.ffmpeg.org/wiki/CompilationGuide")

    print("\n验证安装:")
    print("  ffmpeg -filters 2>&1 | grep subtitles")
    print("="*60)


def burn_subtitles(
    video_path: str,
    subtitle_path: str,
    output_path: str,
    ffmpeg_path: str = None,
    font_size: int = 24,
    margin_v: int = 30
) -> str:
    """
    烧录字幕到视频（使用临时目录解决路径空格问题）

    Args:
        video_path: 输入视频路径
        subtitle_path: 字幕文件路径（SRT 格式）
        output_path: 输出视频路径
        ffmpeg_path: FFmpeg 可执行文件路径（可选）
        font_size: 字体大小，默认 24
        margin_v: 底部边距，默认 30

    Returns:
        str: 输出视频路径

    Raises:
        FileNotFoundError: 输入文件不存在
        RuntimeError: FFmpeg 执行失败
    """
    video_path = Path(video_path)
    subtitle_path = Path(subtitle_path)
    output_path = Path(output_path)

    # 验证输入文件
    if not video_path.exists():
        raise FileNotFoundError(f"Video file not found: {video_path}")
    if not subtitle_path.exists():
        raise FileNotFoundError(f"Subtitle file not found: {subtitle_path}")

    # 检测 FFmpeg
    if ffmpeg_path is None:
        ffmpeg_info = detect_ffmpeg_variant()

        if ffmpeg_info['type'] == 'none':
            install_ffmpeg_full_guide()
            raise RuntimeError("FFmpeg not found")

        if not ffmpeg_info['has_libass']:
            install_ffmpeg_full_guide()
            raise RuntimeError("FFmpeg does not support libass (subtitles filter)")

        ffmpeg_path = ffmpeg_info['path']

    print(f"\n🎬 烧录字幕到视频...")
    print(f"   视频: {video_path.name}")
    print(f"   字幕: {subtitle_path.name}")
    print(f"   输出: {output_path.name}")
    print(f"   FFmpeg: {ffmpeg_path}")

    # 创建临时目录（解决路径空格问题）
    temp_dir = tempfile.mkdtemp(prefix='youtube_clipper_')
    print(f"   使用临时目录: {temp_dir}")

    try:
        # 复制文件到临时目录（路径无空格）
        temp_video = os.path.join(temp_dir, 'video.mp4')
        temp_subtitle = os.path.join(temp_dir, 'subtitle.srt')
        temp_output = os.path.join(temp_dir, 'output.mp4')

        print(f"   复制文件到临时目录...")
        shutil.copy(video_path, temp_video)
        shutil.copy(subtitle_path, temp_subtitle)

        # 构建 FFmpeg 命令
        # 使用 subtitles 滤镜烧录字幕
        subtitle_filter = f"subtitles={temp_subtitle}:force_style='FontSize={font_size},MarginV={margin_v}'"

        cmd = [
            ffmpeg_path,
            '-i', temp_video,
            '-vf', subtitle_filter,
            '-c:a', 'copy',  # 音频直接复制，不重新编码
            '-y',  # 覆盖输出文件
            temp_output
        ]

        print(f"   执行 FFmpeg...")
        print(f"   命令: {' '.join(cmd)}")

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
        if not Path(temp_output).exists():
            raise RuntimeError("Output file not created")

        # 移动输出文件到目标位置
        print(f"   移动输出文件...")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(temp_output, output_path)

        # 获取文件大小
        output_size = output_path.stat().st_size
        print(f"✅ 字幕烧录完成")
        print(f"   输出文件: {output_path}")
        print(f"   文件大小: {format_file_size(output_size)}")

        return str(output_path)

    finally:
        # 清理临时目录
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
            print(f"   清理临时目录")
        except Exception:
            pass


def main():
    """命令行入口"""
    if len(sys.argv) < 4:
        print("Usage: python burn_subtitles.py <video> <subtitle> <output> [font_size] [margin_v]")
        print("\nArguments:")
        print("  video      - 输入视频文件路径")
        print("  subtitle   - 字幕文件路径（SRT 格式）")
        print("  output     - 输出视频文件路径")
        print("  font_size  - 字体大小，默认 24")
        print("  margin_v   - 底部边距，默认 30")
        print("\nExample:")
        print("  python burn_subtitles.py input.mp4 subtitle.srt output.mp4")
        print("  python burn_subtitles.py input.mp4 subtitle.srt output.mp4 28 40")
        sys.exit(1)

    video_path = sys.argv[1]
    subtitle_path = sys.argv[2]
    output_path = sys.argv[3]
    font_size = int(sys.argv[4]) if len(sys.argv) > 4 else 24
    margin_v = int(sys.argv[5]) if len(sys.argv) > 5 else 30

    try:
        result_path = burn_subtitles(
            video_path,
            subtitle_path,
            output_path,
            font_size=font_size,
            margin_v=margin_v
        )

        print(f"\n✨ 完成！输出文件: {result_path}")

    except Exception as e:
        print(f"\n❌ 错误: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
