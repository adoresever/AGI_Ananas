"""B站视频搜索模块"""
import os
import re
import requests
from datetime import datetime

COOKIE_FILE = 'cookies.txt'

def get_cookies_dict(file_path):
    """解析 Netscape 格式 Cookie 文件"""
    cookies = {}
    if not os.path.exists(file_path):
        return cookies
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            if not line.startswith('#') and line.strip():
                cols = line.strip().split('\t')
                if len(cols) >= 7:
                    cookies[cols[5]] = cols[6]
    return cookies

def search_bilibili(keyword, limit=20):
    """搜索 B站视频
    
    Args:
        keyword: 搜索关键词
        limit: 返回数量上限
    
    Returns:
        list: 视频信息列表
    """
    cookies = get_cookies_dict(COOKIE_FILE)
    api_url = "https://api.bilibili.com/x/web-interface/search/type"
    params = {
        "search_type": "video",
        "keyword": keyword,
        "page": 1,
        "page_size": limit
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://search.bilibili.com/"
    }
    
    results = []
    try:
        response = requests.get(api_url, params=params, headers=headers, 
                               cookies=cookies, timeout=10)
        data = response.json()
        items = data.get('data', {}).get('result', [])
        
        for item in items:
            pubdate = item.get('pubdate')
            if pubdate:
                pubdate = datetime.fromtimestamp(pubdate).strftime('%Y-%m-%d')
            else:
                pubdate = "未知"
            
            pic = item.get('pic', '')
            if pic and not pic.startswith('http'):
                pic = 'https:' + pic
            
            tag_str = item.get('tag', '')
            tags = [t.strip() for t in tag_str.split(',') if t.strip()] if tag_str else []
            
            results.append({
                'bvid': item.get('bvid'),
                'title': re.sub(r'<.*?>', '', item.get('title')),
                'url': f"https://www.bilibili.com/video/{item.get('bvid')}",
                'thumbnail': pic,
                'author': item.get('author'),
                'duration': item.get('duration'),
                'pubdate': pubdate,
                'tags': tags
            })
    except Exception as e:
        print(f"❌ B站搜索失败: {e}")
    
    return results

def search_up主的视频(up_name, limit=20):
    """搜索 UP 主的视频
    
    Args:
        up_name: UP 主名称
        limit: 返回数量上限
    
    Returns:
        list: 视频信息列表
    """
    return search_bilibili(up_name, limit)
