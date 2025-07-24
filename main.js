const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { exec, spawn } = require('child_process');
const os = require('os');

let mainWindow;
const DATA_FILE = path.join(app.getPath('userData'), 'ppt-tags.json');
const SETTINGS_FILE = path.join(app.getPath('userData'), 'app-settings.json');

// 创建主窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    autoHideMenuBar: true
  });

  mainWindow.loadFile('index.html');

  // 开发模式下打开开发者工具
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

// 应用准备就绪时创建窗口
app.whenReady().then(createWindow);

// 所有窗口关闭时退出应用（macOS除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC处理程序

// 选择文件夹
ipcMain.handle('select-folder', async () => {
  // 加载上次选择的文件夹作为默认路径
  let defaultPath;
  try {
    if (await fs.pathExists(SETTINGS_FILE)) {
      const settings = await fs.readJson(SETTINGS_FILE);
      defaultPath = settings.lastSelectedFolder;
    }
  } catch (error) {
    console.log('加载设置文件失败:', error);
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: defaultPath
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];
    
    // 保存选择的文件夹路径
    try {
      let settings = {};
      if (await fs.pathExists(SETTINGS_FILE)) {
        settings = await fs.readJson(SETTINGS_FILE);
      }
      settings.lastSelectedFolder = selectedPath;
      await fs.writeJson(SETTINGS_FILE, settings, { spaces: 2 });
    } catch (error) {
      console.log('保存设置文件失败:', error);
    }
    
    return selectedPath;
  }
  return null;
});

// 扫描PPT文件
ipcMain.handle('scan-ppt-files', async (event, folderPath) => {
  try {
    const files = await fs.readdir(folderPath);
    const pptFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ext === '.ppt' || ext === '.pptx';
    }).map(file => ({
      name: file,
      path: path.join(folderPath, file),
      size: fs.statSync(path.join(folderPath, file)).size,
      modified: fs.statSync(path.join(folderPath, file)).mtime
    }));
    
    return pptFiles;
  } catch (error) {
    console.error('扫描PPT文件时出错:', error);
    return [];
  }
});

// 加载标签数据
ipcMain.handle('load-tags', async () => {
  try {
    if (await fs.pathExists(DATA_FILE)) {
      const data = await fs.readJson(DATA_FILE);
      return data;
    }
    return {};
  } catch (error) {
    console.error('加载标签数据时出错:', error);
    return {};
  }
});

// 保存标签数据
ipcMain.handle('save-tags', async (event, tagsData) => {
  try {
    await fs.writeJson(DATA_FILE, tagsData, { spaces: 2 });
    return true;
  } catch (error) {
    console.error('保存标签数据时出错:', error);
    return false;
  }
});

// 获取上次选择的文件夹
ipcMain.handle('get-last-folder', async () => {
  try {
    if (await fs.pathExists(SETTINGS_FILE)) {
      const settings = await fs.readJson(SETTINGS_FILE);
      return settings.lastSelectedFolder || null;
    }
    return null;
  } catch (error) {
    console.error('加载上次文件夹时出错:', error);
    return null;
  }
});

// 打开文件
ipcMain.handle('open-file', async (event, filePath) => {
  try {
    await shell.openPath(filePath);
    return true;
  } catch (error) {
    console.error('打开文件时出错:', error);
    return false;
  }
});

// 获取PPT预览
ipcMain.handle('get-ppt-preview', async (event, filePath) => {
  try {
    console.log('开始处理PPT预览:', filePath);
    
    // 首先检查LibreOffice是否可用
    const isLibreOfficeAvailable = await checkLibreOfficeAvailable();
    
    if (!isLibreOfficeAvailable) {
      console.log('LibreOffice未安装，返回安装提示');
      return {
        success: false,
        error: 'LibreOffice未安装',
        svg: generateInstallPromptSVG()
      };
    }
    
    // 生成缓存文件路径
    const fileName = path.basename(filePath, path.extname(filePath));
    const cacheDir = path.join(os.tmpdir(), 'ppt-previews');
    const outputPath = path.join(cacheDir, `${fileName}.png`);
    
    // 检查缓存是否存在且是最新的
    if (fs.existsSync(outputPath)) {
      try {
        const pptStat = fs.statSync(filePath);
        const cacheStat = fs.statSync(outputPath);
        
        // 如果缓存文件比PPT文件新，则使用缓存
        if (cacheStat.mtime > pptStat.mtime) {
          console.log('使用缓存的预览图片:', outputPath);
          const imageData = fs.readFileSync(outputPath);
          return {
            success: true,
            data: `data:image/png;base64,${imageData.toString('base64')}`,
            cached: true
          };
        } else {
          console.log('PPT文件已更新，需要重新生成预览');
          // 删除过期的缓存文件
          fs.unlinkSync(outputPath);
        }
      } catch (error) {
        console.log('检查缓存文件时出错:', error);
        // 如果检查失败，删除可能损坏的缓存文件
        try {
          fs.unlinkSync(outputPath);
        } catch (unlinkError) {
          // 忽略删除错误
        }
      }
    }
    
    // 使用LibreOffice转换
    const success = await convertPPTToImage(filePath, outputPath);
    
    if (success && fs.existsSync(outputPath)) {
      console.log('LibreOffice转换成功:', outputPath);
      const imageData = fs.readFileSync(outputPath);
      return {
        success: true,
        data: `data:image/png;base64,${imageData.toString('base64')}`,
        cached: false
      };
    } else {
      console.log('LibreOffice转换失败，返回错误提示');
      return {
        success: false,
        error: 'LibreOffice转换失败',
        svg: generateErrorSVG('转换失败')
      };
    }
    
  } catch (error) {
    console.error('PPT预览处理错误:', error);
    return {
      success: false,
      error: error.message,
      svg: generateErrorSVG('处理错误')
    };
  }
});

