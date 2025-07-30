const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { exec, spawn } = require('child_process');
const os = require('os');
const https = require('https');

// 全局变量跟踪自动更新模式
let isAutoUpdateMode = false;

let mainWindow;
const DATA_FILE = path.join(app.getPath('userData'), 'ppt-tags.json');
const SETTINGS_FILE = path.join(app.getPath('userData'), 'app-settings.json');

// 创建主窗口
function createWindow() {
  // 根据平台选择合适的图标格式
  let iconPath;
  if (process.platform === 'win32') {
    iconPath = path.join(__dirname, 'assets/icon.ico');
  } else if (process.platform === 'darwin') {
    iconPath = path.join(__dirname, 'assets/icon.icns');
  } else {
    iconPath = path.join(__dirname, 'assets/icon.png');
  }
  
  // 获取主显示器信息
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  
  // 计算窗口大小为屏幕的3/4
  const windowWidth = Math.floor(screenWidth * 0.75);
  const windowHeight = Math.floor(screenHeight * 0.75);
  
  // 设置最小和最大尺寸限制
  const minWidth = 1000;
  const minHeight = 800;
  const maxWidth = 1920;
  const maxHeight = 1440;
  
  // 应用限制
  const finalWidth = Math.max(minWidth, Math.min(maxWidth, windowWidth));
  const finalHeight = Math.max(minHeight, Math.min(maxHeight, windowHeight));
  
  console.log(`屏幕分辨率: ${screenWidth}x${screenHeight}`);
  console.log(`窗口大小: ${finalWidth}x${finalHeight}`);
  
  mainWindow = new BrowserWindow({
    width: finalWidth,
    height: finalHeight,
    icon: iconPath,
    show: false, // 防止闪动，等内容加载完成后再显示
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    autoHideMenuBar: true,
    minWidth: minWidth,
    minHeight: minHeight
  });

  // 等待页面准备就绪后再显示窗口，防止闪动
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadFile('index.html');

  // 开发模式下打开开发者工具和热更新
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
    
    // 添加热更新功能
    if (process.argv.includes('--watch')) {
      const chokidar = require('fs').watch || require('fs').watchFile;
      const filesToWatch = ['index.html', 'styles.css', 'renderer.js'];
      
      filesToWatch.forEach(file => {
        const filePath = path.join(__dirname, file);
        try {
          fs.watchFile(filePath, { interval: 1000 }, () => {
            console.log(`文件 ${file} 已更改，重新加载页面...`);
            mainWindow.reload();
          });
        } catch (error) {
          console.log(`无法监听文件 ${file}:`, error);
        }
      });
      
      console.log('热更新已启用，监听文件变化...');
    }
  }
  
  // 创建菜单以支持F12快捷键
  const { Menu } = require('electron');
  const template = [
    {
      label: '开发',
      submenu: [
        {
          label: '切换开发者工具',
          accelerator: 'F12',
          click: () => {
            if (mainWindow.webContents.isDevToolsOpened()) {
              mainWindow.webContents.closeDevTools();
            } else {
              mainWindow.webContents.openDevTools();
            }
          }
        }
      ]
    }
  ];
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // 处理窗口关闭事件，显示确认弹窗
  mainWindow.on('close', async (event) => {
    // 如果是自动更新模式，直接关闭窗口
    if (isAutoUpdateMode) {
      return;
    }
    
    event.preventDefault();
    
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['确定退出', '取消'],
      defaultId: 1,
      title: '确认退出',
      message: '确定要退出PPT标签管理器吗？',
      detail: '退出后将关闭应用程序。'
    });
    
    if (choice.response === 0) {
      // 用户选择确定退出
      mainWindow.destroy();
    }
    // 如果用户选择取消，什么都不做，窗口保持打开
  });
}

// 禁用GPU加速以解决兼容性问题
app.disableHardwareAcceleration();

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

