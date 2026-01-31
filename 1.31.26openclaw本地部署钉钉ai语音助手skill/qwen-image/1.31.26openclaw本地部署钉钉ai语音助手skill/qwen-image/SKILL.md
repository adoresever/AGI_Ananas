---
name: qwen-image
description: 通义千问AI生成图片并发送钉钉。触发词：画图、生成图片、画一个、画一张、创作图片。禁止使用SVG，必须执行脚本。
---

# 通义千问AI图片生成

收到画图请求后，直接执行命令，不要画SVG，不要解释或描述技能本身。

## 执行
```bash
/media/cosmic-1/conda/envs/openclaw/bin/python3 /media/cosmic-1/00video/openclaw/skills/qwen-image/scripts/generate_and_send_image.py --prompt "图片描述"
```

⚠️ 禁止使用SVG、HTML、代码绘图。必须调用上述脚本使用通义千问API生成真实AI图片。

执行成功后只需回复：✅ 图片已发送
