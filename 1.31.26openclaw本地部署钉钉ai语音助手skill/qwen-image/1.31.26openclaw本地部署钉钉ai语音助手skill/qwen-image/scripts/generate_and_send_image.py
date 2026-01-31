#!/usr/bin/env python3
"""
通义千问图片生成 + 发送到钉钉

用法:
    python3 generate_and_send_image.py --prompt "图片描述"
"""

import argparse
import json
import os
import sys
import requests
import time
from pathlib import Path

# ========== 配置 ==========
# 阿里云 DashScope API Key

DASHSCOPE_API_KEY = "sk-94ba4ccd9b40435fb252be6262622a"

# 钉钉配置
DINGTALK_APPKEY = "dingvclgtbmuhrkee4n"
DINGTALK_APPSECRET = "-"
DINGTALK_CONVERSATION_ID = "cidbYEPS3wdZ7osbf7ANLA9g=="

# ==========================


def get_dingtalk_token():
    """获取钉钉 access_token"""
    url = f'https://oapi.dingtalk.com/gettoken?appkey={DINGTALK_APPKEY}&appsecret={DINGTALK_APPSECRET}'
    resp = requests.get(url, timeout=10)
    return resp.json().get('access_token')


def upload_image_to_dingtalk(token, image_path):
    """上传图片到钉钉，返回 media_id"""
    url = f'https://oapi.dingtalk.com/media/upload?access_token={token}&type=image'
    filename = os.path.basename(image_path)
    with open(image_path, 'rb') as f:
        files = {'media': (filename, f, 'image/png')}
        resp = requests.post(url, files=files, timeout=60)
    result = resp.json()
    if result.get('errcode') != 0 and result.get('errcode') is not None:
        print(f"上传失败: {result}", file=sys.stderr)
        return None
    return result.get('media_id')


def send_image_to_dingtalk(token, media_id, prompt):
    """发送图片文件到钉钉群"""
    url = 'https://api.dingtalk.com/v1.0/robot/groupMessages/send'
    headers = {'x-acs-dingtalk-access-token': token}
    
    # 生成带时间戳的文件名
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    # 截取prompt前20个字符作为文件名的一部分
    safe_prompt = "".join(c for c in prompt[:20] if c.isalnum() or c in ('_', '-', ' ')).strip()
    filename = f"AI生成_{safe_prompt}_{timestamp}.png"
    
    # 使用 sampleFile 发送文件
    data = {
        "robotCode": DINGTALK_APPKEY,
        "openConversationId": DINGTALK_CONVERSATION_ID,
        "msgKey": "sampleFile",
        "msgParam": json.dumps({
            "mediaId": media_id,
            "fileName": filename,
            "fileType": "file"
        })
    }
    
    resp = requests.post(url, headers=headers, json=data, timeout=30)
    result = resp.json()
    
    return result.get('processQueryKey') is not None, result


def generate_image(prompt, output_path):
    """使用通义千问生成图片"""
    try:
        import dashscope
        from dashscope import ImageSynthesis
    except ImportError:
        print("错误: 请安装 dashscope (pip install dashscope)", file=sys.stderr)
        sys.exit(1)

    print(f"正在生成图片: {prompt[:50]}...")

    response = ImageSynthesis.call(
        api_key=DASHSCOPE_API_KEY,
        model="wanx-v1",
        prompt=prompt,
        n=1,
        size="1024*1024"
    )

    if response.status_code == 200:
        results = response.output.get('results', [])
        if results:
            image_url = results[0].get('url')
            if image_url:
                print("下载图片中...")
                img_response = requests.get(image_url, timeout=60)
                img_response.raise_for_status()
                
                with open(output_path, 'wb') as f:
                    f.write(img_response.content)
                
                print(f"✅ 图片已保存: {output_path}")
                return True
    
    print(f"生成失败: {response.message if hasattr(response, 'message') else '未知错误'}", file=sys.stderr)
    return False


def main():
    parser = argparse.ArgumentParser(description="通义千问图片生成 + 发送到钉钉")
    parser.add_argument("--prompt", "-p", required=True, help="图片描述")
    args = parser.parse_args()

    # 生成临时文件名
    timestamp = int(time.time())
    image_path = f"/tmp/qwen_image_{timestamp}.png"

    # 1. 生成图片
    if not generate_image(args.prompt, image_path):
        sys.exit(1)

    # 2. 获取钉钉 token
    print("获取钉钉 token...")
    token = get_dingtalk_token()
    if not token:
        print("错误: 获取钉钉 token 失败", file=sys.stderr)
        sys.exit(1)

    # 3. 上传图片到钉钉
    print("上传图片到钉钉...")
    media_id = upload_image_to_dingtalk(token, image_path)
    if not media_id:
        print("错误: 上传图片失败", file=sys.stderr)
        sys.exit(1)
    print(f"上传成功, media_id: {media_id}")

    # 4. 发送图片文件到钉钉群
    print("发送图片到钉钉群...")
    success, result = send_image_to_dingtalk(token, media_id, args.prompt)
    
    if success:
        print("✅ 图片已发送到钉钉群")
    else:
        print(f"发送失败: {result}", file=sys.stderr)

    # 5. 清理临时文件
    if os.path.exists(image_path):
        os.remove(image_path)


if __name__ == "__main__":
    main()