// 递归扫描PPT文件
async function scanPPTFilesRecursively(folderPath, basePath = folderPath) {
  let pptFiles = [];
  
  try {
    const items = await fs.readdir(folderPath, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(folderPath, item.name);
      
      if (item.isDirectory()) {
        // 递归扫描子文件夹
        const subFiles = await scanPPTFilesRecursively(fullPath, basePath);
        pptFiles = pptFiles.concat(subFiles);
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (ext === '.ppt' || ext === '.pptx') {
          try {
            const stats = await fs.stat(fullPath);
            // 过滤掉小于1KB的PPT文件
            if (stats.size >= 1024) {
              const relativePath = path.relative(basePath, fullPath);
              pptFiles.push({
                name: item.name,
                path: fullPath, // 保持绝对路径用于文件操作
                relativePath: relativePath, // 相对路径字段
                size: stats.size,
                modified: stats.mtime
              });
            }
          } catch (statError) {
            console.error('获取文件信息时出错:', fullPath, statError);
          }
        }
      }
    }
  } catch (error) {
    console.error('扫描文件夹时出错:', folderPath, error);
  }
  
  return pptFiles;
}

// 扫描PPT文件
ipcMain.handle('scan-ppt-files', async (event, folderPath) => {
  try {
    const pptFiles = await scanPPTFilesRecursively(folderPath);
    return pptFiles;
  } catch (error) {
    console.error('扫描PPT文件时出错:', error);
    return [];
  }
});

// 加载标签数据
ipcMain.handle('load-tags', async (event, baseFolder) => {
  try {
    const tagsFile = getActualTagsPath();
    if (await fs.pathExists(tagsFile)) {
      const data = await fs.readJson(tagsFile);
      
      // 如果提供了基础文件夹，将相对路径转换为绝对路径
      if (baseFolder) {
        const processedData = {};
        for (const [relativePath, tags] of Object.entries(data)) {
          const absolutePath = path.resolve(baseFolder, relativePath);
          processedData[absolutePath] = tags;
        }
        return processedData;
      }
      
      return data;
    }
    return {};
  } catch (error) {
    console.error('加载标签数据时出错:', error);
    return {};
  }
});

