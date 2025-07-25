# 自动发布脚本使用指南

本项目提供了多种自动发布脚本，帮助快速发布新版本，无需手动执行重复的操作。

## 🚀 可用的发布脚本

### 0. 全自动发布脚本 (零交互)
```bash
npm run auto-release
# 或者
node auto-release.js
```
**特点：** 
- 🎯 **零交互** - 无需任何用户输入
- 🔄 **自动版本** - 自动递增补丁版本号
- 📝 **智能日志** - 基于Git提交记录自动生成发布说明
- ⚡ **一键发布** - 从版本更新到推送全程自动化

**适用场景：** 日常小版本发布、CI/CD自动化、快速迭代

### 1. Node.js 脚本 (推荐)
```bash
npm run release
# 或者
node release.js
```
**优点：** 跨平台兼容，功能完整，用户体验最佳

### 2. PowerShell 脚本 (Windows)
```bash
npm run release:ps
# 或者
powershell -ExecutionPolicy Bypass -File release.ps1
```
**优点：** Windows原生支持，功能完整

### 3. 批处理脚本 (Windows)
```bash
npm run release:win
# 或者
release.bat
```
**优点：** 简单易用，无需额外配置

## 📋 发布流程

所有脚本都会执行以下完整的发布流程：

1. **环境检查**
   - 检查是否在项目根目录
   - 检查Git工作区状态
   - 提示未提交的更改

2. **版本管理**
   - 显示当前版本号
   - 提供版本类型选择：
     - 补丁版本 (x.x.X) - 修复bug
     - 次要版本 (x.X.x) - 新功能
     - 主要版本 (X.x.x) - 重大更改
     - 自定义版本号

3. **发布说明**
   - 交互式输入发布说明
   - 支持多行输入
   - 自动格式化为Markdown列表

4. **确认信息**
   - 显示版本变更信息
   - 显示发布说明预览
   - 要求用户确认

5. **自动化操作**
   - 更新 `package.json` 版本号
   - 更新 `RELEASE.md` 发布日志
   - Git 提交所有更改
   - 创建版本标签
   - 推送代码到远程仓库
   - 推送标签触发 GitHub Actions

## 🎯 使用示例

### 发布补丁版本
```bash
npm run release
# 选择 1 (补丁版本)
# 输入发布说明: 修复标签筛选bug
# 确认发布
```

### 发布功能版本
```bash
npm run release
# 选择 2 (次要版本)
# 输入发布说明: 
#   新增鼠标滚轮切换功能
#   优化用户界面
#   (空行结束)
# 确认发布
```

## ⚠️ 注意事项

1. **权限要求**
   - 确保有Git仓库的推送权限
   - PowerShell脚本可能需要执行策略权限

2. **网络要求**
   - 需要网络连接以推送到GitHub
   - 确保Git远程仓库配置正确

3. **工作区状态**
   - 建议在发布前提交所有更改
   - 脚本会检查并提示未提交的文件

4. **版本号格式**
   - 必须遵循语义化版本规范 (x.y.z)
   - 自定义版本号会进行格式验证

## 🔧 故障排除

### PowerShell 执行策略错误
```bash
# 临时允许脚本执行
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
```

### Git 推送失败
- 检查网络连接
- 确认Git远程仓库配置
- 验证推送权限

### 版本号冲突
- 检查远程仓库是否已存在相同标签
- 选择更高的版本号

## 📝 自定义配置

如需修改发布流程，可以编辑对应的脚本文件：
- `release.js` - Node.js版本
- `release.ps1` - PowerShell版本
- `release.bat` - 批处理版本

## 🎉 发布完成后

脚本执行成功后：
1. GitHub Actions 会自动开始构建
2. 多平台安装包会自动生成
3. GitHub Release 会自动创建
4. 可在GitHub仓库查看发布状态

---

**提示：** 推荐使用 `npm run release` 命令，它提供最佳的跨平台兼容性和用户体验。