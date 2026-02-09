"""配置加载模块"""
import os
from dotenv import load_dotenv

load_dotenv()

LLM_API_KEY = os.getenv("OPENAI_API_KEY")
LLM_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.deepseek.com")
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-chat")
BILIBILI_COOKIE = os.getenv("BILIBILI_COOKIE", "")

ASR_ENABLED = os.getenv("ENABLE_ASR", "").lower() == "true"
