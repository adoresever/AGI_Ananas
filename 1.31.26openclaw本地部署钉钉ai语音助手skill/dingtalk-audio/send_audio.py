#!/usr/bin/env python3
"""钉钉语音播报"""
import subprocess, requests, os, json, sys

APPKEY = "dingh自己更換r3kee4n"
APPSECRET = "WWt9J6XuyHFc8G0i01HRDdUmAAB2PlWA_eVt80wFYE9gyIk-"
OPEN_CONVERSATION_ID = "cidbYEPS7ANLA9g=="

def main():
    text = sys.argv[1] if len(sys.argv) > 1 else "测试语音"
    mp3 = '/tmp/dingtalk_audio.mp3'
    
    # 1. 生成语音
    subprocess.run(['edge-tts', '--text', text, '--voice', 'zh-CN-XiaoxiaoNeural', '--write-media', mp3], check=True, capture_output=True)
    
    # 获取时长
    result = subprocess.run(['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', mp3], capture_output=True, text=True)
    duration = int(float(result.stdout.strip()) * 1000)
    
    # 2. 获取 token
    token = requests.get(f'https://oapi.dingtalk.com/gettoken?appkey={APPKEY}&appsecret={APPSECRET}').json()['access_token']
    
    # 3. 上传音频
    with open(mp3, 'rb') as f:
        resp = requests.post(f'https://oapi.dingtalk.com/media/upload?access_token={token}&type=voice', files={'media': ('voice.mp3', f, 'audio/mpeg')}).json()
    
    media_id = resp.get('media_id')
    if not media_id:
        print(f"上传失败: {resp}")
        return
    
    # 4. 发送语音
    resp = requests.post(
        'https://api.dingtalk.com/v1.0/robot/groupMessages/send',
        headers={'x-acs-dingtalk-access-token': token},
        json={
            "robotCode": APPKEY,
            "openConversationId": OPEN_CONVERSATION_ID,
            "msgKey": "sampleAudio",
            "msgParam": json.dumps({"mediaId": media_id, "duration": str(duration)})
        }
    ).json()
    
    if resp.get('processQueryKey'):
        print("✅ 语音发送成功")
    else:
        print(f"发送结果: {resp}")
    
    os.path.exists(mp3) and os.remove(mp3)

if __name__ == "__main__":
    main()
