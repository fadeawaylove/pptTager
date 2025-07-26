#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// 颜色输出
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    cyan: '\x1b[36m'
};

function colorLog(message, color = 'reset') {
    console.log(colors[color] + message + colors.reset);
}

function info(message) {
    colorLog(`ℹ️  ${message}`, 'cyan');
}

function success(message) {
    colorLog(`✅ ${message}`, 'green');
}

// 静默执行命令并返回输出
function execSilent(command) {
    try {
        return execSync(command, { encoding: 'utf8' }).trim();
    } catch (err) {
        return '';
    }
}

// 分析Git提交记录和代码变更
function analyzeChanges() {
    const changes = {
        files: [],
        commits: [],
        features: [],
        fixes: [],
        ui: false,
        performance: false
    };
    
    try {
        // 获取最近的提交记录
        const commits = execSilent('git log --oneline -10 --pretty=format:"%s"').split('\n').filter(c => c.trim());
        changes.commits = commits;
        
        // 获取最近修改的文件
        const modifiedFiles = execSilent('git diff --name-only HEAD~5 HEAD').split('\n').filter(f => f.trim());
        changes.files = modifiedFiles;
        
        // 分析提交信息
        commits.forEach(commit => {
            const lower = commit.toLowerCase();
            if (lower.includes('修复') || lower.includes('fix') || lower.includes('bug')) {
                changes.fixes.push(commit);
            }
            if (lower.includes('新增') || lower.includes('feat') || lower.includes('功能') || lower.includes('添加')) {
                changes.features.push(commit);
            }
            if (lower.includes('ui') || lower.includes('界面') || lower.includes('样式') || lower.includes('布局')) {
                changes.ui = true;
            }
            if (lower.includes('性能') || lower.includes('优化') || lower.includes('performance')) {
                changes.performance = true;
            }
        });
        
        // 分析文件变更
        modifiedFiles.forEach(file => {
            if (file.includes('.css') || file.includes('.html') || file.includes('style')) {
                changes.ui = true;
            }
        });
        
    } catch (err) {
        console.warn('分析代码变更时出现错误:', err.message);
    }
    
    return changes;
}

// AI智能生成发布说明
function generateAIReleaseNotes() {
    const changes = analyzeChanges();
    const releaseNotes = [];
    
    // 根据分析结果生成发布说明
    if (changes.ui) {
        releaseNotes.push('优化用户界面和交互体验');
    }
    
    if (changes.fixes.length > 0) {
        if (changes.fixes.some(fix => fix.toLowerCase().includes('预览') || fix.toLowerCase().includes('preview'))) {
            releaseNotes.push('修复预览功能相关问题');
        } else if (changes.fixes.some(fix => fix.toLowerCase().includes('布局') || fix.toLowerCase().includes('layout'))) {
            releaseNotes.push('修复页面布局显示问题');
        } else {
            releaseNotes.push('修复已知问题和bug');
        }
    }
    
    if (changes.features.length > 0) {
        releaseNotes.push('新增功能特性');
    }
    
    if (changes.performance) {
        releaseNotes.push('提升应用性能和响应速度');
    }
    
    // 分析具体的文件变更
    if (changes.files.includes('index.html')) {
        releaseNotes.push('更新主界面结构');
    }
    
    if (changes.files.includes('styles.css')) {
        releaseNotes.push('改进样式和视觉效果');
    }
    
    if (changes.files.some(f => f.includes('release') || f.includes('auto'))) {
        releaseNotes.push('优化发布流程');
    }
    
    // 如果没有生成任何说明，使用默认说明
    if (releaseNotes.length === 0) {
        releaseNotes.push('常规更新和优化');
        releaseNotes.push('提升用户体验');
    }
    
    // 去重并限制数量
    const uniqueNotes = [...new Set(releaseNotes)];
    return uniqueNotes.slice(0, 4); // 最多4个发布说明
}

// 主函数
function main() {
    colorLog('🤖 AI自动发布助手', 'cyan');
    colorLog('==================', 'cyan');
    
    // 生成AI发布说明
    info('AI正在生成发布说明...');
    const releaseNotes = generateAIReleaseNotes();
    
    info('生成的发布说明:');
    releaseNotes.forEach(note => console.log(`  - ${note}`));
    console.log('');
    
    // 调用auto-release.js脚本并传入发布说明
    info('启动自动发布流程...');
    try {
        const command = `node auto-release.js ${releaseNotes.map(note => `"${note}"`).join(' ')}`;
        execSync(command, { stdio: 'inherit' });
        success('AI自动发布完成!');
    } catch (err) {
        console.error('发布过程中出现错误:', err.message);
        process.exit(1);
    }
}

// 运行主函数
try {
    main();
} catch (err) {
    console.error('错误:', err.message);
    process.exit(1);
}