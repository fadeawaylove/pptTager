# GitHub Token 配置指南

## 问题说明

当您遇到 "HTTP 403: rate limit exceeded" 错误时，这是因为 GitHub API 对未认证请求有严格的限制：

- **未认证请求**：每小时每IP地址限制 60 次请求
- **认证请求**：每小时限制 5000 次请求

## 解决方案

### 方案一：等待重试（临时解决）

如果您只是偶尔遇到这个问题，可以：
1. 等待 1 小时后重试
2. 使用不同的网络环境（如手机热点）
3. 稍后再检查更新

### 方案二：配置 GitHub Token（推荐）

通过配置 GitHub Personal Access Token，可以将 API 限制从每小时 60 次提升到 5000 次。

#### 步骤 1：创建 GitHub Personal Access Token

1. 登录您的 GitHub 账户
2. 访问 [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
3. 点击 "Generate new token" > "Generate new token (classic)"
4. 填写以下信息：
   - **Note**: `PPT-Tagger-Update-Check`
   - **Expiration**: 选择合适的过期时间（建议 90 天或更长）
   - **Scopes**: 只需要勾选 `public_repo`（用于访问公共仓库信息）
5. 点击 "Generate token"
6. **重要**：复制生成的 token（只会显示一次）

#### 步骤 2：配置环境变量

**Windows 系统：**

1. 按 `Win + R`，输入 `sysdm.cpl`，按回车
2. 点击 "高级" 选项卡
3. 点击 "环境变量"
4. 在 "用户变量" 区域点击 "新建"
5. 变量名：`GITHUB_TOKEN`
6. 变量值：粘贴您刚才复制的 token
7. 点击 "确定" 保存
8. **重启应用程序**以使环境变量生效

**macOS/Linux 系统：**

1. 打开终端
2. 编辑您的 shell 配置文件：
   ```bash
   # 对于 bash
   echo 'export GITHUB_TOKEN="your_token_here"' >> ~/.bashrc
   source ~/.bashrc
   
   # 对于 zsh
   echo 'export GITHUB_TOKEN="your_token_here"' >> ~/.zshrc
   source ~/.zshrc
   ```
3. 重启应用程序

#### 步骤 3：验证配置

1. 重启 PPT 标签管理器
2. 打开设置页面
3. 点击 "检查更新"
4. 如果配置正确，应该不再出现 403 错误

## 安全注意事项

1. **保护您的 Token**：
   - 不要将 token 分享给他人
   - 不要在公共场所或截图中暴露 token
   - 如果 token 泄露，立即在 GitHub 上撤销并重新生成

2. **最小权限原则**：
   - 只授予必要的权限（`public_repo`）
   - 定期检查和更新 token 权限

3. **定期更新**：
   - 设置合理的过期时间
   - 在 token 过期前及时更新

## 故障排除

### 问题：配置 token 后仍然出现 403 错误

**可能原因和解决方案：**

1. **环境变量未生效**：
   - 确保重启了应用程序
   - 检查环境变量名是否正确：`GITHUB_TOKEN`

2. **Token 权限不足**：
   - 确保 token 包含 `public_repo` 权限
   - 重新生成 token 并确保选择了正确的权限

3. **Token 已过期**：
   - 检查 token 是否已过期
   - 生成新的 token 并更新环境变量

4. **Token 格式错误**：
   - 确保 token 没有多余的空格或字符
   - Token 应该是以 `ghp_` 开头的字符串

### 问题：不想配置 GitHub Token

如果您不想配置 GitHub Token，可以：

1. **手动检查更新**：
   - 访问 [项目发布页面](https://github.com/fadeawaylove/pptTager/releases)
   - 手动下载最新版本

2. **减少检查频率**：
   - 避免频繁点击 "检查更新" 按钮
   - 应用启动时的自动检查不会频繁触发

3. **使用不同网络**：
   - 在不同的网络环境下检查更新
   - 使用手机热点等

## 技术说明

GitHub API 的限制是基于 IP 地址的，这意味着：

- 如果多个用户在同一网络（如公司网络）下使用应用，可能会更快达到限制
- 配置 GitHub Token 可以将限制提升 83 倍（从 60/小时 到 5000/小时）
- Token 认证是安全的，应用只会读取公开的发布信息，不会访问您的私人数据

## 联系支持

如果您在配置过程中遇到问题，可以：

1. 查看应用的开发者工具（F12）中的错误信息
2. 在 [GitHub Issues](https://github.com/fadeawaylove/pptTager/issues) 中提交问题
3. 提供详细的错误信息和操作步骤

---

**注意**：配置 GitHub Token 是可选的，但强烈推荐，特别是如果您经常检查更新或在共享网络环境中使用应用。