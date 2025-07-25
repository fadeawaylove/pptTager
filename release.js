#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');
const readline = require('readline');
const path = require('path');

// 颜色输出
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m'
};

function colorLog(message, color = 'reset') {
    console.log(colors[color] + message + colors.reset);
}

function success(message) {
    colorLog(`✅ ${message}`, 'green');
}

function error(message) {
    colorLog(`❌ 错误: ${message}`, 'red');
    process.exit(1);
}

function info(message) {
    colorLog(`ℹ️  ${message}`, 'cyan');
}

function warning(message) {
    colorLog(`⚠️  ${message}`, 'yellow');
}

// 创建readline接口
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Promise化的question函数
function question(prompt) {
    return new Promise(resolve => {
        rl.question(prompt, resolve);
    });
}

// 执行命令
function execCommand(command, errorMessage) {
    try {
        execSync(command, { stdio: 'inherit' });
    } catch (err) {
        error(errorMessage || `执行命令失败: ${command}`);
    }
}

// 静默执行命令并返回输出
function execSilent(command) {
    try {
        return execSync(command, { encoding: 'utf8' }).trim();
    } catch (err) {
        return '';
    }
}

// 主函数
async function main() {
    colorLog('🚀 PPT标签管理器自动发布脚本', 'yellow');
    colorLog('=================================', 'yellow');

    // 检查是否在正确的目录
    if (!fs.existsSync('package.json')) {
        error('未找到package.json文件，请确保在项目根目录运行此脚本');
    }

    // 检查Git状态
    const gitStatus = execSilent('git status --porcelain');
    if (gitStatus) {
        warning('检测到未提交的更改:');
        execCommand('git status --short');
        const continueRelease = await question('是否继续发布? (y/N): ');
        if (continueRelease.toLowerCase() !== 'y') {
            info('发布已取消');
            rl.close();
            return;
        }
    }

    // 获取当前版本号
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const currentVersion = packageJson.version;
    info(`当前版本: ${currentVersion}`);

    // 版本号选择
    colorLog('请选择版本类型:', 'cyan');
    console.log('1. 补丁版本 (x.x.X) - 修复bug');
    console.log('2. 次要版本 (x.X.x) - 新功能');
    console.log('3. 主要版本 (X.x.x) - 重大更改');
    console.log('4. 自定义版本号');

    const choice = await question('请输入选择 (1-4): ');
    
    const versionParts = currentVersion.split('.').map(Number);
    let newVersion;

    switch (choice) {
        case '1':
            newVersion = `${versionParts[0]}.${versionParts[1]}.${versionParts[2] + 1}`;
            break;
        case '2':
            newVersion = `${versionParts[0]}.${versionParts[1] + 1}.0`;
            break;
        case '3':
            newVersion = `${versionParts[0] + 1}.0.0`;
            break;
        case '4':
            newVersion = await question('请输入新版本号 (格式: x.y.z): ');
            if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
                error('版本号格式不正确，应为 x.y.z 格式');
            }
            break;
        default:
            error('无效的选择');
    }

    info(`新版本号: ${newVersion}`);

    // 发布说明输入
    colorLog('请输入发布说明 (支持多行，输入空行结束):', 'cyan');
    const releaseNotes = [];
    let line;
    do {
        line = await question('');
        if (line.trim()) {
            releaseNotes.push(line.trim());
        }
    } while (line.trim());

    if (releaseNotes.length === 0) {
        error('发布说明不能为空');
    }

    // 确认发布信息
    colorLog('发布信息确认:', 'yellow');
    console.log(`版本号: ${currentVersion} -> ${newVersion}`);
    console.log('发布说明:');
    releaseNotes.forEach(note => console.log(`  - ${note}`));
    console.log('');

    const confirm = await question('确认发布? (y/N): ');
    if (confirm.toLowerCase() !== 'y') {
        info('发布已取消');
        rl.close();
        return;
    }

    info('开始发布流程...');

    // 1. 更新package.json版本号
    info('更新package.json版本号...');
    packageJson.version = newVersion;
    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2) + '\n');
    success(`版本号已更新到 ${newVersion}`);

    // 2. 更新RELEASE.md
    info('更新RELEASE.md...');
    const currentDate = new Date().toISOString().split('T')[0];
    const releaseHeader = `## v${newVersion} (${currentDate})`;
    
    // 格式化发布说明
    const formattedNotes = releaseNotes.map(note => `- ${note}`);
    
    const newReleaseContent = [
        '# 版本更新日志',
        '',
        releaseHeader,
        '',
        '### 🎯 更新内容',
        ...formattedNotes,
        '',
        '---',
        ''
    ].join('\n');

    // 读取现有的RELEASE.md内容
    let existingContent = '';
    if (fs.existsSync('RELEASE.md')) {
        const content = fs.readFileSync('RELEASE.md', 'utf8');
        const lines = content.split('\n');
        if (lines[0] === '# 版本更新日志') {
            existingContent = lines.slice(1).join('\n').replace(/^\n+/, '');
        } else {
            existingContent = content;
        }
    }

    // 合并内容
    const finalContent = newReleaseContent + existingContent;
    fs.writeFileSync('RELEASE.md', finalContent);
    success('RELEASE.md已更新');

    // 3. Git操作
    info('执行Git操作...');

    // 添加文件
    execCommand('git add .', 'git add 失败');

    // 提交
    const commitMessage = `发布v${newVersion}版本: ${releaseNotes[0]}`;
    execCommand(`git commit -m "${commitMessage}"`, 'git commit 失败');
    success('代码已提交');

    // 创建标签
    execCommand(`git tag v${newVersion}`, '创建Git标签失败');
    success(`Git标签 v${newVersion} 已创建`);

    // 推送到远程
    info('推送到远程仓库...');
    execCommand('git push origin main', '推送代码到远程仓库失败');
    success('代码已推送到远程main分支');

    execCommand(`git push origin v${newVersion}`, '推送标签到远程仓库失败');
    success('标签已推送到远程仓库');

    console.log('');
    colorLog('🎉 发布完成!', 'green');
    colorLog(`版本 v${newVersion} 已成功发布`, 'green');
    colorLog('GitHub Actions 正在自动构建和发布...', 'cyan');
    colorLog('请访问 GitHub 仓库查看发布状态', 'cyan');

    rl.close();
}

// 运行主函数
main().catch(err => {
    error(err.message);
});