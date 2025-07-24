# 自动发布说明

## GitHub Actions 自动发布流程

本项目已配置 GitHub Actions 工作流，可以在推送版本标签时自动构建并创建 Release。

### 使用步骤

1. **提交代码到 GitHub**
   ```bash
   git add .
   git commit -m "准备发布 v1.0.0"
   git push origin main
   ```

2. **创建并推送版本标签**
   ```bash
   # 创建版本标签（格式：v主版本.次版本.修订版本）
   git tag v1.0.0
   
   # 推送标签到 GitHub
   git push origin v1.0.0
   ```

3. **自动构建和发布**
   - GitHub Actions 会自动检测到新标签
   - 自动安装依赖并构建应用程序
   - 打包成 ZIP 文件
   - 创建 GitHub Release
   - 上传构建好的应用程序包

### 工作流程说明

- **触发条件**：推送格式为 `v*.*.*` 的标签（如 v1.0.0, v2.1.3）
- **构建环境**：Windows Latest
- **Node.js 版本**：18
- **构建命令**：`npm run pack`
- **输出文件**：`PPT-Tagger-win32-x64.zip`

### 版本号规范

建议使用语义化版本号：
- **主版本号**：不兼容的 API 修改
- **次版本号**：向下兼容的功能性新增
- **修订版本号**：向下兼容的问题修正

示例：
- `v1.0.0` - 首个正式版本
- `v1.1.0` - 新增功能
- `v1.1.1` - 修复 bug

### 注意事项

1. 确保 `package.json` 中的版本号与标签版本号一致
2. 推送标签前确保代码已经测试通过
3. Release 创建后可以在 GitHub 仓库的 Releases 页面查看
4. 用户可以直接从 Releases 页面下载最新版本的应用程序

### 手动发布（备选方案）

如果需要手动发布，可以执行：
```bash
npm run pack
```
然后手动上传 `dist/PPT-Tagger-win32-x64` 文件夹中的内容。