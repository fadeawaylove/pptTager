@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo 🚀 PPT标签管理器自动发布脚本
echo =================================

:: 检查是否在正确的目录
if not exist "package.json" (
    echo ❌ 错误: 未找到package.json文件，请确保在项目根目录运行此脚本
    pause
    exit /b 1
)

:: 检查Git状态
for /f "delims=" %%i in ('git status --porcelain 2^>nul') do (
    echo ⚠️  检测到未提交的更改
    git status --short
    set /p "continue=是否继续发布? (y/N): "
    if /i not "!continue!"=="y" (
        echo ℹ️  发布已取消
        pause
        exit /b 0
    )
)

:: 获取当前版本号
for /f "tokens=2 delims=\"" %%i in ('findstr "version" package.json') do set "currentVersion=%%i"
echo ℹ️  当前版本: %currentVersion%

:: 版本号输入
echo 请选择版本类型:
echo 1. 补丁版本 (x.x.X) - 修复bug
echo 2. 次要版本 (x.X.x) - 新功能  
echo 3. 主要版本 (X.x.x) - 重大更改
echo 4. 自定义版本号
set /p "choice=请输入选择 (1-4): "

:: 解析当前版本号
for /f "tokens=1,2,3 delims=." %%a in ("%currentVersion%") do (
    set "major=%%a"
    set "minor=%%b"
    set "patch=%%c"
)

if "%choice%"=="1" (
    set /a "patch+=1"
    set "newVersion=%major%.%minor%.%patch%"
) else if "%choice%"=="2" (
    set /a "minor+=1"
    set "newVersion=%major%.%minor%.0"
) else if "%choice%"=="3" (
    set /a "major+=1"
    set "newVersion=%major%.0.0"
) else if "%choice%"=="4" (
    set /p "newVersion=请输入新版本号 (格式: x.y.z): "
) else (
    echo ❌ 错误: 无效的选择
    pause
    exit /b 1
)

echo ℹ️  新版本号: %newVersion%

:: 发布说明输入
echo 请输入发布说明 (输入完成后按回车):
set /p "releaseNotes="

if "%releaseNotes%"=="" (
    echo ❌ 错误: 发布说明不能为空
    pause
    exit /b 1
)

:: 确认发布信息
echo.
echo 发布信息确认:
echo 版本号: %currentVersion% -^> %newVersion%
echo 发布说明: %releaseNotes%
echo.
set /p "confirm=确认发布? (y/N): "
if /i not "%confirm%"=="y" (
    echo ℹ️  发布已取消
    pause
    exit /b 0
)

echo ℹ️  开始发布流程...

:: 调用PowerShell脚本执行实际发布
powershell -ExecutionPolicy Bypass -File "release.ps1" -VersionType "%newVersion%" -ReleaseNotes "%releaseNotes%"

if %errorlevel% neq 0 (
    echo ❌ 发布失败
    pause
    exit /b 1
)

echo.
echo 🎉 发布完成!
echo 版本 v%newVersion% 已成功发布
echo GitHub Actions 正在自动构建和发布...
echo 请访问 GitHub 仓库查看发布状态
pause