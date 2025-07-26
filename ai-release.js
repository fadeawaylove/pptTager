#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

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

// AI生成的发布说明
function generateAIReleaseNotes() {
    // 这里可以根据最近的提交记录和代码变更智能生成发布说明
    // 目前使用预设的常见发布说明
    const commonNotes = [
        '修复预览页面布局问题',
        '优化用户界面体验',
        '提升应用性能和稳定性',
        '修复已知bug',
        '改进代码质量'
    ];
    
    // 随机选择1-3个发布说明
    const count = Math.floor(Math.random() * 3) + 1;
    const selectedNotes = [];
    const usedIndices = new Set();
    
    while (selectedNotes.length < count && selectedNotes.length < commonNotes.length) {
        const index = Math.floor(Math.random() * commonNotes.length);
        if (!usedIndices.has(index)) {
            usedIndices.add(index);
            selectedNotes.push(commonNotes[index]);
        }
    }
    
    return selectedNotes;
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