// 保存标签数据
ipcMain.handle('save-tags', async (event, tagsData, baseFolder) => {
  try {
    const tagsFile = getActualTagsPath();
    
    // 如果提供了基础文件夹，将绝对路径转换为相对路径
    let processedTagsData = tagsData;
    if (baseFolder) {
      processedTagsData = {};
      for (const [filePath, tags] of Object.entries(tagsData)) {
        const relativePath = path.relative(baseFolder, filePath);
        processedTagsData[relativePath] = tags;
      }
    }
    
    // 确保目录存在
    await fs.ensureDir(path.dirname(tagsFile));
    await fs.writeJson(tagsFile, processedTagsData, { spaces: 2 });
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

// 移动文件并更新标签数据
ipcMain.handle('move-file', async (event, sourcePath, targetPath, baseFolder) => {
  try {
    // 检查源文件是否存在
    if (!await fs.pathExists(sourcePath)) {
      return { success: false, error: '源文件不存在' };
    }
    
    // 检查目标路径是否已存在
    if (await fs.pathExists(targetPath)) {
      return { success: false, error: '目标路径已存在文件' };
    }
    
    // 确保目标目录存在
    await fs.ensureDir(path.dirname(targetPath));
    
    // 移动文件
    await fs.move(sourcePath, targetPath);
    
    // 更新标签数据中的路径映射
    try {
      const tagsFile = getActualTagsPath();
      if (await fs.pathExists(tagsFile)) {
        const tagsData = await fs.readJson(tagsFile);
        
        // 如果提供了基础文件夹，需要转换为相对路径进行比较
        let sourceRelativePath = sourcePath;
        let targetRelativePath = targetPath;
        
        if (baseFolder) {
          sourceRelativePath = path.relative(baseFolder, sourcePath);
          targetRelativePath = path.relative(baseFolder, targetPath);
        }
        
        // 查找并更新路径
        let updated = false;
        const newTagsData = {};
        
        for (const [filePath, tags] of Object.entries(tagsData)) {
          if (filePath === sourceRelativePath) {
            // 更新为新的相对路径
            newTagsData[targetRelativePath] = tags;
            updated = true;
          } else {
            newTagsData[filePath] = tags;
          }
        }
        
        // 如果有更新，保存标签数据
        if (updated) {
          await fs.writeJson(tagsFile, newTagsData, { spaces: 2 });
        }
      }
    } catch (tagError) {
      console.error('更新标签数据时出错:', tagError);
      // 不影响文件移动的成功
    }
    
    return { success: true, newPath: targetPath };
  } catch (error) {
    console.error('移动文件时出错:', error);
    return { success: false, error: error.message };
  }
});

// 选择目标文件夹
ipcMain.handle('select-target-folder', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择目标文件夹'
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
      return { success: true, folderPath: result.filePaths[0] };
    }
    
    return { success: false, error: '用户取消选择' };
  } catch (error) {
    console.error('选择目标文件夹时出错:', error);
    return { success: false, error: error.message };
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
    const cacheDir = getActualCachePath();
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

// GitHub Token 存储文件路径（使用动态数据目录）
function getGithubTokenPath() {
  const dataDir = getActualDataDirectory();
  return path.join(dataDir, 'github-token.json');
}

// 读取 GitHub Token 指南文件内容
ipcMain.handle('read-github-token-guide', async () => {
  try {
    const guidePath = path.join(__dirname, 'GITHUB_TOKEN_SETUP.md');
    
    if (!await fs.pathExists(guidePath)) {
      return {
        success: false,
        error: '指南文件不存在'
      };
    }
    
    const content = await fs.readFile(guidePath, 'utf8');
    return {
      success: true,
      content: content
    };
  } catch (error) {
    console.error('读取GitHub Token指南失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 保存 GitHub Token
ipcMain.handle('save-github-token', async (event, token) => {
  try {
    const tokenData = {
      token: token || '',
      updatedAt: new Date().toISOString()
    };
    
    const tokenFile = getGithubTokenPath();
    await fs.ensureFile(tokenFile);
    await fs.writeJson(tokenFile, tokenData, { spaces: 2 });
    
    return {
      success: true
    };
  } catch (error) {
    console.error('保存GitHub Token失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 获取 GitHub Token
ipcMain.handle('get-github-token', async () => {
  try {
    const tokenFile = getGithubTokenPath();
    if (!await fs.pathExists(tokenFile)) {
      return {
        success: true,
        token: ''
      };
    }
    
    const tokenData = await fs.readJson(tokenFile);
    return {
      success: true,
      token: tokenData.token || ''
    };
  } catch (error) {
    console.error('读取GitHub Token失败:', error);
    return {
      success: true,
      token: ''
    };
  }
});

// 获取 GitHub Token（内部使用）
async function getGithubToken() {
  try {
    const tokenFile = getGithubTokenPath();
    if (!await fs.pathExists(tokenFile)) {
      return process.env.GITHUB_TOKEN || '';
    }
    
    const tokenData = await fs.readJson(tokenFile);
    return tokenData.token || process.env.GITHUB_TOKEN || '';
  } catch (error) {
    console.error('读取GitHub Token失败:', error);
    return process.env.GITHUB_TOKEN || '';
  }
}

// 设置自动更新模式
ipcMain.handle('set-auto-update-mode', async (event, enabled) => {
  isAutoUpdateMode = enabled;
  return { success: true };
});

// 版本检查相关功能

// 获取当前应用版本
function getCurrentVersion() {
  return app.getVersion();
}

// 比较版本号
function compareVersions(version1, version2) {
  const v1parts = version1.split('.').map(Number);
  const v2parts = version2.split('.').map(Number);
  
  const maxLength = Math.max(v1parts.length, v2parts.length);
  
  for (let i = 0; i < maxLength; i++) {
    const v1part = v1parts[i] || 0;
    const v2part = v2parts[i] || 0;
    
    if (v1part < v2part) return -1;
    if (v1part > v2part) return 1;
  }
  
  return 0;
}

// 从GitHub检查最新版本
function checkLatestVersion() {
  return new Promise(async (resolve, reject) => {
    const headers = {
      'User-Agent': 'PPT-Tagger-App',
      'Accept': 'application/vnd.github.v3+json'
    };
    
    // 获取GitHub Token（优先使用应用内设置，其次是环境变量）
    const githubToken = await getGithubToken();
    if (githubToken) {
      headers['Authorization'] = `token ${githubToken}`;
    }
    
    const options = {
      hostname: 'api.github.com',
      path: '/repos/fadeawaylove/pptTager/releases/latest',
      method: 'GET',
      headers: headers
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const release = JSON.parse(data);
            
            // 根据平台选择合适的下载链接
            let downloadUrl = release.html_url; // 默认使用发布页面链接
            let installerUrl = null;
            
            if (release.assets && release.assets.length > 0) {
              // 查找适合当前平台的安装包
              const platform = process.platform;
              let targetAsset = null;
              
              if (platform === 'win32') {
                // Windows平台查找.exe文件
                targetAsset = release.assets.find(asset => 
                  asset.name.toLowerCase().includes('setup') && 
                  asset.name.toLowerCase().endsWith('.exe')
                ) || release.assets.find(asset => 
                  asset.name.toLowerCase().endsWith('.exe')
                );
              } else if (platform === 'darwin') {
                // macOS平台查找.dmg文件
                targetAsset = release.assets.find(asset => 
                  asset.name.toLowerCase().endsWith('.dmg')
                );
              } else if (platform === 'linux') {
                // Linux平台查找AppImage文件
                targetAsset = release.assets.find(asset => 
                  asset.name.toLowerCase().includes('appimage')
                );
              }
              
              if (targetAsset) {
                installerUrl = targetAsset.browser_download_url;
              }
            }
            
            resolve({
              version: release.tag_name.replace(/^v/, ''), // 移除v前缀
              downloadUrl: downloadUrl, // 发布页面链接
              installerUrl: installerUrl, // 直接下载链接
              releaseNotes: release.body,
              publishedAt: release.published_at
            });
          } else if (res.statusCode === 403) {
            // 处理GitHub API限制错误
            let errorMessage = 'GitHub API访问受限';
            try {
              const errorData = JSON.parse(data);
              if (errorData.message && errorData.message.includes('rate limit exceeded')) {
                errorMessage = 'GitHub API请求次数超限。未认证请求每小时限制60次，认证请求每小时限制5000次。建议稍后重试或联系开发者配置GitHub Token。';
              } else {
                errorMessage = `GitHub API访问被拒绝: ${errorData.message || '未知原因'}`;
              }
            } catch (e) {
              // 如果无法解析错误响应，使用默认消息
            }
            reject(new Error(errorMessage));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          }
        } catch (error) {
          reject(new Error('解析响应数据失败: ' + error.message));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error('网络请求失败: ' + error.message));
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
    
    req.end();
  });
}

// IPC处理程序：获取当前版本
ipcMain.handle('get-current-version', async () => {
  try {
    return {
      success: true,
      version: getCurrentVersion()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// IPC处理程序：检查更新
ipcMain.handle('check-for-updates', async () => {
  try {
    const currentVersion = getCurrentVersion();
    const latestRelease = await checkLatestVersion();
    const comparison = compareVersions(currentVersion, latestRelease.version);
    
    return {
      success: true,
      currentVersion,
      latestVersion: latestRelease.version,
      hasUpdate: comparison < 0,
      downloadUrl: latestRelease.downloadUrl,
      installerUrl: latestRelease.installerUrl,
      releaseNotes: latestRelease.releaseNotes,
      publishedAt: latestRelease.publishedAt
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// IPC处理程序：打开下载页面
ipcMain.handle('open-download-page', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// IPC处理程序：打开外部链接
ipcMain.handle('open-external-link', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('打开外部链接失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// IPC处理程序：打开GitHub Token配置指南
ipcMain.handle('open-github-token-guide', async () => {
  try {
    const guidePath = path.join(__dirname, 'GITHUB_TOKEN_SETUP.md');
    
    // 检查文件是否存在
    if (await fs.pathExists(guidePath)) {
      // 使用默认程序打开Markdown文件
      await shell.openPath(guidePath);
      return { success: true };
    } else {
      return {
        success: false,
        error: '配置指南文件不存在'
      };
    }
  } catch (error) {
    console.error('打开GitHub Token配置指南失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 下载文件函数
function downloadFile(url, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    
    const request = https.get(url, (response) => {
      // 处理重定向
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlinkSync(outputPath);
        return downloadFile(response.headers.location, outputPath, onProgress)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(outputPath);
        return reject(new Error(`下载失败: HTTP ${response.statusCode}`));
      }
      
      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (onProgress && totalSize) {
          const progress = Math.round((downloadedSize / totalSize) * 100);
          onProgress(progress, downloadedSize, totalSize);
        }
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve(outputPath);
      });
      
      file.on('error', (err) => {
        file.close();
        fs.unlinkSync(outputPath);
        reject(err);
      });
    });
    
    request.on('error', (err) => {
      file.close();
      fs.unlinkSync(outputPath);
      reject(err);
    });
    
    request.setTimeout(30000, () => {
      request.destroy();
      file.close();
      fs.unlinkSync(outputPath);
      reject(new Error('下载超时'));
    });
  });
}

// IPC处理程序：下载并安装更新
ipcMain.handle('download-and-install-update', async (event, installerUrl) => {
  try {
    if (!installerUrl) {
      return {
        success: false,
        error: '没有找到适合当前平台的安装包'
      };
    }
    
    // 获取文件名
    const urlParts = installerUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];
    const downloadPath = path.join(os.tmpdir(), fileName);
    
    // 发送下载开始事件
    mainWindow.webContents.send('download-progress', {
      status: 'started',
      message: '开始下载更新包...'
    });
    
    // 下载文件
    await downloadFile(installerUrl, downloadPath, (progress, downloaded, total) => {
      mainWindow.webContents.send('download-progress', {
        status: 'downloading',
        progress: progress,
        downloaded: downloaded,
        total: total,
        message: `下载中... ${progress}%`
      });
    });
    
    // 下载完成
    mainWindow.webContents.send('download-progress', {
      status: 'completed',
      message: '下载完成，准备安装...'
    });
    
    // 启动安装程序
    if (process.platform === 'win32') {
      // Windows: 启动exe安装程序
      spawn(downloadPath, [], { detached: true, stdio: 'ignore' });
    } else if (process.platform === 'darwin') {
      // macOS: 打开dmg文件
      exec(`open "${downloadPath}"`);
    } else if (process.platform === 'linux') {
      // Linux: 使其可执行并运行
      exec(`chmod +x "${downloadPath}" && "${downloadPath}"`);
    }
    
    // 设置自动更新模式并延迟退出应用程序，给安装程序时间启动
    isAutoUpdateMode = true;
    setTimeout(() => {
      // 直接销毁主窗口，避免关闭确认对话框
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.destroy();
      }
      app.quit();
    }, 2000);
    
    return {
      success: true,
      message: '安装程序已启动，应用程序将自动关闭'
    };
    
  } catch (error) {
    mainWindow.webContents.send('download-progress', {
      status: 'error',
      message: '下载失败: ' + error.message
    });
    
    return {
      success: false,
      error: error.message
    };
  }
});

// 设置相关的IPC处理程序

// 获取当前设置
ipcMain.handle('get-current-settings', async () => {
  try {
    let settings = {};
    if (await fs.pathExists(SETTINGS_FILE)) {
      settings = await fs.readJson(SETTINGS_FILE);
    }
    
    // 获取当前实际使用的应用数据目录
    const currentAppDataDirectory = getActualAppDataDirectory();
    
    return {
      appDataDirectory: currentAppDataDirectory
    };
  } catch (error) {
    console.error('获取当前设置失败:', error);
    return {
      appDataDirectory: getDefaultAppDataDirectory()
    };
  }
});

// 选择应用数据目录
ipcMain.handle('select-app-data-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择应用数据目录'
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// 重置应用数据目录
ipcMain.handle('reset-app-data-directory', async () => {
  try {
    let settings = {};
    if (await fs.pathExists(SETTINGS_FILE)) {
      settings = await fs.readJson(SETTINGS_FILE);
    }
    
    // 删除自定义应用数据目录设置
    delete settings.customAppDataDirectory;
    await fs.writeJson(SETTINGS_FILE, settings, { spaces: 2 });
    
    const defaultPath = getDefaultAppDataDirectory();
    return {
      success: true,
      path: defaultPath
    };
  } catch (error) {
    console.error('重置应用数据目录失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 在终端中打开目录
ipcMain.handle('open-directory-in-terminal', async (event, directoryPath) => {
  try {
    const { spawn } = require('child_process');
    
    // 检查目录是否存在
    if (!await fs.pathExists(directoryPath)) {
      return {
        success: false,
        error: '目录不存在: ' + directoryPath
      };
    }
    
    // 根据操作系统选择合适的终端命令
    let command, args;
    
    if (process.platform === 'win32') {
      // Windows: 使用cmd启动新窗口并切换到指定目录
      command = 'cmd';
      args = ['/c', 'start', 'cmd', '/k', `cd /d "${directoryPath}"`];
    } else if (process.platform === 'darwin') {
      // macOS: 使用 Terminal.app
      command = 'open';
      args = ['-a', 'Terminal', directoryPath];
    } else {
      // Linux: 尝试使用常见的终端
      const terminals = ['gnome-terminal', 'konsole', 'xterm', 'x-terminal-emulator'];
      command = terminals[0]; // 默认使用 gnome-terminal
      args = ['--working-directory', directoryPath];
    }
    
    // 启动终端
    console.log('尝试启动终端:', command, args, 'cwd:', directoryPath);
    const child = spawn(command, args, {
      cwd: directoryPath,
      detached: true,
      stdio: 'ignore'
    });
    
    child.on('error', (error) => {
      console.error('启动终端时发生错误:', error);
    });
    
    child.unref();
    
    console.log('终端启动命令已执行');
    return {
      success: true
    };
  } catch (error) {
    console.error('在终端中打开目录失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 保存设置
ipcMain.handle('save-settings', async (event, newSettings) => {
  try {
    let settings = {};
    if (await fs.pathExists(SETTINGS_FILE)) {
      settings = await fs.readJson(SETTINGS_FILE);
    }
    
    // 获取当前使用的应用数据目录
    const currentAppDataDirectory = getActualAppDataDirectory();
    let appDataDirectoryChanged = false;
    let workingDirectoryChanged = false;
    let newWorkingDirectory = null;
    
    // 应用数据目录更改逻辑（不进行数据迁移）
    if (newSettings.appDataDirectory && newSettings.appDataDirectory !== currentAppDataDirectory) {
      appDataDirectoryChanged = true;
      console.log('检测到应用数据目录更改');
      
      // 确保新应用数据目录存在
      await fs.ensureDir(newSettings.appDataDirectory);
      
      // 创建ppt和data子目录
      const newPptDirectory = path.join(newSettings.appDataDirectory, 'ppt');
      const newDataDirectory = path.join(newSettings.appDataDirectory, 'data');
      await fs.ensureDir(newPptDirectory);
      await fs.ensureDir(newDataDirectory);
      
      // 设置新的工作目录为ppt子目录
      newWorkingDirectory = newPptDirectory;
      workingDirectoryChanged = true;
    }
    
    // 更新设置
    if (newSettings.appDataDirectory) {
      settings.customAppDataDirectory = newSettings.appDataDirectory;
    }
    
    // 保存设置文件
    await fs.writeJson(SETTINGS_FILE, settings, { spaces: 2 });
    
    return {
      success: true,
      appDataDirectoryChanged,
      workingDirectoryChanged,
      newWorkingDirectory
    };
  } catch (error) {
    console.error('保存设置失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 获取默认应用数据目录
function getDefaultAppDataDirectory() {
  return app.getPath('userData');
}

// 获取实际使用的应用数据目录（用于内部使用）
function getActualAppDataDirectory() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const settings = fs.readJsonSync(SETTINGS_FILE);
      return settings.customAppDataDirectory || getDefaultAppDataDirectory();
    }
  } catch (error) {
    console.log('读取应用数据目录设置失败，使用默认路径');
  }
  return getDefaultAppDataDirectory();
}

// 获取实际使用的数据目录（data子目录）
function getActualDataDirectory() {
  const appDataDir = getActualAppDataDirectory();
  return path.join(appDataDir, 'data');
}

// 获取实际使用的缓存路径（用于内部使用）
function getActualCachePath() {
  const dataDir = getActualDataDirectory();
  return path.join(dataDir, 'cache');
}

// 获取实际使用的标签文件路径（用于内部使用）
function getActualTagsPath() {
  const dataDir = getActualDataDirectory();
  return path.join(dataDir, 'ppt-tags.json');
}

// 获取GitHub Token文件路径
function getGithubTokenPath() {
  const dataDir = getActualDataDirectory();
  return path.join(dataDir, 'github-token.json');
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