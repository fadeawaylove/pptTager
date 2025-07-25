# PPT标签管理器自动发布脚本
# 使用方法: .\release.ps1

param(
    [string]$VersionType = "",
    [string]$ReleaseNotes = ""
)

# 颜色输出函数
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

# 错误处理函数
function Handle-Error {
    param([string]$Message)
    Write-ColorOutput "❌ 错误: $Message" "Red"
    exit 1
}

# 成功提示函数
function Write-Success {
    param([string]$Message)
    Write-ColorOutput "✅ $Message" "Green"
}

# 信息提示函数
function Write-Info {
    param([string]$Message)
    Write-ColorOutput "ℹ️  $Message" "Cyan"
}

Write-ColorOutput "🚀 PPT标签管理器自动发布脚本" "Yellow"
Write-ColorOutput "=================================" "Yellow"

# 检查是否在正确的目录
if (!(Test-Path "package.json")) {
    Handle-Error "未找到package.json文件，请确保在项目根目录运行此脚本"
}

# 检查Git状态
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-ColorOutput "⚠️  检测到未提交的更改:" "Yellow"
    git status --short
    $continue = Read-Host "是否继续发布? (y/N)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        Write-Info "发布已取消"
        exit 0
    }
}

# 获取当前版本号
$packageJson = Get-Content "package.json" | ConvertFrom-Json
$currentVersion = $packageJson.version
Write-Info "当前版本: $currentVersion"

# 版本号输入
if (!$VersionType) {
    Write-ColorOutput "请选择版本类型:" "Cyan"
    Write-Host "1. 补丁版本 (x.x.X) - 修复bug"
    Write-Host "2. 次要版本 (x.X.x) - 新功能"
    Write-Host "3. 主要版本 (X.x.x) - 重大更改"
    Write-Host "4. 自定义版本号"
    
    $choice = Read-Host "请输入选择 (1-4)"
    
    $versionParts = $currentVersion.Split('.')
    $major = [int]$versionParts[0]
    $minor = [int]$versionParts[1]
    $patch = [int]$versionParts[2]
    
    switch ($choice) {
        "1" { $newVersion = "$major.$minor.$($patch + 1)" }
        "2" { $newVersion = "$major.$($minor + 1).0" }
        "3" { $newVersion = "$($major + 1).0.0" }
        "4" { 
            $newVersion = Read-Host "请输入新版本号 (格式: x.y.z)"
            if ($newVersion -notmatch "^\d+\.\d+\.\d+$") {
                Handle-Error "版本号格式不正确，应为 x.y.z 格式"
            }
        }
        default { Handle-Error "无效的选择" }
    }
} else {
    $newVersion = $VersionType
}

Write-Info "新版本号: $newVersion"

# 发布说明输入
if (!$ReleaseNotes) {
    Write-ColorOutput "请输入发布说明 (支持多行，输入空行结束):" "Cyan"
    $releaseNotesList = @()
    do {
        $line = Read-Host
        if ($line) {
            $releaseNotesList += $line
        }
    } while ($line)
    
    if ($releaseNotesList.Count -eq 0) {
        Handle-Error "发布说明不能为空"
    }
    
    $ReleaseNotes = $releaseNotesList -join "`n"
}

# 确认发布信息
Write-ColorOutput "发布信息确认:" "Yellow"
Write-Host "版本号: $currentVersion -> $newVersion"
Write-Host "发布说明:"
Write-Host $ReleaseNotes
Write-Host ""

$confirm = Read-Host "确认发布? (y/N)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Info "发布已取消"
    exit 0
}

Write-Info "开始发布流程..."

# 1. 更新package.json版本号
Write-Info "更新package.json版本号..."
$packageContent = Get-Content "package.json" -Raw
$packageContent = $packageContent -replace '"version":\s*"[^"]+"', "\"version\": \"$newVersion\""
Set-Content "package.json" $packageContent -NoNewline
Write-Success "版本号已更新到 $newVersion"

# 2. 更新RELEASE.md
Write-Info "更新RELEASE.md..."
$currentDate = Get-Date -Format "yyyy-MM-dd"
$releaseHeader = "## v$newVersion ($currentDate)"

# 格式化发布说明
$formattedNotes = $ReleaseNotes -split "`n" | ForEach-Object {
    if ($_.Trim()) {
        "- $_"
    }
} | Where-Object { $_ }

$newReleaseContent = @(
    "# 版本更新日志",
    "",
    $releaseHeader,
    "",
    "### 🎯 更新内容"
    $formattedNotes
    "",
    "---",
    ""
) -join "`n"

# 读取现有的RELEASE.md内容（跳过第一行标题）
$existingContent = Get-Content "RELEASE.md" -Raw
$existingLines = $existingContent -split "`n"
if ($existingLines[0] -eq "# 版本更新日志") {
    $existingContent = ($existingLines[1..($existingLines.Length-1)] -join "`n").TrimStart()
}

# 合并内容
$finalContent = $newReleaseContent + $existingContent
Set-Content "RELEASE.md" $finalContent -NoNewline
Write-Success "RELEASE.md已更新"

# 3. Git操作
Write-Info "执行Git操作..."

# 添加文件
git add .
if ($LASTEXITCODE -ne 0) {
    Handle-Error "git add 失败"
}

# 提交
$commitMessage = "发布v$newVersion版本: $($releaseNotesList[0])"
git commit -m $commitMessage
if ($LASTEXITCODE -ne 0) {
    Handle-Error "git commit 失败"
}
Write-Success "代码已提交"

# 创建标签
git tag "v$newVersion"
if ($LASTEXITCODE -ne 0) {
    Handle-Error "创建Git标签失败"
}
Write-Success "Git标签 v$newVersion 已创建"

# 推送到远程
Write-Info "推送到远程仓库..."
git push origin main
if ($LASTEXITCODE -ne 0) {
    Handle-Error "推送代码到远程仓库失败"
}
Write-Success "代码已推送到远程main分支"

git push origin "v$newVersion"
if ($LASTEXITCODE -ne 0) {
    Handle-Error "推送标签到远程仓库失败"
}
Write-Success "标签已推送到远程仓库"

Write-ColorOutput "" 
Write-ColorOutput "🎉 发布完成!" "Green"
Write-ColorOutput "版本 v$newVersion 已成功发布" "Green"
Write-ColorOutput "GitHub Actions 正在自动构建和发布..." "Cyan"
Write-ColorOutput "请访问 GitHub 仓库查看发布状态" "Cyan"