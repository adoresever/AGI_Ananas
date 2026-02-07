#!/bin/bash

##############################################################################
# YouTube Clipper - Claude Code Skill 安装脚本
#
# 功能：
# 1. 自动创建 Skill 目录
# 2. 复制所有必要文件
# 3. 安装 Python 依赖
# 4. 检测系统依赖（yt-dlp、FFmpeg）
#
# 使用方法：
#   bash install_as_skill.sh
##############################################################################

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印函数
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo ""
    echo "========================================"
    echo "$1"
    echo "========================================"
    echo ""
}

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 主函数
main() {
    print_header "YouTube Clipper - Claude Code Skill 安装"

    # 1. 确定 Skill 目录
    SKILL_DIR="$HOME/.claude/skills/youtube-clipper"
    print_info "目标目录: $SKILL_DIR"

    # 2. 检查是否已存在
    if [ -d "$SKILL_DIR" ]; then
        print_warning "Skill 目录已存在: $SKILL_DIR"
        read -p "是否覆盖安装？(y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "安装已取消"
            exit 0
        fi
        print_info "删除旧版本..."
        rm -rf "$SKILL_DIR"
    fi

    # 3. 创建目录
    print_info "创建 Skill 目录..."
    mkdir -p "$SKILL_DIR"
    print_success "目录已创建"

    # 4. 复制文件
    print_info "复制项目文件..."

    # 获取当前脚本所在目录（即项目根目录）
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    # 复制所有必要文件
    cp -r "$SCRIPT_DIR"/* "$SKILL_DIR/"

    # 排除不需要的文件
    if [ -d "$SKILL_DIR/.git" ]; then
        rm -rf "$SKILL_DIR/.git"
    fi
    if [ -d "$SKILL_DIR/venv" ]; then
        rm -rf "$SKILL_DIR/venv"
    fi
    if [ -d "$SKILL_DIR/__pycache__" ]; then
        rm -rf "$SKILL_DIR/__pycache__"
    fi
    if [ -d "$SKILL_DIR/youtube-clips" ]; then
        rm -rf "$SKILL_DIR/youtube-clips"
    fi
    if [ -f "$SKILL_DIR/.env" ]; then
        rm "$SKILL_DIR/.env"
    fi

    print_success "文件复制完成"

    # 5. 检查 Python
    print_info "检查 Python 环境..."
    if ! command_exists python3; then
        print_error "未找到 Python 3，请先安装 Python 3.8+"
        exit 1
    fi

    PYTHON_VERSION=$(python3 --version)
    print_success "Python 已安装: $PYTHON_VERSION"

    # 6. 检查 pip
    if ! command_exists pip3 && ! command_exists pip; then
        print_error "未找到 pip，请先安装 pip"
        exit 1
    fi
    print_success "pip 已安装"

    # 7. 安装 Python 依赖
    print_info "安装 Python 依赖..."
    cd "$SKILL_DIR"

    # 尝试使用 pip3，如果不存在则使用 pip
    if command_exists pip3; then
        pip3 install -q yt-dlp pysrt python-dotenv
    else
        pip install -q yt-dlp pysrt python-dotenv
    fi

    print_success "Python 依赖安装完成（yt-dlp、pysrt、python-dotenv）"

    # 8. 检查 yt-dlp
    print_info "检查 yt-dlp..."
    if command_exists yt-dlp; then
        YT_DLP_VERSION=$(yt-dlp --version)
        print_success "yt-dlp 已安装: $YT_DLP_VERSION"
    else
        print_warning "yt-dlp 命令行工具未安装"
        print_info "安装方法:"
        print_info "  macOS:  brew install yt-dlp"
        print_info "  Ubuntu: sudo apt-get install yt-dlp"
        print_info "  或: pip3 install -U yt-dlp"
    fi

    # 9. 检查 FFmpeg（关键：需要 libass 支持）
    print_header "检查 FFmpeg（字幕烧录需要）"

    FFMPEG_FOUND=false
    LIBASS_SUPPORTED=false

    # 检查 ffmpeg-full（macOS 推荐）
    if [ -f "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg" ]; then
        print_success "ffmpeg-full 已安装（Apple Silicon）"
        FFMPEG_FOUND=true
        LIBASS_SUPPORTED=true
    elif [ -f "/usr/local/opt/ffmpeg-full/bin/ffmpeg" ]; then
        print_success "ffmpeg-full 已安装（Intel Mac）"
        FFMPEG_FOUND=true
        LIBASS_SUPPORTED=true
    elif command_exists ffmpeg; then
        FFMPEG_VERSION=$(ffmpeg -version | head -n 1)
        print_success "FFmpeg 已安装: $FFMPEG_VERSION"
        FFMPEG_FOUND=true

        # 检查 libass 支持
        if ffmpeg -filters 2>&1 | grep -q "subtitles"; then
            print_success "FFmpeg 支持 libass（字幕烧录可用）"
            LIBASS_SUPPORTED=true
        else
            print_warning "FFmpeg 不支持 libass（字幕烧录不可用）"
        fi
    fi

    if [ "$FFMPEG_FOUND" = false ]; then
        print_error "FFmpeg 未安装"
        print_info "安装方法:"
        print_info "  macOS:  brew install ffmpeg-full  # 推荐，包含 libass"
        print_info "  Ubuntu: sudo apt-get install ffmpeg libass-dev"
    elif [ "$LIBASS_SUPPORTED" = false ]; then
        print_warning "FFmpeg 缺少 libass 支持，字幕烧录功能将不可用"
        print_info "解决方法（macOS）:"
        print_info "  brew uninstall ffmpeg"
        print_info "  brew install ffmpeg-full"
    fi

    # 10. 创建 .env 文件
    print_header "配置环境变量"

    if [ -f "$SKILL_DIR/.env.example" ]; then
        print_info "创建 .env 文件..."
        cp "$SKILL_DIR/.env.example" "$SKILL_DIR/.env"
        print_success ".env 文件已创建"
        echo ""
        print_info "配置文件位置: $SKILL_DIR/.env"
        print_info "如需自定义配置，可编辑："
        print_info "  nano $SKILL_DIR/.env"
        print_info "  或"
        print_info "  code $SKILL_DIR/.env"
    else
        print_warning "未找到 .env.example 文件"
    fi

    # 11. 完成
    print_header "安装完成！"

    print_success "YouTube Clipper 已成功安装为 Claude Code Skill"
    echo ""
    print_info "安装位置: $SKILL_DIR"
    echo ""

    # 检查依赖状态
    if [ "$FFMPEG_FOUND" = false ] || [ "$LIBASS_SUPPORTED" = false ]; then
        print_warning "系统依赖不完整，部分功能可能不可用"
        echo ""
    fi

    print_info "使用方法："
    print_info "  在 Claude Code 中输入："
    print_info "  \"剪辑这个 YouTube 视频：https://youtube.com/watch?v=VIDEO_ID\""
    echo ""
    print_info "详细文档："
    print_info "  - Skill 使用指南: $SKILL_DIR/SKILL.md"
    print_info "  - 项目文档: $SKILL_DIR/README.md"
    print_info "  - 技术说明: $SKILL_DIR/TECHNICAL_NOTES.md"
    echo ""
    print_success "祝使用愉快！ 🎉"
    echo ""
}

# 错误处理
trap 'print_error "安装过程中发生错误"; exit 1' ERR

# 运行主函数
main
