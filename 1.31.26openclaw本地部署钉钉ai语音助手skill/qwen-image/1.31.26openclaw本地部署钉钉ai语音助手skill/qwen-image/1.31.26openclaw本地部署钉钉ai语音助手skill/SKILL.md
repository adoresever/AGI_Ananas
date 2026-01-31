---
name: dingtalk-audio
description: 钉钉语音播报。触发词：语音、朗读、读出来、用语音说。直接执行脚本，无需解释。
---

# 钉钉语音播报

收到语音请求后，直接执行命令，不要解释或描述技能本身。

## 执行
```bash
python3 /home/wang/clawd/skills/dingtalk-audio/send_audio.py "要播报的文本"
```

执行成功后只需回复：✅ 语音已发送
