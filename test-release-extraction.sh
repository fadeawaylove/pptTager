#!/bin/bash

# 测试从RELEASE.md提取发布说明的脚本

VERSION="v1.6.38"

echo "正在测试提取版本 $VERSION 的发布说明..."
echo "================================"

# 从RELEASE.md中提取对应版本的发布说明
if [ -f "RELEASE.md" ]; then
  # 查找版本标题行
  START_LINE=$(grep -n "^## $VERSION" RELEASE.md | head -1 | cut -d: -f1)
  
  if [ -n "$START_LINE" ]; then
    echo "找到版本 $VERSION 在第 $START_LINE 行"
    
    # 查找下一个版本标题行（作为结束位置）
    NEXT_VERSION_LINE=$(tail -n +$((START_LINE + 1)) RELEASE.md | grep -n "^## v" | head -1 | cut -d: -f1)
    
    if [ -n "$NEXT_VERSION_LINE" ]; then
      # 计算实际的结束行号
      END_LINE=$((START_LINE + NEXT_VERSION_LINE - 1))
      echo "下一个版本在相对位置 $NEXT_VERSION_LINE，实际结束行 $END_LINE"
      # 提取版本说明（跳过版本标题行和分隔线）
      RELEASE_NOTES=$(sed -n "$((START_LINE + 1)),$((END_LINE - 1))p" RELEASE.md | sed '/^---$/d' | sed '/^$/N;/^\n$/d')
    else
      echo "没有找到下一个版本，提取到文件末尾"
      # 如果没有找到下一个版本，提取到文件末尾
      RELEASE_NOTES=$(tail -n +$((START_LINE + 1)) RELEASE.md | sed '/^---$/d' | sed '/^$/N;/^\n$/d')
    fi
    
    # 如果提取的内容为空，使用默认说明
    if [ -z "$RELEASE_NOTES" ]; then
      RELEASE_NOTES="### 🎯 更新内容\n- 常规更新和优化\n- 修复已知问题\n- 提升用户体验"
      echo "提取的内容为空，使用默认说明"
    else
      echo "成功提取发布说明"
    fi
  else
    # 如果没有找到对应版本，使用默认说明
    RELEASE_NOTES="### 🎯 更新内容\n- 常规更新和优化\n- 修复已知问题\n- 提升用户体验"
    echo "没有找到版本 $VERSION，使用默认说明"
  fi
else
  # 如果RELEASE.md文件不存在，使用默认说明
  RELEASE_NOTES="### 🎯 更新内容\n- 常规更新和优化\n- 修复已知问题\n- 提升用户体验"
  echo "RELEASE.md文件不存在，使用默认说明"
fi

echo "================================"
echo "提取的发布说明："
echo "================================"
echo -e "$RELEASE_NOTES"
echo "================================"

# 将发布说明保存到输出文件
echo -e "$RELEASE_NOTES" > test_release_notes.txt

# 添加下载说明和系统要求
cat >> test_release_notes.txt << 'EOF'

### 📥 下载说明
- **Windows**: 下载 `.exe` 文件直接安装
- **macOS**: 下载 `.dmg` 文件安装
- **Linux**: 下载 `.AppImage` 文件，添加执行权限后运行

### 💻 系统要求
- Windows 10/11 (64位)
- macOS 10.15+ (64位)
- Linux (64位)
- 可选：LibreOffice（用于PPT预览功能）
EOF

echo "完整的发布说明已保存到 test_release_notes.txt"
echo "文件内容："
echo "================================"
cat test_release_notes.txt
echo "================================"