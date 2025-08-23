const fs = require('fs-extra');
const path = require('path');

// 文件监控系统实现
let currentWatchedFile = null;
let fileWatcher = null;
let mainWindow = null;

// 设置主窗口引用
function setMainWindow(window) {
  mainWindow = window;
}

// 监控当前预览的PPT文件
function startWatchingFile(filePath) {
  // 停止之前的监控
  stopWatchingFile();
  
  if (!filePath || !fs.existsSync(filePath)) {
    console.log('文件不存在，无法监控:', filePath);
    return;
  }
  
  currentWatchedFile = filePath;
  console.log('开始监控文件:', filePath);
  
  // 使用fs.watchFile监控文件变化
  fs.watchFile(filePath, { interval: 1000 }, (curr, prev) => {
    // 检查文件是否真的发生了变化
    if (curr.mtime.getTime() !== prev.mtime.getTime()) {
      console.log('检测到文件变化:', filePath);
      handleFileChange(filePath);
    }
  });
  
  // 通知渲染进程监控状态
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('file-watch-status', {
      isWatching: true,
      filePath: filePath
    });
  }
}

// 停止文件监控
function stopWatchingFile() {
  if (currentWatchedFile) {
    console.log('停止监控文件:', currentWatchedFile);
    fs.unwatchFile(currentWatchedFile);
    currentWatchedFile = null;
  }
  
  // 通知渲染进程监控状态
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('file-watch-status', {
      isWatching: false,
      filePath: null
    });
  }
}

// 处理文件变化
async function handleFileChange(filePath) {
  try {
    console.log('处理文件变化:', filePath);
    
    // 通知渲染进程文件已变化，需要重新生成预览
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('file-changed', {
        filePath: filePath,
        timestamp: Date.now()
      });
    }
    
  } catch (error) {
    console.error('处理文件变化时出错:', error);
  }
}

// 获取监控状态
function getWatchStatus() {
  return {
    isWatching: currentWatchedFile !== null,
    filePath: currentWatchedFile
  };
}

module.exports = {
  setMainWindow,
  startWatchingFile,
  stopWatchingFile,
  getWatchStatus
};