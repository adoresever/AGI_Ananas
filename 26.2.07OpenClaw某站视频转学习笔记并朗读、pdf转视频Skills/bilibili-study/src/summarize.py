"""LLM 总结生成模块"""
from openai import OpenAI
from src.config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
from src.parser import format_timestamp

SYSTEM_PROMPT = """你是一个专业的学习笔记助手。
请将视频字幕整理成**口语化、简洁**的学习笔记。

要求：
1. 口语化表达，像在讲解一样自然流畅
2. 去掉复杂术语和冗长解释
3. 每段 2-4 句话
4. 提取 3-5 个核心要点
5. 保留时间戳引用 [MM:SS]
6. 总长度控制在 1500-2500 字

输出格式：
## 核心要点

**第一，{核心要点1}。** {2-3句话展开说明}...

**第二，{核心要点2}。** ...

**第三，{核心要点3}。** ...

## 详细内容

[00:00] {简短过渡/开场介绍}...

[05:23] {核心内容段落1}...

[12:45] {核心内容段落2}...

...

## 总结

{3-5句话简洁总结核心内容}
"""

def create_client():
    """创建 LLM 客户端"""
    if not LLM_API_KEY:
        raise ValueError("请设置 OPENAI_API_KEY 环境变量")
    
    # 清除代理环境变量避免冲突
    import os
    proxies_backup = {}
    for key in ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']:
        if key in os.environ:
            proxies_backup[key] = os.environ[key]
            del os.environ[key]
    
    # 设置http_client以避免SOCKS代理问题
    import httpx
    http_client = httpx.Client(timeout=60.0, follow_redirects=True)
    
    client = OpenAI(api_key=LLM_API_KEY, base_url=LLM_BASE_URL, http_client=http_client)
    
    # 恢复代理环境变量
    for key, value in proxies_backup.items():
        os.environ[key] = value
    
    return client

def generate_spoken_note(chunks, video_info, language='zh-CN'):
    """使用 LLM 生成口语化笔记
    
    Args:
        chunks: 语义块列表 [{'text': str, 'start': float}]
        video_info: 视频信息 {'title': str, 'author': str, 'duration': str, 'url': str}
        language: 语言（zh-CN / zh-TW）
    
    Returns:
        str: Markdown 格式的笔记内容
    """
    from src.parser import chunks_to_text
    
    client = create_client()
    
    transcript = chunks_to_text(chunks)
    
    context = f"""视频信息：
标题：{video_info['title']}
作者：{video_info['author']}
时长：{video_info['duration']}
链接：{video_info['url']}

视频字幕内容：
{transcript}
"""
    
    try:
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": context}
            ],
            temperature=0.7,
            max_tokens=4096
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"❌ LLM 调用失败: {e}")
        return None

def save_note(note_content, video_info, output_dir):
    """保存笔记文件
    
    Args:
        note_content: 笔记内容（Markdown）
        video_info: 视频信息
        output_dir: 输出目录
    
    Returns:
        str: 输出文件路径
    """
    import os
    from datetime import datetime
    
    safe_title = ''.join(c for c in video_info['title'] 
                        if c.isalnum() or c in (' ', '-', '_')).strip()
    safe_title = safe_title[:50]
    
    filename = f"{safe_title}.md"
    filepath = os.path.join(output_dir, filename)
    
    # 使用try-except处理缺失字段
    author = video_info.get('author', '未知')
    duration = video_info.get('duration', '未知')
    
    full_content = f"""# {video_info['title']}

> 来源：{video_info['url']}
> UP主：{author} | 时长：{duration}
> 生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}

{note_content}
"""
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(full_content)
    
    return filepath

def save_original_transcript(chunks, video_info, output_dir):
    """保存原始字幕文本（可选）
    
    Args:
        chunks: 语义块列表
        video_info: 视频信息
        output_dir: 输出目录
    """
    import os
    from datetime import datetime
    
    safe_title = ''.join(c for c in video_info['title'] 
                        if c.isalnum() or c in (' ', '-', '_')).strip()
    safe_title = safe_title[:50]
    
    filepath = os.path.join(output_dir, f"{safe_title}_original.txt")
    
    content = f"""# {video_info['title']} - 原始字幕

> 来源：{video_info['url']}
> 生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}

"""
    
    for chunk in chunks:
        timestamp = format_timestamp(chunk['start'])
        content += f"{timestamp} {chunk['text']}\n"
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    return filepath
