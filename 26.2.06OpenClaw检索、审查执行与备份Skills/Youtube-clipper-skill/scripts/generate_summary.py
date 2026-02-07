#!/usr/bin/env python3
"""
生成总结文案
基于章节信息生成适合社交媒体的文案
"""

import sys
import json
from pathlib import Path
from typing import Dict


def generate_summary(
    chapter_info: Dict,
    output_path: str = None
) -> str:
    """
    生成总结文案

    注意：此函数需要在 Claude Code Skill 环境中调用
    Claude 会自动处理文案生成逻辑

    Args:
        chapter_info: 章节信息，包含：
            - title: 章节标题
            - time_range: 时间范围
            - summary: 核心摘要
            - keywords: 关键词列表
        output_path: 输出文件路径（可选）

    Returns:
        str: 生成的文案
    """
    print(f"\n📝 生成总结文案...")
    print(f"   章节: {chapter_info.get('title', 'Unknown')}")

    # 输出章节信息（供 Claude 分析）
    print("\n" + "="*60)
    print("章节信息（JSON 格式）:")
    print("="*60)
    print(json.dumps(chapter_info, indent=2, ensure_ascii=False))

    print("\n" + "="*60)
    print("文案生成要求:")
    print("="*60)
    print("""
请基于上述章节信息生成适合社交媒体的文案。

文案要求：
1. 吸引人的标题（10-20字）
2. 核心观点（3-5个要点，每个1-2句话）
3. 适合平台：
   - 小红书：口语化，有emoji，1000字以内
   - 抖音：精炼，突出金句，300字以内
   - 微信公众号：详细，结构清晰，不限字数

输出格式（Markdown）：

# [标题]

## 核心观点

1. 观点1
2. 观点2
3. 观点3

## 适合平台

### 小红书版本（1000字）
[文案内容]

### 抖音版本（300字）
[文案内容]

### 微信公众号版本
[文案内容]

## 标签

#标签1 #标签2 #标签3
""")

    # 生成基础文案（占位符）
    summary_template = f"""# {chapter_info.get('title', '未命名章节')}

## 章节信息

- 时间范围: {chapter_info.get('time_range', 'N/A')}
- 核心摘要: {chapter_info.get('summary', 'N/A')}
- 关键词: {', '.join(chapter_info.get('keywords', []))}

## 核心观点

[待生成 - Claude 会在 Skill 执行时自动填充]

## 适合平台

### 小红书版本

[待生成]

### 抖音版本

[待生成]

### 微信公众号版本

[待生成]

## 标签

{' '.join(['#' + kw for kw in chapter_info.get('keywords', [])])}

---

生成时间: {chapter_info.get('generated_at', 'N/A')}
"""

    # 保存到文件（如果指定）
    if output_path:
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(summary_template)

        print(f"✅ 文案已保存: {output_path}")

    return summary_template


def load_chapter_info(json_path: str) -> Dict:
    """
    从 JSON 文件加载章节信息

    Args:
        json_path: JSON 文件路径

    Returns:
        Dict: 章节信息
    """
    json_path = Path(json_path)
    if not json_path.exists():
        raise FileNotFoundError(f"JSON file not found: {json_path}")

    print(f"📂 加载章节信息: {json_path.name}")

    with open(json_path, 'r', encoding='utf-8') as f:
        chapter_info = json.load(f)

    return chapter_info


def create_chapter_info(
    title: str,
    time_range: str,
    summary: str,
    keywords: list
) -> Dict:
    """
    创建章节信息字典

    Args:
        title: 章节标题
        time_range: 时间范围（如 "00:00 - 03:15"）
        summary: 核心摘要
        keywords: 关键词列表

    Returns:
        Dict: 章节信息
    """
    from datetime import datetime

    return {
        'title': title,
        'time_range': time_range,
        'summary': summary,
        'keywords': keywords,
        'generated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }


def main():
    """命令行入口"""
    if len(sys.argv) < 2:
        print("Usage: python generate_summary.py <chapter_info_json> [output_file]")
        print("   or: python generate_summary.py --create <title> <time_range> <summary> <keywords> [output_file]")
        print("\nArguments:")
        print("  chapter_info_json - 章节信息 JSON 文件路径")
        print("  output_file       - 输出文件路径（可选，默认为 summary.md）")
        print("\nCreate mode arguments:")
        print("  --create    - 创建模式")
        print("  title       - 章节标题")
        print("  time_range  - 时间范围（如 '00:00 - 03:15'）")
        print("  summary     - 核心摘要")
        print("  keywords    - 关键词（逗号分隔）")
        print("\nExample:")
        print("  python generate_summary.py chapter.json")
        print("  python generate_summary.py chapter.json summary.md")
        print("  python generate_summary.py --create 'AGI指数曲线' '00:00-03:15' '核心摘要' 'AGI,指数增长,Claude' summary.md")
        sys.exit(1)

    try:
        if sys.argv[1] == '--create':
            # 创建模式
            if len(sys.argv) < 6:
                print("❌ 创建模式需要提供: title, time_range, summary, keywords")
                sys.exit(1)

            title = sys.argv[2]
            time_range = sys.argv[3]
            summary = sys.argv[4]
            keywords = sys.argv[5].split(',')
            output_file = sys.argv[6] if len(sys.argv) > 6 else 'summary.md'

            chapter_info = create_chapter_info(title, time_range, summary, keywords)

        else:
            # JSON 模式
            json_file = sys.argv[1]
            output_file = sys.argv[2] if len(sys.argv) > 2 else 'summary.md'

            chapter_info = load_chapter_info(json_file)

        # 生成文案
        summary = generate_summary(chapter_info, output_file)

        print("\n" + "="*60)
        print("生成的文案预览:")
        print("="*60)
        print(summary)

        print("\n⚠️  提示：此脚本需要在 Claude Code Skill 中运行")
        print("   Claude 会自动生成详细的文案内容")
        print("   当前仅输出模板")

    except Exception as e:
        print(f"\n❌ 错误: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
