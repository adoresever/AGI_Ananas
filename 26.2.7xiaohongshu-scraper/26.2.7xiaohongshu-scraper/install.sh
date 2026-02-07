#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# xiaohongshu-scraper 安装脚本
# 自动检测 OpenClaw 环境并安装小红书抓取技能包
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="$SCRIPT_DIR/SKILL.md.template"
SKILL_NAME="xiaohongshu-scraper"

echo ""
echo "🦞 xiaohongshu-scraper 安装脚本"
echo "================================"
echo ""

# ------ 检测 npx 路径 ------
NPX_PATH=$(which npx 2>/dev/null || true)
if [ -z "$NPX_PATH" ]; then
    echo "❌ 未找到 npx，请先安装 Node.js 18+"
    echo "   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "   sudo apt-get install -y nodejs"
    exit 1
fi
echo "✅ npx 路径: $NPX_PATH"

# ------ 检测 OpenClaw workspace ------
WORKSPACE=""

# 方式1: 从 openclaw.json 读取
if [ -f "$HOME/.openclaw/openclaw.json" ]; then
    WORKSPACE=$(grep -o '"workspace"[[:space:]]*:[[:space:]]*"[^"]*"' "$HOME/.openclaw/openclaw.json" | head -1 | sed 's/.*"workspace"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' | sed "s|~|$HOME|g")
fi

# 方式2: 默认路径
if [ -z "$WORKSPACE" ] || [ ! -d "$WORKSPACE" ]; then
    WORKSPACE="$HOME/.openclaw/workspace"
fi

if [ ! -d "$WORKSPACE" ]; then
    echo "❌ 未找到 OpenClaw workspace: $WORKSPACE"
    echo "   请确认 OpenClaw 已安装并至少运行过一次"
    exit 1
fi
echo "✅ OpenClaw workspace: $WORKSPACE"

# ------ 检测/创建 mcporter.json ------
CONFIG_DIR="$WORKSPACE/config"
MCPORTER_CONFIG="$CONFIG_DIR/mcporter.json"

mkdir -p "$CONFIG_DIR"

if [ ! -f "$MCPORTER_CONFIG" ]; then
    echo ""
    echo "⚠️  未找到 mcporter.json，将创建空配置文件"
    echo "   安装完成后请按 README 说明配置 Jina API Key"
    cat > "$MCPORTER_CONFIG" << 'MCPEOF'
{
  "mcpServers": {
    "jina": {
      "baseUrl": "https://mcp.jina.ai/v1",
      "headers": {
        "Authorization": "Bearer 在此替换为你的_jina_api_key"
      }
    }
  }
}
MCPEOF
    echo "✅ 已创建 mcporter.json（需要配置 Jina API Key）"
else
    # 检查是否已有 jina 配置
    if grep -q '"jina"' "$MCPORTER_CONFIG"; then
        echo "✅ mcporter.json 已存在且包含 Jina 配置"
    else
        echo "⚠️  mcporter.json 已存在但未包含 Jina 配置"
        echo "   请按 README 说明手动添加 Jina MCP 配置"
    fi
fi

# ------ 设置 Obsidian vault 路径 ------
DEFAULT_VAULT="$HOME/xiaohongshu-notes"
echo ""
read -rp "📁 Obsidian vault 保存路径 [默认: $DEFAULT_VAULT]: " VAULT_PATH
VAULT_PATH="${VAULT_PATH:-$DEFAULT_VAULT}"

# 展开 ~
VAULT_PATH="${VAULT_PATH/#\~/$HOME}"

mkdir -p "$VAULT_PATH"
echo "✅ Obsidian vault: $VAULT_PATH"

# ------ 检查模板文件 ------
if [ ! -f "$TEMPLATE" ]; then
    echo "❌ 未找到模板文件: $TEMPLATE"
    echo "   请确认在技能包目录下运行此脚本"
    exit 1
fi

# ------ 生成 SKILL.md ------
SKILL_DIR="$WORKSPACE/skills/$SKILL_NAME"
mkdir -p "$SKILL_DIR"

sed \
    -e "s|{{NPX_PATH}}|$NPX_PATH|g" \
    -e "s|{{MCPORTER_CONFIG}}|$MCPORTER_CONFIG|g" \
    -e "s|{{VAULT_PATH}}|$VAULT_PATH|g" \
    "$TEMPLATE" > "$SKILL_DIR/SKILL.md"

echo "✅ SKILL.md 已生成: $SKILL_DIR/SKILL.md"

# ------ 完成 ------
echo ""
echo "================================"
echo "🎉 安装完成！"
echo "================================"
echo ""
echo "📋 安装摘要："
echo "   技能位置: $SKILL_DIR/SKILL.md"
echo "   MCP 配置: $MCPORTER_CONFIG"
echo "   保存路径: $VAULT_PATH"
echo ""

# 检查 Jina Key 是否需要配置
if grep -q "在此替换为你的_jina_api_key" "$MCPORTER_CONFIG" 2>/dev/null; then
    echo "⚠️  下一步：配置 Jina API Key"
    echo "   1. 前往 https://jina.ai/reader 免费注册获取 API Key"
    echo "   2. 编辑 $MCPORTER_CONFIG"
    echo "   3. 将 \"在此替换为你的_jina_api_key\" 替换为你的实际 Key"
    echo ""
fi

echo "⚠️  记得重启 OpenClaw Gateway 使技能生效："
echo "   openclaw gateway restart"
echo "   # 或: systemctl --user restart openclaw-gateway.service"
echo ""
echo "🚀 然后在消息平台中发送小红书链接即可自动抓取保存！"
echo ""