// 获取LibreOffice可执行文件路径
function getLibreOfficePath() {
  const possiblePaths = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    'soffice' // 如果在PATH中
  ];
  
  for (const soffPath of possiblePaths) {
    try {
      if (soffPath === 'soffice' || fs.existsSync(soffPath)) {
        return soffPath;
      }
    } catch (error) {
      continue;
    }
  }
  return null;
}

// 检查LibreOffice是否可用
async function checkLibreOfficeAvailable() {
  const soffPath = getLibreOfficePath();
  
  if (!soffPath) {
    console.log('LibreOffice未找到');
    return false;
  }
  
  // 简化检测：只检查文件是否存在且可访问
  try {
    await fs.access(soffPath, fs.constants.F_OK | fs.constants.X_OK);
    console.log('LibreOffice可用:', soffPath);
    return true;
  } catch (error) {
    console.log('LibreOffice不可访问:', error.message);
    return false;
  }
}

// 生成安装提示SVG
function generateInstallPromptSVG() {
  return `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
      </linearGradient>
    </defs>
    
    <rect width="400" height="300" fill="url(#bgGradient)" rx="15"/>
    
    <!-- 图标 -->
    <circle cx="200" cy="80" r="30" fill="white" opacity="0.9"/>
    <text x="200" y="90" text-anchor="middle" font-family="Arial" font-size="24" fill="#667eea">⚠</text>
    
    <!-- 标题 -->
    <text x="200" y="130" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="white">
      需要安装 LibreOffice
    </text>
    
    <!-- 说明文字 -->
    <text x="200" y="160" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="white" opacity="0.9">
      要查看PPT真实内容预览，请先安装LibreOffice
    </text>
    
    <!-- 安装提示 -->
    <text x="200" y="190" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="white" opacity="0.8">
      点击右上角"帮助"按钮查看安装指导
    </text>
    
    <!-- 下载链接 -->
    <rect x="100" y="210" width="200" height="30" fill="white" opacity="0.2" rx="15"/>
    <text x="200" y="230" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="white" font-weight="bold">
      https://zh-cn.libreoffice.org
    </text>
    
    <!-- 装饰元素 -->
    <circle cx="50" cy="50" r="3" fill="white" opacity="0.3"/>
    <circle cx="350" cy="250" r="4" fill="white" opacity="0.2"/>
    <circle cx="80" cy="250" r="2" fill="white" opacity="0.4"/>
  </svg>`;
}

// XML转义函数
function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

// 生成错误提示SVG
function generateErrorSVG(message) {
  return `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="errorGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#ee5a24;stop-opacity:1" />
      </linearGradient>
    </defs>
    
    <rect width="400" height="300" fill="url(#errorGradient)" rx="15"/>
    
    <!-- 错误图标 -->
    <circle cx="200" cy="100" r="30" fill="white" opacity="0.9"/>
    <text x="200" y="110" text-anchor="middle" font-family="Arial" font-size="24" fill="#ff6b6b">✕</text>
    
    <!-- 错误信息 -->
    <text x="200" y="160" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="white">
      ${escapeXml(message)}
    </text>
    
    <!-- 建议 -->
    <text x="200" y="190" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="white" opacity="0.8">
      请检查文件是否完整或重新尝试
    </text>
  </svg>`;
}

