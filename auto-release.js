#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const readline = require('readline');

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

// 获取最近的提交记录
function getRecentCommits(count = 5) {
    try {
        const commits = execSilent(`git log --oneline -${count} --pretty=format:"%s"`);
        return commits.split('\n').filter(commit => commit.trim());
    } catch (err) {
        return [];
    }
}

// 自动生成发布说明
function generateReleaseNotes(commits) {
    const releaseNotes = [];
    
    commits.forEach(commit => {
        // 过滤掉发布相关的提交
        if (!commit.includes('发布v') && !commit.includes('release v') && !commit.includes('版本')) {
            // 简化提交信息
            let note = commit;
            // 移除常见的前缀
            note = note.replace(/^(feat|fix|docs|style|refactor|test|chore):\s*/i, '');
            note = note.replace(/^(新增|修复|优化|更新)[:：]?\s*/i, '');
            
            // 确保首字母大写
            if (note.length > 0) {
                note = note.charAt(0).toUpperCase() + note.slice(1);
                releaseNotes.push(note);
            }
        }
    });
    
    // 如果没有有效的提交记录，使用默认说明
    if (releaseNotes.length === 0) {
        releaseNotes.push('常规更新和优化');
        releaseNotes.push('修复已知问题');
        releaseNotes.push('提升用户体验');
    }
    
    return releaseNotes;
}

// 获取用户输入的发布说明
function getUserReleaseNotes() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const notes = [];
        
        console.log('\n请输入发布说明（每行一个要点，输入空行结束）:');
        console.log('提示：可以输入多行，每行描述一个更新内容');
        console.log('例如：修复预览页面布局问题');
        console.log('     优化用户界面体验');
        console.log('');
        
        function askForNote() {
            rl.question(`${notes.length + 1}. `, (answer) => {
                if (answer.trim() === '') {
                    rl.close();
                    if (notes.length === 0) {
                        warning('未输入发布说明，将使用自动生成的说明');
                        resolve(null);
                    } else {
                        resolve(notes);
                    }
                } else {
                    notes.push(answer.trim());
                    askForNote();
                }
            });
        }
        
        askForNote();
    });
}

// 主函数
async function main() {
    colorLog('🚀 PPT标签管理器全自动发布脚本', 'yellow');
    colorLog('=====================================', 'yellow');

    // 检查是否在正确的目录
    if (!fs.existsSync('package.json')) {
        error('未找到package.json文件，请确保在项目根目录运行此脚本');
    }

    // 检查Git状态
    const gitStatus = execSilent('git status --porcelain');
    if (gitStatus) {
        warning('检测到未提交的更改，将先提交这些更改...');
        execCommand('git add .');
        execCommand('git commit -m "自动提交：准备发布新版本"');
        success('未提交的更改已自动提交');
    }

    // 获取当前版本号
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const currentVersion = packageJson.version;
    info(`当前版本: ${currentVersion}`);

    // 自动递增补丁版本号
    const versionParts = currentVersion.split('.').map(Number);
    const newVersion = `${versionParts[0]}.${versionParts[1]}.${versionParts[2] + 1}`;
    info(`新版本号: ${newVersion}`);

    // 获取发布说明
    let releaseNotes;
    
    // 检查是否有命令行参数传入的发布说明
    const args = process.argv.slice(2);
    if (args.length > 0) {
        // 使用命令行参数作为发布说明
        releaseNotes = args;
        info('使用提供的发布说明:');
        releaseNotes.forEach(note => console.log(`  - ${note}`));
    } else {
        // 交互式输入发布说明
        const userNotes = await getUserReleaseNotes();
        
        if (userNotes && userNotes.length > 0) {
            releaseNotes = userNotes;
            info('使用用户输入的发布说明:');
            releaseNotes.forEach(note => console.log(`  - ${note}`));
        } else {
            // 自动生成发布说明
            info('分析最近的提交记录...');
            const recentCommits = getRecentCommits(10);
            releaseNotes = generateReleaseNotes(recentCommits);
            info('使用自动生成的发布说明:');
            releaseNotes.forEach(note => console.log(`  - ${note}`));
        }
    }
    
    console.log('');
    info('开始自动发布流程...');

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
    colorLog('🎉 自动发布完成!', 'green');
    colorLog(`版本 v${newVersion} 已成功发布`, 'green');
    colorLog('GitHub Actions 正在自动构建和发布...', 'cyan');
    colorLog('请访问 GitHub 仓库查看发布状态', 'cyan');
}

// 运行主函数
(async () => {
    try {
        await main();
    } catch (err) {
        error(err.message);
    }
})();