# 版本检查功能配置指南

## 概述

PPT标签管理器现在支持自动检查更新版本功能。该功能通过GitHub API检查最新发布的版本，并提供下载链接。

## 配置步骤

### 1. 设置GitHub仓库

在 `main.js` 文件中找到以下代码行：

```javascript
path: '/repos/your-username/ppt-tagger/releases/latest',
```

将其修改为您的实际GitHub仓库路径：

```javascript
path: '/repos/您的用户名/您的仓库名/releases/latest',
```

例如：
```javascript
path: '/repos/johndoe/ppt-tagger/releases/latest',
```

### 2. 创建GitHub Release

要使版本检查功能正常工作，您需要在GitHub仓库中创建Release：

1. 在GitHub仓库页面，点击右侧的 "Releases"
2. 点击 "Create a new release"
3. 填写以下信息：
   - **Tag version**: 版本号（如 v1.4.0）
   - **Release title**: 版本标题（如 "版本 1.4.0 - 新增版本检查功能"）
   - **Description**: 更新说明和新功能介绍
4. 上传编译好的应用程序文件
5. 点击 "Publish release"

### 3. 版本号格式

确保您的版本号遵循语义化版本控制（Semantic Versioning）：
- 格式：`MAJOR.MINOR.PATCH`
- 示例：`1.3.0`, `2.0.1`, `1.4.5`
- GitHub标签可以带 `v` 前缀（如 `v1.3.0`），系统会自动处理

### 4. package.json版本同步

确保 `package.json` 中的版本号与GitHub Release的版本号保持一致：

```json
{
  "name": "ppt-tagger",
  "version": "1.3.0",
  ...
}
```

## 功能特性

### 版本检查
- 自动获取当前应用版本
- 从GitHub API获取最新发布版本
- 智能版本号比较
- 网络错误处理

### 用户界面
- 在设置页面显示版本信息
- 一键检查更新按钮
- 更新状态指示器（检查中、已是最新、有新版本、检查失败）
- 显示更新说明和发布时间
- 直接跳转到下载页面

### 状态指示
- 🟡 **检查中**: 正在连接GitHub API
- 🟢 **已是最新**: 当前版本是最新版本
- 🔴 **有新版本**: 发现新版本，显示下载按钮
- ❌ **检查失败**: 网络错误或API限制

## 使用方法

1. 打开应用程序
2. 点击右上角的 "设置" 按钮
3. 在设置页面找到 "版本信息" 部分
4. 点击 "检查更新" 按钮
5. 如果有新版本，点击 "下载更新" 按钮跳转到GitHub下载页面

## 故障排除

### 常见问题

**Q: 检查更新时显示 "检查失败"**
A: 可能的原因：
- 网络连接问题
- GitHub API访问限制
- 仓库路径配置错误
- 仓库不存在或为私有仓库

**Q: 显示 "获取失败"**
A: 应用程序无法读取自身版本信息，检查 `package.json` 文件是否正确

**Q: 版本比较不准确**
A: 确保版本号格式正确，遵循 `x.y.z` 格式

### 调试方法

1. 打开开发者工具（F12）
2. 查看控制台错误信息
3. 检查网络请求是否成功
4. 验证GitHub API响应数据

## 安全注意事项

- 版本检查功能只读取公开的GitHub API
- 不会收集或发送用户数据
- 所有网络请求都有超时限制
- 用户可以选择是否检查更新

## 自定义配置

如果您想使用其他版本检查服务，可以修改 `main.js` 中的 `checkLatestVersion` 函数，更改API端点和数据解析逻辑。

---

**注意**: 首次使用前，请确保已正确配置GitHub仓库路径，否则版本检查功能将无法正常工作。