// 使用LibreOffice将PPT转换为图片
async function convertPPTToImage(inputPath, outputPath) {
  return new Promise((resolve) => {
    const soffPath = getLibreOfficePath();
    
    if (!soffPath) {
      console.error('LibreOffice未找到');
      resolve(false);
      return;
    }
    
    // 构建LibreOffice命令参数
    const outputDir = path.dirname(outputPath);
    const args = ['--headless', '--convert-to', 'png', '--outdir', outputDir, inputPath];
    
    console.log('执行LibreOffice转换命令:', soffPath, args.join(' '));
    
    const child = spawn(soffPath, args);
    
    let stdout = '';
    let stderr = '';
    let resolved = false;
    
    // 设置超时
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill();
        console.log('LibreOffice转换超时');
        resolve(false);
      }
    }, 30000);
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', async (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        const error = code !== 0 ? new Error(`LibreOffice exited with code ${code}`) : null;
        if (error) {
          console.error('LibreOffice转换失败:', error.message);
          resolve(false);
          return;
        }
        
        if (stderr) {
          console.warn('LibreOffice警告:', stderr);
        }
        
        // LibreOffice会生成与输入文件同名的png文件
        const baseName = path.basename(inputPath, path.extname(inputPath));
        const generatedPath = path.join(outputDir, `${baseName}.png`);
        
        try {
          // 如果生成的文件存在，重命名为我们期望的文件名
          if (await fs.pathExists(generatedPath) && generatedPath !== outputPath) {
            await fs.move(generatedPath, outputPath);
          }
          
          const exists = await fs.pathExists(outputPath);
          console.log('转换结果:', exists ? '成功' : '失败');
          resolve(exists);
        } catch (moveError) {
          console.error('移动文件失败:', moveError);
          resolve(false);
        }
      }
    });
     
     child.on('error', (error) => {
       if (!resolved) {
         resolved = true;
         clearTimeout(timeout);
         console.error('LibreOffice进程错误:', error.message);
         resolve(false);
       }
     });
   });
 }

// 格式化文件大小
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 生成PPT预览SVG
function generatePPTPreviewSVG(data) {
  return `
    <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
        </linearGradient>
        <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#f8f9fa;stop-opacity:1" />
        </linearGradient>
      </defs>
      
      <!-- 背景 -->
      <rect width="800" height="600" fill="url(#bgGrad)"/>
      
      <!-- 主卡片 -->
      <rect x="50" y="50" width="700" height="500" rx="20" ry="20" fill="url(#cardGrad)" stroke="#e0e0e0" stroke-width="2"/>
      
      <!-- PPT图标 -->
      <rect x="350" y="100" width="100" height="80" rx="10" ry="10" fill="#ff6b6b" opacity="0.9"/>
      <rect x="360" y="110" width="80" height="60" rx="5" ry="5" fill="white" opacity="0.9"/>
      <line x1="370" y1="125" x2="430" y2="125" stroke="#333" stroke-width="2" opacity="0.7"/>
      <line x1="370" y1="135" x2="420" y2="135" stroke="#333" stroke-width="2" opacity="0.7"/>
      <line x1="370" y1="145" x2="425" y2="145" stroke="#333" stroke-width="2" opacity="0.7"/>
      <line x1="370" y1="155" x2="415" y2="155" stroke="#333" stroke-width="2" opacity="0.7"/>
      
      <!-- 文件名 -->
      <text x="400" y="220" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="24" font-weight="bold" fill="#333">${escapeXml(data.fileName)}</text>
      
      <!-- 文件信息 -->
      <text x="400" y="260" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="16" fill="#666">文件类型: ${data.fileType}</text>
      <text x="400" y="285" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="16" fill="#666">文件大小: ${data.fileSize}</text>
      <text x="400" y="310" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="16" fill="#666">修改时间: ${data.modifiedDate}</text>
      
      <!-- 装饰元素 -->
      <circle cx="150" cy="150" r="30" fill="#4CAF50" opacity="0.3"/>
      <circle cx="650" cy="450" r="40" fill="#2196F3" opacity="0.3"/>
      <rect x="100" y="400" width="60" height="60" rx="10" ry="10" fill="#FF9800" opacity="0.3"/>
      <rect x="640" y="120" width="50" height="50" rx="8" ry="8" fill="#9C27B0" opacity="0.3"/>
      
      <!-- 提示文字 -->
      <text x="400" y="380" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="14" fill="#999">这是一个PPT文件的信息预览</text>
      <text x="400" y="400" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="14" fill="#999">点击"打开文件"按钮可以用默认程序查看完整内容</text>
      
      <!-- 边框装饰 -->
      <rect x="50" y="50" width="700" height="500" rx="20" ry="20" fill="none" stroke="url(#bgGrad)" stroke-width="3" opacity="0.5"/>
    </svg>
  `;
}

// XML转义函数
function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}