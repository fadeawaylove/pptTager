const { ipcRenderer } = require('electron');
const path = require('path');

// 全局变量
let currentFolder = null;
let allFiles = [];
let filteredFiles = [];
let tagsData = {};
let currentEditingFile = null;
let selectedTags = new Set();
let currentPreviewIndex = 0;
let previewFiles = [];
let currentViewMode = localStorage.getItem('viewMode') || 'grid'; // 'grid' 或 'list'
let currentSuggestionIndex = -1;
let availableTags = [];
// 预览预加载缓存
let previewCache = new Map();
let currentPreviewTimer = null; // 当前预览检查定时器

// 预览生成并发控制
let activePreviewTasks = new Map(); // 正在进行的预览任务
let previewTaskQueue = []; // 预览任务队列
let maxConcurrentPreviews = 3; // 最大并发预览数量（优化：降低并发数以减少卡顿）
let isProcessingQueue = false; // 是否正在处理队列
let currentMainPreviewPath = null; // 当前主预览文件路径
let previewAbortControllers = new Map(); // 预览任务的中止控制器
let currentPreviewPath = null; // 当前预览的PDF路径，用于切换预览模式

// 文件监控相关变量
let isFileWatchingEnabled = false;
let backgroundTaskStatus = {
  queueLength: 0,
  activeTasks: 0,
  maxConcurrent: 2,
  isSystemBusy: false,
  watchedFolder: null
};
let statusUpdateInterval = null;

// DOM元素
// selectFolderBtn已移除，选择文件夹功能已移至设置中
// currentFolderEl已移除，当前文件夹展示已移至设置中
const filesListEl = document.getElementById('filesList');
const loadingEl = document.getElementById('loadingMessage');
const emptyEl = document.getElementById('emptyMessage');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearch');
const tagFilterInput = document.getElementById('tagFilterInput');
const clearTagFilterBtn = document.getElementById('clearTagFilter');
const totalFilesEl = document.getElementById('totalFiles');
const taggedFilesEl = document.getElementById('taggedFiles');
const filteredFilesEl = document.getElementById('filteredFiles');
const allTagsEl = document.getElementById('allTags');
const gridViewBtn = document.getElementById('gridViewBtn');
const listViewBtn = document.getElementById('listViewBtn');

// 帮助相关元素
const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const closeHelpBtn = document.getElementById('closeHelp');

// 更新检查相关元素
const updateBtn = document.getElementById('updateBtn');
const updateModal = document.getElementById('updateModal');
const closeUpdateBtn = document.getElementById('closeUpdate');

// 更新提示弹窗相关元素
const updateNotificationModal = document.getElementById('updateNotificationModal');
const closeUpdateNotificationBtn = document.getElementById('closeUpdateNotification');
const currentVersionNotificationEl = document.getElementById('currentVersionNotification');
const latestVersionNotificationEl = document.getElementById('latestVersionNotification');
const releaseNotesNotificationEl = document.getElementById('releaseNotesNotification');
const publishTimeNotificationEl = document.getElementById('publishTimeNotification');
const downloadUpdateNotificationBtn = document.getElementById('downloadUpdateNotification');
const laterUpdateNotificationBtn = document.getElementById('laterUpdateNotification');
const skipUpdateNotificationBtn = document.getElementById('skipUpdateNotification');
const updateDetailsNotificationEl = document.getElementById('updateDetailsNotification');
const downloadProgressNotificationEl = document.getElementById('downloadProgressNotification');
const progressFillNotificationEl = document.getElementById('progressFillNotification');
const progressTextNotificationEl = document.getElementById('progressTextNotification');
const cancelDownloadNotificationBtn = document.getElementById('cancelDownloadNotification');
const toggleUpdateDetailsBtn = document.getElementById('toggleUpdateDetails');
const updateDetailsContentEl = document.getElementById('updateDetailsContent');
const detailsArrowEl = document.getElementById('detailsArrow');

// 设置相关元素
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettings');
const appDataDirectoryInput = document.getElementById('appDataDirectoryInput');
const selectAppDataDirectoryBtn = document.getElementById('selectAppDataDirectory');
const resetAppDataDirectoryBtn = document.getElementById('resetAppDataDirectory');
// const openAppDataDirectoryInTerminalBtn = document.getElementById('openAppDataDirectoryInTerminal');
const refreshFilesBtn = document.getElementById('refreshFiles');
// 文件统计相关元素已移除
const saveSettingsBtn = document.getElementById('saveSettings');
const cancelSettingsBtn = document.getElementById('cancelSettings');

// 模态框元素
const tagModal = document.getElementById('tagModal');
const closeModalBtn = document.getElementById('closeModal');
const modalFileName = document.getElementById('modalFileName');
const tagInput = document.getElementById('tagInput');
const addTagBtn = document.getElementById('addTag');
const currentTagsEl = document.getElementById('currentTags');
const saveTagsBtn = document.getElementById('saveTagsBtn');
const cancelBtn = document.getElementById('cancelBtn');
const tagSuggestions = document.getElementById('tagSuggestions');

// 预览模态框元素
const previewModal = document.getElementById('previewModal');
const closePreviewBtn = document.getElementById('closePreview');
const previewImage = document.getElementById('previewImage');
const previewPDF = document.getElementById('previewPDF');
const previewFileName = document.getElementById('previewFileName');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const previewCounter = document.getElementById('previewCounter');
const previewLoading = document.getElementById('previewLoading');
const editPreviewTagsBtn = document.getElementById('editPreviewTags');
const openPreviewFileBtn = document.getElementById('openPreviewFile');
const previewTagsEl = document.getElementById('previewTags');

// 嵌入式PDF查看器元素
const embeddedPDFViewer = document.getElementById('embeddedPDFViewer');
const pdfPagesContainer = document.getElementById('pdfPagesContainer');
const pdfPages = document.getElementById('pdfPages');
const pdfPageInfo = document.getElementById('pdfPageInfo');
const pdfZoomSelect = document.getElementById('pdfZoomSelect');
const pdfZoomOut = document.getElementById('pdfZoomOut');
const pdfZoomIn = document.getElementById('pdfZoomIn');

// PDF.js相关变量
let currentPDFDoc = null;
let currentPDFScale = 1;
let currentPDFPage = 1;
let totalPDFPages = 0;
let isFitToWidth = true; // 默认使用适应宽度模式

// 初始化PDF.js
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// 动态调整字体大小
function adjustFontSize() {
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    
    // 基于屏幕宽度计算缩放因子
    // 1920px作为基准分辨率，字体大小为16px
    let scaleFactor = screenWidth / 1920;
    
    // 限制缩放范围，避免字体过大或过小
    scaleFactor = Math.max(0.8, Math.min(1.5, scaleFactor));
    
    // 计算基础字体大小
    const baseFontSize = Math.round(16 * scaleFactor);
    
    // 应用到CSS变量
    document.documentElement.style.setProperty('--base-font-size', baseFontSize + 'px');
    document.documentElement.style.setProperty('--scale-factor', scaleFactor);
    
    console.log(`屏幕分辨率: ${screenWidth}x${screenHeight}`);
    console.log(`字体缩放因子: ${scaleFactor.toFixed(2)}`);
    console.log(`基础字体大小: ${baseFontSize}px`);
}

// 初始化
adjustFontSize(); // 先调整字体大小
init();

async function init() {
    // 显示启动画面，隐藏主界面
    const splashScreen = document.getElementById('splashScreen');
    const container = document.querySelector('.app-container');
    
    // 记录启动时间
    const startTime = Date.now();
    
    try {
        // 1. 获取PPT文件夹路径并设置为当前扫描目录
        const pptDirectory = await ipcRenderer.invoke('get-ppt-directory');
        if (pptDirectory) {
            currentFolder = pptDirectory;
            
            // 2. 加载已保存的标签数据，使用PPT目录作为基础路径
            tagsData = await ipcRenderer.invoke('load-tags', currentFolder) || {};
            
            // 3. 绑定事件
            bindEvents();
            
            // 4. 扫描PPT文件夹中的文件
            await scanFilesQuietly();
        } else {
            // 如果无法获取PPT目录，仍然绑定事件
            bindEvents();
            
            // 显示错误状态
            showEmptyState('无法获取PPT文件夹路径，请检查应用数据目录设置');
        }
        
        // 5. 更新统计信息和标签面板
        updateStats();
        updateTagsPanel();
        
        // 6. 初始化主页更新按钮的版本号显示
        await initMainPageVersionDisplay();
        
        // 7. 首次打开应用时在后台自动检查更新（静默检查）
        // 延迟执行，确保不影响启动性能，并确保网络连接稳定后再检查
        setTimeout(() => {
            console.log('开始静默检查更新...');
            checkForUpdatesQuietly();
        }, 3000);
        
        // 计算总耗时
        const totalTime = Date.now() - startTime;
        
        // 确保启动画面显示足够时间，让用户看到内容加载完成
        // 如果有文件夹和文件，等待内容渲染完成后再结束启动画面
        let minDisplayTime = 800; // 基础显示时间
        if (currentFolder && allFiles.length > 0) {
            // 有内容时，确保用户能看到搜索结果展示
            minDisplayTime = Math.max(1200, totalTime + 500);
        }
        
        if (totalTime < minDisplayTime) {
            const waitTime = minDisplayTime - totalTime;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
    } catch (error) {
        console.error('初始化过程中出错:', error);
        // 即使出错也要确保最小显示时间
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime < 1000) {
            await new Promise(resolve => setTimeout(resolve, 1000 - elapsedTime));
        }
    } finally {
        // 同时切换：隐藏启动画面，显示主界面
        splashScreen.classList.add('fade-out');
        container.classList.add('show');
        
        // 等待过渡动画完成后检查空状态和清理
        setTimeout(() => {
            // 检查是否需要显示空状态
            if (!currentFolder || allFiles.length === 0) {
                if (!currentFolder) {
                    showEmptyState('请选择一个包含PPT文件的文件夹');
                } else {
                    showEmptyState('该文件夹中没有找到PPT文件');
                }
            }
            
            // 完全隐藏启动画面
            splashScreen.style.display = 'none';
        }, 300);
    }
}

function bindEvents() {
    // 选择文件夹功能已移至设置中
    
    // 搜索
    searchInput.addEventListener('input', handleSearch);
    clearSearchBtn.addEventListener('click', clearSearch);
    
    // 标签过滤
    tagFilterInput.addEventListener('input', handleTagFilter);
    clearTagFilterBtn.addEventListener('click', clearTagFilter);
    
    // 模态框事件
    closeModalBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    saveTagsBtn.addEventListener('click', saveTags);
    addTagBtn.addEventListener('click', addTag);
    tagInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (currentSuggestionIndex >= 0) {
                selectSuggestion(currentSuggestionIndex);
            } else {
                addTag();
            }
        }
    });
    
    tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            navigateSuggestions(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            navigateSuggestions(-1);
        } else if (e.key === 'Escape') {
            hideSuggestions();
        }
    });
    
    tagInput.addEventListener('input', handleTagInput);
    tagInput.addEventListener('focus', handleTagInput);
    tagInput.addEventListener('blur', (e) => {
        // 延迟隐藏建议，以便点击建议项时能正常工作
        setTimeout(() => {
            if (!tagSuggestions.contains(document.activeElement)) {
                hideSuggestions();
            }
        }, 150);
    });
    
    // 点击模态框外部关闭
    tagModal.addEventListener('click', (e) => {
        if (e.target === tagModal) {
            closeModal();
        }
    });
    
    // 预览模态框事件
    closePreviewBtn.addEventListener('click', closePreviewModal);
prevBtn.addEventListener('click', showPrevPreview);
nextBtn.addEventListener('click', showNextPreview);
editPreviewTagsBtn.addEventListener('click', editPreviewTags);
openPreviewFileBtn.addEventListener('click', openPreviewFile);
document.getElementById('retryPreviewBtn').addEventListener('click', retryPreview);

// 嵌入式PDF查看器事件
if (pdfZoomOut) {
    pdfZoomOut.addEventListener('click', () => {
        if (currentPDFScale > 0.5) {
            isFitToWidth = false;
            currentPDFScale -= 0.25;
            renderAllPDFPages();
            updatePDFZoomSelect();
        }
    });
}

if (pdfZoomIn) {
    pdfZoomIn.addEventListener('click', () => {
        if (currentPDFScale < 3) {
            isFitToWidth = false;
            currentPDFScale += 0.25;
            renderAllPDFPages();
            updatePDFZoomSelect();
        }
    });
}

if (pdfZoomSelect) {
    pdfZoomSelect.addEventListener('change', (e) => {
        const value = e.target.value;
        if (value === 'fit') {
            isFitToWidth = true;
            fitPDFToWidth();
        } else {
            isFitToWidth = false;
            currentPDFScale = parseFloat(value);
            renderAllPDFPages();
        }
    });
}

// PDF页面容器拖拽滚动事件
if (pdfPagesContainer) {
    let isDragging = false;
    let startY = 0;
    let scrollTop = 0;
    
    pdfPagesContainer.addEventListener('mousedown', (e) => {
        isDragging = true;
        startY = e.pageY - pdfPagesContainer.offsetTop;
        scrollTop = pdfPagesContainer.scrollTop;
        pdfPagesContainer.style.cursor = 'grabbing';
        e.preventDefault();
    });
    
    pdfPagesContainer.addEventListener('mouseleave', () => {
        isDragging = false;
        pdfPagesContainer.style.cursor = 'grab';
    });
    
    pdfPagesContainer.addEventListener('mouseup', () => {
        isDragging = false;
        pdfPagesContainer.style.cursor = 'grab';
    });
    
    pdfPagesContainer.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const y = e.pageY - pdfPagesContainer.offsetTop;
        const walk = (y - startY) * 2; // 调整拖拽敏感度
        pdfPagesContainer.scrollTop = scrollTop - walk;
    });
}
    
    // 点击预览模态框外部关闭
    previewModal.addEventListener('click', (e) => {
        if (e.target === previewModal) {
            closePreviewModal();
        }
    });
    
    // 预览模态框鼠标滚轮事件已移除，不再支持滚轮切换预览
    
    // 帮助按钮事件
    helpBtn.addEventListener('click', showHelpModal);
    closeHelpBtn.addEventListener('click', closeHelpModal);
    
    // 点击帮助模态框外部关闭
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) {
            closeHelpModal();
        }
    });
    
    // 处理帮助页面中的外部链接点击
    helpModal.addEventListener('click', async (e) => {
        if (e.target.classList.contains('external-link')) {
            e.preventDefault();
            const url = e.target.getAttribute('data-url') || e.target.href;
            if (url) {
                try {
                    const result = await ipcRenderer.invoke('open-external-link', url);
                    if (!result.success) {
                        showToast('打开链接失败: ' + (result.error || '未知错误'), 'error');
                    }
                } catch (error) {
                    console.error('打开外部链接失败:', error);
                    showToast('打开链接失败: ' + error.message, 'error');
                }
            }
        }
    });
    
    // 更新检查按钮事件
    if (updateBtn) {
        updateBtn.addEventListener('click', showUpdateModal);
    }
    if (closeUpdateBtn) {
        closeUpdateBtn.addEventListener('click', closeUpdateModal);
    }
    
    // 点击更新检查模态框外部关闭
    if (updateModal) {
        updateModal.addEventListener('click', (e) => {
            if (e.target === updateModal) {
                closeUpdateModal();
            }
        });
    }
    
    // 绑定首页"打开目录"按钮事件
    const openAppDataDirectoryMainBtn = document.getElementById('openAppDataDirectoryMain');
    if (openAppDataDirectoryMainBtn) {
        openAppDataDirectoryMainBtn.addEventListener('click', openAppDataDirectory);
    }
    
    // 更新提示弹窗事件监听器
    if (closeUpdateNotificationBtn) {
        closeUpdateNotificationBtn.addEventListener('click', closeUpdateNotificationModal);
    }
    
    if (downloadUpdateNotificationBtn) {
        downloadUpdateNotificationBtn.addEventListener('click', handleDownloadUpdateNotification);
    }
    
    if (laterUpdateNotificationBtn) {
        laterUpdateNotificationBtn.addEventListener('click', closeUpdateNotificationModal);
    }
    
    if (skipUpdateNotificationBtn) {
        skipUpdateNotificationBtn.addEventListener('click', handleSkipUpdateNotification);
    }
    
    if (cancelDownloadNotificationBtn) {
        cancelDownloadNotificationBtn.addEventListener('click', handleCancelDownload);
    }
    
    if (toggleUpdateDetailsBtn) {
        toggleUpdateDetailsBtn.addEventListener('click', toggleUpdateDetails);
    }
    
    // 点击更新提示弹窗外部关闭
    if (updateNotificationModal) {
        updateNotificationModal.addEventListener('click', (e) => {
            if (e.target === updateNotificationModal) {
                closeUpdateNotificationModal();
            }
        });
    }
    
    // 设置按钮事件
    if (settingsBtn) {
        settingsBtn.addEventListener('click', showSettingsModal);
    }
    closeSettingsBtn.addEventListener('click', closeSettingsModal);
    selectAppDataDirectoryBtn.addEventListener('click', selectAppDataDirectory);
    resetAppDataDirectoryBtn.addEventListener('click', resetAppDataDirectory);
    
    // 打开应用数据目录按钮事件
    const openAppDataDirectoryBtn = document.getElementById('openAppDataDirectory');
    if (openAppDataDirectoryBtn) {
        openAppDataDirectoryBtn.addEventListener('click', openAppDataDirectory);
    }
    
    if (refreshFilesBtn) {
    refreshFilesBtn.addEventListener('click', refreshFilesFromMainPage);
}
    saveSettingsBtn.addEventListener('click', saveSettings);
    cancelSettingsBtn.addEventListener('click', closeSettingsModal);
    
    // 点击设置模态框外部关闭
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            closeSettingsModal();
        }
    });
    
    // 视图切换按钮事件
    gridViewBtn.addEventListener('click', () => switchView('grid'));
    listViewBtn.addEventListener('click', () => switchView('list'));
    
    // 绑定“终端打开”按钮事件
    const openInTerminalBtn = document.getElementById('openInTerminalBtn');
    if (openInTerminalBtn) {
        openInTerminalBtn.addEventListener('click', async () => {
            try {
                const settings = await ipcRenderer.invoke('get-current-settings');
                const directoryPath = settings.appDataDirectory;
                if (!directoryPath) {
                    showToast('请先在设置中选择应用数据目录', 'warning');
                    return;
                }
                const result = await ipcRenderer.invoke('open-directory-in-terminal', directoryPath);
                if (!result.success) {
                    showToast('打开终端失败: ' + (result.error || '未知错误'), 'error');
                }
            } catch (error) {
                console.error('打开终端异常:', error);
                showToast('打开终端异常: ' + error.message, 'error');
            }
        });
    }
    
    // 初始化视图状态
    gridViewBtn.classList.toggle('active', currentViewMode === 'grid');
    listViewBtn.classList.toggle('active', currentViewMode === 'list');
    
    // 键盘导航
    document.addEventListener('keydown', (e) => {
        if (previewModal && !previewModal.classList.contains('hidden')) {
            if (e.key === 'ArrowLeft') {
                showPrevPreview();
            } else if (e.key === 'ArrowRight') {
                showNextPreview();
            } else if (e.key === 'Escape') {
                closePreviewModal();
            }
        } else if (helpModal && !helpModal.classList.contains('hidden')) {
            if (e.key === 'Escape') {
                closeHelpModal();
            }
        } else if (updateModal && !updateModal.classList.contains('hidden')) {
            if (e.key === 'Escape') {
                closeUpdateModal();
            }
        } else if (settingsModal && !settingsModal.classList.contains('hidden')) {
            if (e.key === 'Escape') {
                closeSettingsModal();
            }
        } else if (tagModal && !tagModal.classList.contains('hidden')) {
            if (e.key === 'Escape') {
                closeModal();
            }
        }
    });
}

async function selectFolder() {
    const folderPath = await ipcRenderer.invoke('select-folder');
    if (folderPath) {
        currentFolder = folderPath;
        // currentFolderEl已移除，当前文件夹展示已移至设置中
        
        // 重新加载标签数据，使用新的基础路径
        tagsData = await ipcRenderer.invoke('load-tags', currentFolder) || {};
        
        await scanFiles();
        
        // 如果文件监控已启用，启动监控
        if (isFileWatchingEnabled && fileWatchToggle && fileWatchToggle.checked) {
            await startFileWatching();
        }
    }
}

async function scanFiles() {
    showLoading();
    
    try {
        const files = await ipcRenderer.invoke('scan-ppt-files', currentFolder);
        allFiles = files;
        filteredFiles = [...allFiles];
        
        // 文件列表更新时清理预览缓存
        clearPreviewCache();
        
        if (allFiles.length === 0) {
            showEmptyState('该文件夹中没有找到PPT文件');
        } else {
            renderFiles();
        }
        
        updateStats();
        updateTagsPanel();
    } catch (error) {
        console.error('扫描文件时出错:', error);
        showEmptyState('扫描文件时出错');
    }
}

// 静默扫描文件，不显示加载状态（用于初始化）
async function scanFilesQuietly() {
    if (!currentFolder) {
        return;
    }
    
    try {
        allFiles = await ipcRenderer.invoke('scan-ppt-files', currentFolder);
        filteredFiles = [...allFiles];
        
        // 文件列表更新时清理预览缓存
        clearPreviewCache();
        
        if (allFiles.length > 0) {
            // 静默渲染文件列表
            renderFilesQuietly();
        }
        
        updateStats();
        updateTagsPanel();
        
    } catch (error) {
        console.error('扫描文件时出错:', error);
    }
}

function renderFiles() {
    hideLoading();
    hideEmptyState();
    
    // 设置容器类名
    filesListEl.className = currentViewMode === 'grid' ? 'files-grid' : 'files-list';
    filesListEl.innerHTML = '';
    
    filteredFiles.forEach(file => {
        const fileCard = currentViewMode === 'grid' ? createFileCard(file) : createListFileCard(file);
        filesListEl.appendChild(fileCard);
    });
}

// 静默渲染文件列表，不改变加载状态（用于初始化）
function renderFilesQuietly() {
    if (filteredFiles.length === 0) {
        filesListEl.innerHTML = '';
        return;
    }
    
    // 设置容器类名
    filesListEl.className = currentViewMode === 'grid' ? 'files-grid' : 'files-list';
    filesListEl.innerHTML = '';
    
    filteredFiles.forEach(file => {
        const fileCard = currentViewMode === 'grid' ? createFileCard(file) : createListFileCard(file);
        filesListEl.appendChild(fileCard);
    });
}

function createFileCard(file) {
    const card = document.createElement('div');
    card.className = 'file-card';
    
    const fileTags = tagsData[file.path] || [];
    const fileSize = formatFileSize(file.size);
    const modifiedDate = new Date(file.modified).toLocaleDateString('zh-CN');
    
    card.innerHTML = `
        <div class="file-name" title="${file.relativePath} \n大小: ${fileSize} | 修改时间: ${modifiedDate}">${file.relativePath}</div>
         <div class="file-info"></div>
        <div class="file-tags">
            ${fileTags.map(tag => `<span class="file-tag">${tag}</span>`).join('')}
        </div>
        <div class="file-actions">
            <button class="btn btn-small btn-preview" onclick="previewFile('${file.path.replace(/\\/g, '\\\\')}')">预览</button>
            <button class="btn btn-small btn-edit" onclick="editTags('${file.path.replace(/\\/g, '\\\\')}')">标签</button>
            <button class="btn btn-small btn-move" onclick="moveFile('${file.path.replace(/\\/g, '\\\\')}')">移动</button>
            <button class="btn btn-small btn-open" onclick="openFile('${file.path.replace(/\\/g, '\\\\')}')">打开</button>
        </div>
    `;
    
    // 为文件标签添加点击事件
    const fileTagsContainer = card.querySelector('.file-tags');
    if (fileTagsContainer) {
        fileTagsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('file-tag')) {
                e.stopPropagation(); // 阻止事件冒泡
                const tagText = e.target.textContent;
                toggleTagFilter(tagText);
            }
        });
    }
    
    // 添加卡片点击事件预览
    card.addEventListener('click', (e) => {
        // 如果点击的是按钮或标签，不触发预览
        if (!e.target.closest('.file-actions') && !e.target.classList.contains('file-tag')) {
            previewFile(file.path);
        }
    });
    
    return card;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function editTags(filePath) {
    currentEditingFile = filePath;
    const file = allFiles.find(f => f.path === filePath);
    if (file) {
        modalFileName.textContent = file.name;
        renderCurrentTags();
        tagInput.value = '';
        showModal();
    }
}

function renderCurrentTags() {
    const tags = tagsData[currentEditingFile] || [];
    currentTagsEl.innerHTML = '';
    
    tags.forEach(tag => {
        const tagEl = document.createElement('div');
        tagEl.className = 'current-tag';
        tagEl.innerHTML = `
            <span>${tag}</span>
            <button class="remove-tag" onclick="removeTag('${tag}')">&times;</button>
        `;
        currentTagsEl.appendChild(tagEl);
    });
}

function addTag() {
    const tagValue = tagInput.value.trim();
    if (tagValue && currentEditingFile) {
        if (!tagsData[currentEditingFile]) {
            tagsData[currentEditingFile] = [];
        }
        
        if (!tagsData[currentEditingFile].includes(tagValue)) {
            tagsData[currentEditingFile].push(tagValue);
            renderCurrentTags();
            tagInput.value = '';
        }
    }
}

function removeTag(tag) {
    if (currentEditingFile && tagsData[currentEditingFile]) {
        const index = tagsData[currentEditingFile].indexOf(tag);
        if (index > -1) {
            tagsData[currentEditingFile].splice(index, 1);
            renderCurrentTags();
        }
    }
}

// 自动完成功能
function updateAvailableTags() {
    const allTagsSet = new Set();
    Object.values(tagsData).forEach(tags => {
        tags.forEach(tag => allTagsSet.add(tag));
    });
    availableTags = Array.from(allTagsSet).sort();
}

function handleTagInput() {
    const inputValue = tagInput.value.trim();
    if (!inputValue) {
        hideSuggestions();
        return;
    }
    
    updateAvailableTags();
    
    // 过滤出匹配的标签（排除当前文件已有的标签）
    const currentFileTags = tagsData[currentEditingFile] || [];
    const suggestions = availableTags.filter(tag => 
        tag.toLowerCase().includes(inputValue.toLowerCase()) &&
        !currentFileTags.includes(tag) &&
        tag !== inputValue
    );
    
    if (suggestions.length > 0) {
        showSuggestions(suggestions);
    } else {
        hideSuggestions();
    }
}

function showSuggestions(suggestions) {
    tagSuggestions.innerHTML = '';
    currentSuggestionIndex = -1;
    
    suggestions.forEach((tag, index) => {
        const item = document.createElement('div');
        item.className = 'tag-suggestion-item';
        item.textContent = tag;
        item.addEventListener('click', () => selectSuggestion(index));
        tagSuggestions.appendChild(item);
    });
    
    tagSuggestions.classList.remove('hidden');
}

function hideSuggestions() {
    tagSuggestions.classList.add('hidden');
    currentSuggestionIndex = -1;
}

function navigateSuggestions(direction) {
    const items = tagSuggestions.querySelectorAll('.tag-suggestion-item');
    if (items.length === 0) return;
    
    // 清除之前的高亮
    items.forEach(item => item.classList.remove('highlighted'));
    
    // 计算新的索引
    currentSuggestionIndex += direction;
    if (currentSuggestionIndex < 0) {
        currentSuggestionIndex = items.length - 1;
    } else if (currentSuggestionIndex >= items.length) {
        currentSuggestionIndex = 0;
    }
    
    // 高亮当前项
    items[currentSuggestionIndex].classList.add('highlighted');
    
    // 滚动到可见区域
    items[currentSuggestionIndex].scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
    });
}

function selectSuggestion(index) {
    const items = tagSuggestions.querySelectorAll('.tag-suggestion-item');
    if (index >= 0 && index < items.length) {
        const selectedTag = items[index].textContent;
        tagInput.value = selectedTag;
        addTag();
        hideSuggestions();
    }
}

async function saveTags() {
    const success = await ipcRenderer.invoke('save-tags', tagsData, currentFolder);
    if (success) {
        closeModal();
        renderFiles();
        updateStats();
        updateTagsPanel();
        
        // 如果预览模态框是打开的，更新预览页面的标签显示
        if (!previewModal.classList.contains('hidden') && previewFiles.length > 0) {
            const currentFile = previewFiles[currentPreviewIndex];
            updatePreviewTags(currentFile);
        }
    } else {
        alert('保存标签失败');
    }
}

async function openFile(filePath) {
    const success = await ipcRenderer.invoke('open-file', filePath);
    if (!success) {
        alert('打开文件失败');
    }
}

// 移动文件功能
async function moveFile(filePath) {
    try {
        const file = allFiles.find(f => f.path === filePath);
        if (!file) {
            alert('文件信息不存在');
            return;
        }
        
        // 选择目标文件夹
        const folderResult = await ipcRenderer.invoke('select-target-folder');
        if (!folderResult.success) {
            if (folderResult.error !== '用户取消选择') {
                alert('选择目标文件夹失败: ' + folderResult.error);
            }
            return;
        }
        
        const targetFolder = folderResult.folderPath;
        const fileName = path.basename(filePath);
        const targetPath = path.join(targetFolder, fileName);
        
        // 确认移动操作
        const confirmMessage = `确定要将文件移动到以下位置吗？\n\n源文件：${filePath}\n目标位置：${targetPath}`;
        if (!confirm(confirmMessage)) {
            return;
        }
        
        // 显示加载状态
        showLoading('正在移动文件...');
        
        // 执行文件移动，传递当前工作文件夹用于相对路径转换
        const moveResult = await ipcRenderer.invoke('move-file', filePath, targetPath, currentFolder);
        
        hideLoading();
        
        if (moveResult.success) {
            // 移动成功，更新文件列表
            const fileIndex = allFiles.findIndex(f => f.path === filePath);
            if (fileIndex !== -1) {
                // 更新文件路径和相对路径
                allFiles[fileIndex].path = moveResult.newPath;
                allFiles[fileIndex].relativePath = path.relative(currentFolder, moveResult.newPath);
                
                // 更新标签数据中的路径
                if (tagsData[filePath]) {
                    tagsData[moveResult.newPath] = tagsData[filePath];
                    delete tagsData[filePath];
                }
                
                // 重新渲染文件列表
                renderFiles();
                updateStats();
                
                showToast(`文件已成功移动到：${targetFolder}`, 'success');
            }
        } else {
            alert('移动文件失败: ' + moveResult.error);
        }
    } catch (error) {
        hideLoading();
        console.error('移动文件时出错:', error);
        alert('移动文件失败: ' + error.message);
    }
}

function handleSearch() {
    const query = searchInput.value.toLowerCase().trim();
    
    if (!query) {
        filteredFiles = [...allFiles];
    } else {
        filteredFiles = allFiles.filter(file => {
            // 搜索文件名
            const nameMatch = file.name.toLowerCase().includes(query);
            
            // 搜索标签
            const fileTags = tagsData[file.path] || [];
            const tagMatch = fileTags.some(tag => tag.toLowerCase().includes(query));
            
            // 搜索选中的标签 - 修改为AND逻辑：文件必须包含所有选中的标签
            const selectedTagMatch = selectedTags.size === 0 || 
                Array.from(selectedTags).every(selectedTag => fileTags.includes(selectedTag));
            
            return (nameMatch || tagMatch) && selectedTagMatch;
        });
    }
    
    // 如果有选中的标签但没有搜索词，只按标签过滤 - 修改为AND逻辑
    if (!query && selectedTags.size > 0) {
        filteredFiles = allFiles.filter(file => {
            const fileTags = tagsData[file.path] || [];
            return Array.from(selectedTags).every(selectedTag => fileTags.includes(selectedTag));
        });
    }
    
    renderFiles();
    updateStats();
}

function clearSearch() {
    searchInput.value = '';
    selectedTags.clear();
    updateTagsPanel();
    handleSearch();
}

function updateStats() {
    totalFilesEl.textContent = allFiles.length;
    const taggedCount = allFiles.filter(file => 
        tagsData[file.path] && tagsData[file.path].length > 0
    ).length;
    taggedFilesEl.textContent = taggedCount;
    filteredFilesEl.textContent = filteredFiles.length;
}

// 标签过滤相关函数
function handleTagFilter(e) {
    const query = e.target.value.trim().toLowerCase();
    clearTagFilterBtn.style.display = query ? 'block' : 'none';
    updateTagsPanel(query);
}

function clearTagFilter() {
    tagFilterInput.value = '';
    clearTagFilterBtn.style.display = 'none';
    updateTagsPanel();
}

function updateTagsPanel(filterQuery = '') {
    const allTagsSet = new Set();
    
    // 收集所有标签
    Object.values(tagsData).forEach(tags => {
        tags.forEach(tag => allTagsSet.add(tag));
    });
    
    // 过滤标签
    let filteredTags = Array.from(allTagsSet).sort();
    if (filterQuery) {
        filteredTags = filteredTags.filter(tag => 
            tag.toLowerCase().includes(filterQuery)
        );
    }
    
    allTagsEl.innerHTML = '';
    
    if (filteredTags.length === 0 && filterQuery) {
        // 显示无匹配结果提示
        const noResults = document.createElement('div');
        noResults.className = 'text-gray-500 text-sm p-2';
        noResults.textContent = '没有找到匹配的标签';
        allTagsEl.appendChild(noResults);
        return;
    }
    
    filteredTags.forEach(tag => {
        const tagEl = document.createElement('div');
        tagEl.className = `tag-item ${selectedTags.has(tag) ? 'active' : ''}`;
        tagEl.textContent = tag;
        tagEl.addEventListener('click', () => toggleTagFilter(tag));
        allTagsEl.appendChild(tagEl);
    });
}

function toggleTagFilter(tag) {
    if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
    } else {
        selectedTags.add(tag);
    }
    
    updateTagsPanel();
    handleSearch();
}

function showModal() {
    tagModal.classList.remove('hidden');
    tagInput.focus();
}

function closeModal() {
    tagModal.classList.add('hidden');
    currentEditingFile = null;
    hideSuggestions();
}

function showLoading() {
    loadingEl.classList.remove('hidden');
    filesListEl.classList.add('hidden');
    emptyEl.classList.add('hidden');
}

function hideLoading() {
    loadingEl.classList.add('hidden');
    filesListEl.classList.remove('hidden');
}

function showEmptyState(message = '请选择一个包含PPT文件的文件夹') {
    emptyEl.querySelector('p').textContent = message;
    emptyEl.classList.remove('hidden');
    filesListEl.classList.add('hidden');
    loadingEl.classList.add('hidden');
}

function hideEmptyState() {
    emptyEl.classList.add('hidden');
}

// 预览相关函数
async function previewFile(filePath) {
    const fileIndex = filteredFiles.findIndex(f => f.path === filePath);
    if (fileIndex !== -1) {
        currentPreviewIndex = fileIndex;
        previewFiles = [...filteredFiles];
        await showPreview();
    }
}

async function showPreview() {
    if (previewFiles.length === 0) return;
    
    const file = previewFiles[currentPreviewIndex];
    
    // 清除之前的定时器
    if (currentPreviewTimer) {
        clearInterval(currentPreviewTimer);
        currentPreviewTimer = null;
    }
    
    // 终止所有非当前预览的任务
    terminateNonCurrentTasks(file.path);
    
    // 设置当前主预览路径
    currentMainPreviewPath = file.path;
    
    previewFileName.textContent = file.relativePath;
    previewFileName.title = file.relativePath; // 显示完整相对路径
    previewCounter.textContent = `${currentPreviewIndex + 1} / ${previewFiles.length}`;
    
    // 显示当前文件的标签
    updatePreviewTags(file);
    
    // 显示加载状态
    previewLoading.classList.remove('hidden');
    previewImage.classList.add('hidden');
    previewPDF.classList.add('hidden');
    
    // 显示模态框
    previewModal.classList.remove('hidden');
    
    // 每次都重新请求预览，让main.js检查文件MD5是否变化
    // 清除可能存在的旧缓存
    if (previewCache.has(file.path)) {
        previewCache.delete(file.path);
    }
    
    // 启动预览生成请求（不等待结果）
    requestPreview(file.path, true).catch(error => {
        console.error('获取预览失败:', error);
    });
    
    // 启动新的检查
    checkPreviewFileGeneration(file.path);
    
    // 预加载功能已禁用
    // preloadAdjacentPreviews();
    
    // 更新导航按钮状态
    updateNavigationButtons();
}

// 检查预览文件生成状态的函数
function checkPreviewFileGeneration(filePath) {
    const startTime = Date.now();
    const timeout = 30000; // 30秒超时
    const checkInterval = 500; // 每500ms检查一次
    
    currentPreviewTimer = setInterval(async () => {
        // 检查是否超时
        if (Date.now() - startTime > timeout) {
            clearInterval(currentPreviewTimer);
            currentPreviewTimer = null;
            // 超时显示失败提示（只有当前仍在预览该文件时才显示）
            if (previewFiles.length > 0 && 
                previewFiles[currentPreviewIndex].path === filePath &&
                currentMainPreviewPath === filePath &&
                !previewModal.classList.contains('hidden')) {
                previewLoading.classList.add('hidden');
                previewImage.src = '';
                previewImage.alt = '预览生成超时，请重试';
                previewImage.classList.remove('hidden');
                previewPDF.classList.add('hidden');
                showRetryButton();
            }
            return;
        }
        
        // 检查缓存中是否有结果
        if (previewCache.has(filePath)) {
            clearInterval(currentPreviewTimer);
            currentPreviewTimer = null;
            const result = previewCache.get(filePath);
            displayPreviewResult(result, filePath);
            return;
        }
        
        // 检查是否还在预览当前文件（更严格的检查）
        if (previewFiles.length === 0 || 
            previewFiles[currentPreviewIndex].path !== filePath ||
            currentMainPreviewPath !== filePath ||
            previewModal.classList.contains('hidden')) {
            clearInterval(currentPreviewTimer);
            currentPreviewTimer = null;
            return;
        }
    }, checkInterval);
}

// 显示预览结果的辅助函数
async function displayPreviewResult(result, filePath) {
    // 只有当前正在预览的文件才能更新显示
    if (previewFiles.length === 0 || 
        previewFiles[currentPreviewIndex].path !== filePath ||
        currentMainPreviewPath !== filePath ||
        previewModal.classList.contains('hidden')) {
        return; // 不是当前预览的文件，忽略结果
    }
    
    // 隐藏加载状态
    previewLoading.classList.add('hidden');
    
    if (result.success && result.pdfPath) {
        // 添加详细日志区分缓存和重新生成
        if (result.cached) {
            console.log('✅ 使用缓存PDF文件:', result.pdfPath);
        } else {
            console.log('🔄 使用新生成的PDF文件:', result.pdfPath);
        }
        console.log('检测到PDF文件，使用内嵌PDF查看器打开');
        // 使用内嵌PDF查看器
        try {
            await showEmbeddedPDFViewer(result.pdfPath);
            console.log('PDF在内嵌查看器中打开成功:', result.pdfPath);
            hideRetryButton();
        } catch (error) {
            console.error('加载PDF预览失败:', error);
            // 降级到错误显示
            previewImage.src = '';
            previewImage.alt = '无法加载PDF预览: ' + error.message;
            previewImage.classList.remove('hidden');
            hideEmbeddedPDFViewer();
            previewPDF.classList.add('hidden');
            showRetryButton();
        }
    } else if (result.svg) {
        // 显示SVG（安装提示或错误信息）
        // 使用encodeURIComponent来安全处理包含Unicode字符的SVG
        const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`;
        previewImage.src = svgDataUrl;
        previewImage.classList.remove('hidden');
        previewPDF.classList.add('hidden');
        showRetryButton();
    } else {
        // 其他错误情况
        previewImage.src = '';
        previewImage.alt = result.error || '无法生成预览';
        previewImage.classList.remove('hidden');
        previewPDF.classList.add('hidden');
        showRetryButton();
    }
}

// 更新导航按钮状态的辅助函数
function updateNavigationButtons() {
    const hasMultipleFiles = previewFiles.length > 1;
    prevBtn.disabled = !hasMultipleFiles;
    nextBtn.disabled = !hasMultipleFiles;
}

// 预加载前后一张PPT预览的函数（已禁用）
// async function preloadAdjacentPreviews() {
//     if (previewFiles.length <= 1) return;
//     
//     const preloadTasks = [];
//     
//     // 计算前一张的索引（循环）
//     const prevIndex = currentPreviewIndex === 0 ? previewFiles.length - 1 : currentPreviewIndex - 1;
//     const prevFile = previewFiles[prevIndex];
//     
//     // 计算后一张的索引（循环）
//     const nextIndex = currentPreviewIndex === previewFiles.length - 1 ? 0 : currentPreviewIndex + 1;
//     const nextFile = previewFiles[nextIndex];
//     
//     // 预加载前一张（如果未缓存）
//     if (!previewCache.has(prevFile.path)) {
//         preloadTasks.push(preloadSinglePreview(prevFile.path));
//     }
//     
//     // 预加载后一张（如果未缓存）
//     if (!previewCache.has(nextFile.path)) {
//         preloadTasks.push(preloadSinglePreview(nextFile.path));
//     }
//     
//     // 并行执行预加载任务
//     if (preloadTasks.length > 0) {
//         Promise.allSettled(preloadTasks).then(results => {
//             const successCount = results.filter(r => r.status === 'fulfilled').length;
//             if (successCount > 0) {
//                 console.log(`成功预加载 ${successCount} 个预览`);
//             }
//         });
//     }
// }

// 预加载单个预览的函数（已禁用）
// async function preloadSinglePreview(filePath) {
//     try {
//         // 使用并发控制的预览请求（预加载，优先级低）
//         const result = await requestPreview(filePath, false);
//         return result;
//     } catch (error) {
//         console.error('预加载预览失败:', filePath, error);
//         throw error;
//     }
// }

function showPrevPreview() {
    if (previewFiles.length <= 1) return;
    
    // 循环切换：如果是第一张，跳到最后一张
    if (currentPreviewIndex === 0) {
        currentPreviewIndex = previewFiles.length - 1;
    } else {
        currentPreviewIndex--;
    }
    showPreview();
}

function showNextPreview() {
    if (previewFiles.length <= 1) return;
    
    // 循环切换：如果是最后一张，跳到第一张
    if (currentPreviewIndex === previewFiles.length - 1) {
        currentPreviewIndex = 0;
    } else {
        currentPreviewIndex++;
    }
    showPreview();
}

function showTimeoutMessage() {
    // 创建超时提示的SVG
    const timeoutSVG = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="timeoutGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#ee5a52;stop-opacity:1" />
            </linearGradient>
        </defs>
        
        <rect width="400" height="300" fill="url(#timeoutGradient)" rx="15"/>
        
        <!-- 时钟图标 -->
        <circle cx="200" cy="80" r="30" fill="white" opacity="0.9"/>
        <text x="200" y="90" text-anchor="middle" font-family="Arial" font-size="24" fill="#ff6b6b">⏰</text>
        
        <!-- 标题 -->
        <text x="200" y="130" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="white">
            预览生成超时
        </text>
        
        <!-- 说明文字 -->
        <text x="200" y="160" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="white" opacity="0.9">
            PPT文件较大或系统繁忙，预览生成时间超过30秒
        </text>
        
        <!-- 建议 -->
        <text x="200" y="190" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="white" opacity="0.8">
            建议：直接打开文件查看内容
        </text>
        
        <!-- 重试按钮提示 -->
        <rect x="150" y="210" width="100" height="30" fill="white" opacity="0.2" rx="15"/>
        <text x="200" y="230" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="white">
            点击下方重新生成按钮重试
        </text>
    </svg>`;
    
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(timeoutSVG)}`;
    previewImage.src = svgDataUrl;
    previewImage.classList.remove('hidden');
    showRetryButton();
}

// 显示重新生成按钮
function showRetryButton() {
    const retryBtn = document.getElementById('retryPreviewBtn');
    if (retryBtn) {
        retryBtn.classList.remove('hidden');
    }
}

// 隐藏重新生成按钮
function hideRetryButton() {
    const retryBtn = document.getElementById('retryPreviewBtn');
    if (retryBtn) {
        retryBtn.classList.add('hidden');
    }
}

// 重新生成预览
async function retryPreview() {
    if (previewFiles.length === 0) return;
    
    const file = previewFiles[currentPreviewIndex];
    
    // 从缓存中移除当前文件的预览
    previewCache.delete(file.path);
    
    // 隐藏重新生成按钮
    hideRetryButton();
    
    // 重新显示预览
    await showPreview();
}

function closePreviewModal() {
    previewModal.classList.add('hidden');
    hideRetryButton();
    
    // 清理webview资源
    setTimeout(() => {
        if (previewModal.classList.contains('hidden')) {
            previewPDF.src = '';
            // webview元素会在src清空时自动清理资源
        }
    }, 100);
    
    previewImage.src = '';
    previewPDF.classList.add('hidden');
    previewImage.classList.add('hidden');
    hideEmbeddedPDFViewer();
    currentPreviewIndex = 0;
    previewFiles = [];
    
    // 清除预览检查定时器
    if (currentPreviewTimer) {
        clearInterval(currentPreviewTimer);
        currentPreviewTimer = null;
    }
    
    // 清除当前主预览路径
    currentMainPreviewPath = null;
    
    // 终止所有预览任务
    terminateAllPreviewTasks();
    
    // 优化：智能缓存清理 - 只保留最近的10个预览缓存
    if (previewCache.size > 10) {
        const entries = Array.from(previewCache.entries());
        const toDelete = entries.slice(0, entries.length - 10);
        toDelete.forEach(([key]) => previewCache.delete(key));
    }
}

// 清理预览缓存的函数
function clearPreviewCache() {
    previewCache.clear();
}

// 终止所有预览任务
function terminateAllPreviewTasks() {
    // 清空任务队列并拒绝所有等待的任务
    previewTaskQueue.forEach(task => {
        task.reject(new Error('预览已关闭'));
    });
    previewTaskQueue = [];
    
    // 终止所有活动任务
    for (const [filePath, promise] of activePreviewTasks.entries()) {
        if (previewAbortControllers.has(filePath)) {
            previewAbortControllers.get(filePath).abort();
            previewAbortControllers.delete(filePath);
        }
    }
    activePreviewTasks.clear();
    
    // 清理所有中止控制器
    previewAbortControllers.clear();
}

// 预览任务队列管理
async function processPreviewQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;
    
    while (previewTaskQueue.length > 0 && activePreviewTasks.size < maxConcurrentPreviews) {
        const task = previewTaskQueue.shift();
        if (task && !activePreviewTasks.has(task.filePath)) {
            executePreviewTask(task);
        }
    }
    
    isProcessingQueue = false;
}

// 执行预览任务
async function executePreviewTask(task) {
    const { filePath, resolve, reject, isMainPreview } = task;
    
    // 如果已经有相同文件的任务在执行，等待其完成
    if (activePreviewTasks.has(filePath)) {
        try {
            const result = await activePreviewTasks.get(filePath);
            resolve(result);
        } catch (error) {
            reject(error);
        }
        return;
    }
    
    // 创建 AbortController 用于任务取消
    const abortController = new AbortController();
    previewAbortControllers.set(filePath, abortController);
    
    // 创建预览任务Promise
    const previewPromise = (async () => {
        try {
            console.log(`📋 开始处理预览请求: ${filePath}`);
            
            // 检查是否已被取消
            if (abortController.signal.aborted) {
                throw new Error('任务已被取消');
            }
            
            // 注意：由于 IPC 调用不支持 AbortSignal，我们只能在调用前后检查取消状态
            const result = await ipcRenderer.invoke('get-ppt-preview', filePath);
            
            // 再次检查是否已被取消（在 IPC 调用完成后）
            if (abortController.signal.aborted) {
                throw new Error('任务已被取消');
            }
            
            // 缓存预览结果
            previewCache.set(filePath, result);
            
            // 添加详细的完成日志
            if (result.success) {
                if (result.cached) {
                    console.log(`✅ 预览处理完成 (使用缓存): ${filePath}`);
                } else {
                    console.log(`🔄 预览处理完成 (重新生成): ${filePath}`);
                }
            } else {
                console.log(`❌ 预览处理失败: ${filePath}`, result.error);
            }
            return result;
        } catch (error) {
            if (abortController.signal.aborted || error.message === '任务已被取消') {
                console.log(`预览任务已取消: ${filePath}`);
                throw new Error('任务已被取消');
            }
            console.error(`预览生成失败: ${filePath}`, error);
            throw error;
        } finally {
            // 任务完成后清理
            activePreviewTasks.delete(filePath);
            previewAbortControllers.delete(filePath);
            // 继续处理队列中的其他任务
            processPreviewQueue();
        }
    })();
    
    // 将任务添加到活动任务中
    activePreviewTasks.set(filePath, previewPromise);
    
    try {
        const result = await previewPromise;
        resolve(result);
    } catch (error) {
        reject(error);
    }
}

// 终止所有非当前预览的任务
function terminateNonCurrentTasks(currentFilePath) {
    // 清理队列中的非当前任务
    const allowedFiles = new Set([currentFilePath]);
    
    // 过滤队列，只保留当前预览的任务
    previewTaskQueue = previewTaskQueue.filter(task => {
        if (allowedFiles.has(task.filePath)) {
            return true;
        }
        // 拒绝非允许的任务
        task.reject(new Error('任务被新预览请求终止'));
        return false;
    });
    
    // 终止活动任务中的非允许任务
    for (const [filePath, promise] of activePreviewTasks.entries()) {
        if (!allowedFiles.has(filePath)) {
            // 如果有中止控制器，使用它来中止任务
            if (previewAbortControllers.has(filePath)) {
                previewAbortControllers.get(filePath).abort();
                previewAbortControllers.delete(filePath);
            }
            activePreviewTasks.delete(filePath);
        }
    }
}



// 请求预览（带并发控制）
function requestPreview(filePath, isMainPreview = false) {
    return new Promise((resolve, reject) => {
        // 检查缓存
        if (previewCache.has(filePath)) {
            resolve(previewCache.get(filePath));
            return;
        }
        
        // 如果是主预览请求，检查是否需要清理非相关任务
        if (isMainPreview && currentMainPreviewPath !== filePath) {
            terminateNonCurrentTasks(filePath);
        }
        
        // 预加载功能已禁用，只允许主预览任务
        if (!isMainPreview) {
            reject(new Error('预加载功能已禁用'));
            return;
        }
        
        // 检查是否已有相同任务在队列中
        const existingTaskIndex = previewTaskQueue.findIndex(task => task.filePath === filePath);
        if (existingTaskIndex !== -1) {
            const existingTask = previewTaskQueue[existingTaskIndex];
            // 将当前请求的resolve和reject添加到现有任务中
            const originalResolve = existingTask.resolve;
            const originalReject = existingTask.reject;
            
            existingTask.resolve = (result) => {
                originalResolve(result);
                resolve(result);
            };
            
            existingTask.reject = (error) => {
                originalReject(error);
                reject(error);
            };
            
            // 如果是主预览请求，提升优先级
            if (isMainPreview) {
                previewTaskQueue.splice(existingTaskIndex, 1);
                previewTaskQueue.unshift(existingTask);
                existingTask.isMainPreview = true;
            }
            return;
        }
        
        // 创建新任务
        const task = {
            filePath,
            resolve,
            reject,
            isMainPreview,
            timestamp: Date.now()
        };
        
        // 主预览请求优先级更高，插入队列前面
        if (isMainPreview) {
            previewTaskQueue.unshift(task);
        } else {
            previewTaskQueue.push(task);
        }
        
        // 开始处理队列
        processPreviewQueue();
    });
}

// 帮助模态框函数
function showHelpModal() {
    helpModal.classList.remove('hidden');
}

function closeHelpModal() {
    helpModal.classList.add('hidden');
}

// 更新检查模态框函数
function showUpdateModal() {
    updateModal.classList.remove('hidden');
    // 初始化版本信息
    initVersionInfo();
}

function closeUpdateModal() {
    updateModal.classList.add('hidden');
}

// 预览页面标签相关函数
function updatePreviewTags(file) {
    const fileTags = tagsData[file.path] || [];
    previewTagsEl.innerHTML = '';
    
    if (fileTags.length === 0) {
        previewTagsEl.innerHTML = '<span class="text-gray-400 text-sm italic">暂无标签</span>';
    } else {
        fileTags.forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = 'bg-blue-500 text-white px-2 py-1 rounded-full text-xs font-medium border border-blue-400 transition-all hover:bg-blue-400 hover:border-blue-300 hover:scale-105 cursor-pointer whitespace-nowrap';
            tagEl.textContent = tag;
            previewTagsEl.appendChild(tagEl);
        });
    }
}

function editPreviewTags() {
    if (previewFiles.length === 0) return;
    
    const currentFile = previewFiles[currentPreviewIndex];
    currentEditingFile = currentFile.path;
    
    // 设置模态框内容
    modalFileName.textContent = currentFile.name;
    
    // 显示当前标签
    const fileTags = tagsData[currentFile.path] || [];
    renderCurrentTags(fileTags);
    
    // 清空输入框
    tagInput.value = '';
    
    // 显示标签编辑模态框
    showModal();
}

function openPreviewFile() {
    if (previewFiles.length === 0) return;
    
    const currentFile = previewFiles[currentPreviewIndex];
    openFile(currentFile.path);
}

// 设置模态框函数已在文件末尾重新定义，此处删除重复定义

function closeSettingsModal() {
    settingsModal.classList.add('hidden');
    // 重新加载当前设置以恢复原始值
    loadCurrentSettings();
}

async function loadCurrentSettings() {
    try {
        const settings = await ipcRenderer.invoke('get-current-settings');
        appDataDirectoryInput.value = settings.appDataDirectory || '';
    } catch (error) {
        console.error('加载当前设置失败:', error);
        appDataDirectoryInput.value = '';
    }
}

async function selectAppDataDirectory() {
    try {
        const path = await ipcRenderer.invoke('select-app-data-directory');
        if (path) {
            appDataDirectoryInput.value = path;
        }
    } catch (error) {
        console.error('选择应用数据目录失败:', error);
        alert('选择应用数据目录失败');
    }
}

async function resetAppDataDirectory() {
    try {
        const result = await ipcRenderer.invoke('reset-app-data-directory');
        if (result.success) {
            appDataDirectoryInput.value = result.path;
            showToast('应用数据目录已重置为默认路径', 'success');
        } else {
            showToast('重置应用数据目录失败: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('重置应用数据目录失败:', error);
        showToast('重置应用数据目录失败', 'error');
    }
}

async function openAppDataDirectory() {
    try {
        const settings = await ipcRenderer.invoke('get-current-settings');
        const directoryPath = settings.appDataDirectory;
        if (!directoryPath) {
            showToast('请先在设置中选择应用数据目录', 'warning');
            return;
        }
        const result = await ipcRenderer.invoke('open-directory-in-explorer', directoryPath);
        if (!result.success) {
            showToast('打开目录失败: ' + (result.error || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('打开应用数据目录失败:', error);
        showToast('打开应用数据目录失败: ' + error.message, 'error');
    }
}

// async function openAppDataDirectoryInTerminal() {
//     try {
//         // 获取应用数据目录设置
//         const settings = await ipcRenderer.invoke('get-current-settings');
//         const directoryPath = settings.appDataDirectory;
//         
//         console.log('应用数据目录路径:', directoryPath);
//         console.log('是否等于H:\\文档\\pptSyncDir:', directoryPath === 'H:\\文档\\pptSyncDir');
//         
//         const result = await ipcRenderer.invoke('open-directory-in-terminal', directoryPath);
//         if (result.success) {
//             showToast('已在终端中打开应用数据目录', 'success');
//         } else {
//             showToast('打开终端失败: ' + result.error, 'error');
//         }
//     } catch (error) {
//         console.error('在终端中打开目录失败:', error);
//         showToast('在终端中打开目录失败: ' + error.message, 'error');
//     }
// }

// 从主页刷新文件列表
async function refreshFilesFromMainPage() {
    try {
        if (currentFolder) {
            showToast('正在刷新文件列表和标签...', 'info', 2000);
            
            // 清除当前的标签筛选状态
            selectedTags.clear();
            
            // 重新加载标签数据
            tagsData = await ipcRenderer.invoke('load-tags', currentFolder) || {};
            
            // 重新扫描文件
            await scanFiles();
            
            // 更新统计信息和标签面板
            updateStats();
            updateTagsPanel();
            
            showToast('文件列表和标签已刷新', 'success');
        } else {
            showToast('请先在设置中选择工作文件夹', 'warning');
        }
    } catch (error) {
        console.error('刷新文件列表失败:', error);
        showToast('刷新文件列表失败', 'error');
    }
}

// updateFolderStats函数已移除，文件统计功能已从设置页面中删除

// 冒泡提示功能
function showToast(message, type = 'success', duration = 2000) {
    // 移除现有的toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // 创建toast元素
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // 根据类型设置图标
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    // 解析消息，支持标题和内容分离
    let title, content;
    if (message.includes('\n\n')) {
        const parts = message.split('\n\n');
        title = parts[0];
        content = parts.slice(1).join('\n\n');
    } else {
        title = message;
        content = '';
    }
    
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.success}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            ${content ? `<div class="toast-message">${content.replace(/\n/g, '<br>')}</div>` : ''}
        </div>
        <button class="toast-close">&times;</button>
    `;
    
    // 添加到页面
    document.body.appendChild(toast);
    
    // 显示动画
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    // 关闭按钮事件
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
        hideToast(toast);
    });
    
    // 自动隐藏
    if (duration > 0) {
        setTimeout(() => {
            hideToast(toast);
        }, duration);
    }
    
    return toast;
}

function hideToast(toast) {
    if (toast && toast.parentNode) {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }
}

async function saveSettings() {
    try {
        const settings = {
            appDataDirectory: appDataDirectoryInput.value.trim() || null
        };
        
        const result = await ipcRenderer.invoke('save-settings', settings);
        if (result.success) {
            let message = '设置保存成功！';
            
            // 如果路径改变时提示重启
            if (result.appDataDirectoryChanged) {
                message += '\n\n注意：路径更改将在下次启动应用时生效';
            }
            
            // 如果应用数据目录改变，更新PPT目录并重新加载数据
            if (result.appDataDirectoryChanged) {
                // 获取新的PPT目录路径
                const newPptDirectory = await ipcRenderer.invoke('get-ppt-directory');
                if (newPptDirectory) {
                    currentFolder = newPptDirectory;
                    
                    // 重新加载标签数据（使用新的PPT目录）
                    tagsData = await ipcRenderer.invoke('load-tags', currentFolder) || {};
                    
                    // 重新扫描文件以更新显示
                    await scanFiles();
                    
                    message += '\n\n数据目录已更新，PPT文件夹已切换，标签数据已重新加载';
                } else {
                    message += '\n\n警告：无法获取新的PPT文件夹路径';
                }
            }
            
            showToast(message, 'success');
            closeSettingsModal();
            // 重新加载当前设置显示
            loadCurrentSettings();
        } else {
            showToast('保存设置失败: ' + (result.error || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('保存设置失败:', error);
        showToast('保存设置失败', 'error');
    }
}

// 视图切换函数
function switchView(viewMode) {
    currentViewMode = viewMode;
    
    // 保存到本地存储
    localStorage.setItem('viewMode', viewMode);
    
    // 更新按钮状态
    gridViewBtn.classList.toggle('active', viewMode === 'grid');
    listViewBtn.classList.toggle('active', viewMode === 'list');
    
    // 重新渲染文件列表
    renderFiles();
}

// 创建列表视图文件卡片
function createListFileCard(file) {
    const card = document.createElement('div');
    card.className = 'file-card';
    
    const fileTags = tagsData[file.path] || [];
    const fileSize = formatFileSize(file.size);
    const modifiedDate = new Date(file.modified).toLocaleDateString('zh-CN');
    
    card.innerHTML = `
        <div class="file-info-section">
            <div class="file-name" title="${file.relativePath} \n大小: ${fileSize} | 修改时间: ${modifiedDate}">${file.relativePath}</div>
            <div class="file-tags">
                ${fileTags.map(tag => `<span class="file-tag">${tag}</span>`).join('')}
            </div>
        </div>
        <div class="file-actions">
            <button class="btn btn-small btn-preview" onclick="previewFile('${file.path.replace(/\\/g, '\\\\')}')">预览</button>
            <button class="btn btn-small btn-edit" onclick="editTags('${file.path.replace(/\\/g, '\\\\')}')">编辑标签</button>
            <button class="btn btn-small btn-move" onclick="moveFile('${file.path.replace(/\\/g, '\\\\')}')">移动文件</button>
            <button class="btn btn-small btn-open" onclick="openFile('${file.path.replace(/\\/g, '\\\\')}')">打开文件</button>
        </div>
    `;
    
    // 为文件标签添加点击事件
    const fileTagsContainer = card.querySelector('.file-tags');
    if (fileTagsContainer) {
        fileTagsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('file-tag')) {
                e.stopPropagation(); // 阻止事件冒泡
                const tagText = e.target.textContent;
                toggleTagFilter(tagText);
            }
        });
    }
    
    // 添加卡片点击事件预览
    card.addEventListener('click', (e) => {
        // 如果点击的是按钮或标签，不触发预览
        if (!e.target.closest('.file-actions') && !e.target.classList.contains('file-tag')) {
            previewFile(file.path);
        }
    });
    
    return card;
}

// 全局函数，供HTML调用
window.editTags = editTags;
window.openFile = openFile;
window.removeTag = removeTag;
window.previewFile = previewFile;
window.moveFile = moveFile;

// 版本检查相关功能

// 版本检查相关元素（更新检查模态框）
const currentVersionEl = document.getElementById('currentVersionUpdate');
const latestVersionEl = document.getElementById('latestVersionUpdate');
const updateStatusEl = document.getElementById('updateStatusUpdate');
const checkUpdateBtn = document.getElementById('checkUpdateBtnUpdate');
const downloadUpdateBtn = document.getElementById('downloadUpdateBtnUpdate');
const updateDetailsEl = document.getElementById('updateDetailsUpdate');
const releaseNotesEl = document.getElementById('releaseNotesUpdate');
const publishTimeEl = document.getElementById('publishTimeUpdate');

// 初始化版本信息
async function initVersionInfo() {
    try {
        const result = await ipcRenderer.invoke('get-current-version');
        if (result.success) {
            currentVersionEl.textContent = result.version;
        } else {
            currentVersionEl.textContent = '获取失败';
        }
    } catch (error) {
        console.error('获取当前版本失败:', error);
        currentVersionEl.textContent = '获取失败';
    }
}

// 初始化主页更新按钮的版本号显示
async function initMainPageVersionDisplay() {
    console.log('开始初始化主页版本号显示...');
    try {
        const result = await ipcRenderer.invoke('get-current-version');
        console.log('IPC调用结果:', result);
        const updateBtn = document.getElementById('updateBtn');
        const versionSpan = document.getElementById('updateBtnVersion');
        console.log('找到的元素:', { updateBtn: !!updateBtn, versionSpan: !!versionSpan });
        
        if (result.success && versionSpan) {
            console.log('设置版本号为:', result.version);
            versionSpan.textContent = result.version;
        } else if (versionSpan) {
            console.log('使用默认版本号: v1.6.10');
            versionSpan.textContent = 'v1.6.10';
        } else {
            console.log('未找到版本显示元素');
        }
    } catch (error) {
        console.error('获取主页版本号失败:', error);
        const updateBtn = document.getElementById('updateBtn');
        const versionSpan = document.getElementById('updateBtnVersion');
        if (versionSpan) {
            console.log('异常情况下使用默认版本号: v1.6.10');
            versionSpan.textContent = 'v1.6.10';
        }
    }
}

// 全局变量存储更新信息
let updateInfo = null;
// 全局变量跟踪下载状态
let isDownloading = false;
let downloadController = null; // 用于取消下载的控制器

// 检查更新
async function checkForUpdates() {
    // 如果正在下载更新，禁止重复检查
    if (isDownloading) {
        showToast('正在下载更新，请稍候...', 'warning');
        return;
    }
    
    // 更新UI状态
    checkUpdateBtn.disabled = true;
    checkUpdateBtn.textContent = '检查中...';
    downloadUpdateBtn.classList.add('hidden');
    updateDetailsEl.classList.add('hidden');
    
    // 隐藏下载进度条
    const progressContainer = document.getElementById('downloadProgressContainer');
    if (progressContainer) {
        progressContainer.style.display = 'none';
    }
    
    try {
        const result = await ipcRenderer.invoke('check-for-updates');
        
        if (result.success) {
            latestVersionEl.textContent = result.latestVersion;
            updateInfo = result; // 保存更新信息
            
            if (result.hasUpdate) {
                // 有更新可用，直接弹出更新提示弹窗
                addNewBadgeToUpdateButton();
                showUpdateNotificationModal(result);
            } else {
                // 已是最新版本
                showToast('当前已是最新版本', 'info');
            }
        } else {
            // 检查失败
            latestVersionEl.textContent = '检查失败';
            
            // 显示错误信息，特别处理GitHub API限制错误
            let errorMessage = result.error || '网络连接错误';
            if (errorMessage.includes('rate limit exceeded') || errorMessage.includes('GitHub API请求次数超限')) {
                showToast('GitHub API请求受限，建议稍后重试或查看帮助文档了解如何配置GitHub Token以提高限制', 'warning', 10000);
            } else {
                showToast('检查更新失败: ' + errorMessage, 'error');
            }
        }
    } catch (error) {
        console.error('检查更新失败:', error);
        latestVersionEl.textContent = '检查失败';
        
        // 特别处理GitHub API限制错误
        if (error.message.includes('rate limit exceeded') || error.message.includes('GitHub API请求次数超限')) {
            showToast('GitHub API请求受限，建议稍后重试或查看帮助文档了解如何配置GitHub Token以提高限制', 'warning', 10000);
        } else {
            showToast('检查更新失败: ' + error.message, 'error');
        }
    } finally {
        // 恢复按钮状态
        checkUpdateBtn.disabled = false;
        checkUpdateBtn.textContent = '检查更新';
    }
}

// 下载更新（打开下载页面）
async function downloadUpdate(downloadUrl) {
    try {
        const result = await ipcRenderer.invoke('open-download-page', downloadUrl);
        if (result.success) {
            showToast('已打开下载页面', 'info');
        } else {
            showToast('打开下载页面失败: ' + (result.error || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('打开下载页面失败:', error);
        showToast('打开下载页面失败: ' + error.message, 'error');
    }
}

// 自动下载并安装更新
async function downloadAndInstallUpdate() {
    if (!updateInfo || !updateInfo.installerUrl) {
        showToast('没有找到可下载的安装包', 'error');
        return;
    }
    
    try {
        // 设置下载状态
        isDownloading = true;
        
        // 禁用下载按钮和检查更新按钮
        downloadUpdateBtn.disabled = true;
        downloadUpdateBtn.textContent = '准备下载...';
        if (checkUpdateBtn) {
            checkUpdateBtn.disabled = true;
        }
        
        // 通知主进程即将开始自动更新，跳过关闭确认
        await ipcRenderer.invoke('set-auto-update-mode', true);
        
        // 调用主进程下载并安装
        const result = await ipcRenderer.invoke('download-and-install-update', updateInfo.installerUrl);
        
        if (result.success) {
            showToast(result.message, 'success');
        } else {
            showToast('下载安装失败: ' + (result.error || '未知错误'), 'error');
            // 重置下载状态和恢复按钮状态
            isDownloading = false;
            downloadUpdateBtn.disabled = false;
            downloadUpdateBtn.textContent = '自动下载安装';
            if (checkUpdateBtn) {
                checkUpdateBtn.disabled = false;
            }
            // 取消自动更新模式
            await ipcRenderer.invoke('set-auto-update-mode', false);
        }
    } catch (error) {
        console.error('下载安装失败:', error);
        showToast('下载安装失败: ' + error.message, 'error');
        // 重置下载状态和恢复按钮状态
        isDownloading = false;
        downloadUpdateBtn.disabled = false;
        downloadUpdateBtn.textContent = '自动下载安装';
        if (checkUpdateBtn) {
            checkUpdateBtn.disabled = false;
        }
        // 取消自动更新模式
        try {
            await ipcRenderer.invoke('set-auto-update-mode', false);
        } catch (e) {
            console.error('取消自动更新模式失败:', e);
        }
    }
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 监听下载进度事件
ipcRenderer.on('download-progress', (event, progressData) => {
    const { status, progress, message, downloaded, total } = progressData;
    const progressContainer = document.getElementById('downloadProgressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    switch (status) {
        case 'started':
            downloadUpdateBtn.textContent = '下载中';
            // 显示下载进度条
            if (progressContainer) {
                progressContainer.style.display = 'flex';
            }
            if (progressFill) {
                progressFill.style.width = '0%';
            }
            if (progressText) {
                progressText.textContent = '0%';
            }
            // 确保按钮保持禁用状态
            downloadUpdateBtn.disabled = true;
            if (checkUpdateBtn) {
                checkUpdateBtn.disabled = true;
            }
            break;
        case 'downloading':
            downloadUpdateBtn.textContent = '下载中';
            // 更新下载进度条
            if (progressFill) {
                progressFill.style.width = `${progress}%`;
            }
            if (progressText) {
                if (downloaded && total) {
                    progressText.textContent = `${progress}% (${formatFileSize(downloaded)}/${formatFileSize(total)})`;
                } else {
                    progressText.textContent = `${progress}%`;
                }
            }
            // 确保按钮保持禁用状态
            downloadUpdateBtn.disabled = true;
            if (checkUpdateBtn) {
                checkUpdateBtn.disabled = true;
            }
            break;
        case 'completed':
            downloadUpdateBtn.textContent = '启动安装...';
            // 进度条显示100%
            if (progressFill) {
                progressFill.style.width = '100%';
            }
            if (progressText) {
                if (total) {
                    progressText.textContent = `100% (${formatFileSize(total)}/${formatFileSize(total)})`;
                } else {
                    progressText.textContent = '100%';
                }
            }
            // 下载完成，即将退出应用，保持按钮禁用
            downloadUpdateBtn.disabled = true;
            if (checkUpdateBtn) {
                checkUpdateBtn.disabled = true;
            }
            break;
        case 'cancelled':
            // 处理下载取消状态
            downloadUpdateBtn.textContent = '下载已取消';
            showToast(message, 'info');
            // 隐藏下载进度条
            if (progressContainer) {
                progressContainer.style.display = 'none';
            }
            // 重置下载状态和恢复按钮状态
            isDownloading = false;
            setTimeout(async () => {
                downloadUpdateBtn.disabled = false;
                downloadUpdateBtn.textContent = '自动下载安装';
                if (checkUpdateBtn) {
                    checkUpdateBtn.disabled = false;
                }
                // 取消自动更新模式
                try {
                    await ipcRenderer.invoke('set-auto-update-mode', false);
                } catch (e) {
                    console.error('取消自动更新模式失败:', e);
                }
            }, 2000);
            break;
        case 'error':
            downloadUpdateBtn.textContent = '下载失败';
            showToast(message, 'error');
            // 隐藏下载进度条
            if (progressContainer) {
                progressContainer.style.display = 'none';
            }
            // 重置下载状态和恢复按钮状态
            isDownloading = false;
            setTimeout(async () => {
                downloadUpdateBtn.disabled = false;
                downloadUpdateBtn.textContent = '自动下载安装';
                if (checkUpdateBtn) {
                    checkUpdateBtn.disabled = false;
                }
                // 取消自动更新模式
                try {
                    await ipcRenderer.invoke('set-auto-update-mode', false);
                } catch (e) {
                    console.error('取消自动更新模式失败:', e);
                }
            }, 3000);
            break;
    }
});

// 更新检查模态框函数
function showUpdateModal() {
    // 移除new标识
    removeNewBadgeFromUpdateButton();
    
    // 如果有更新信息，直接显示更新提示弹窗
    if (updateInfo && updateInfo.hasUpdate) {
        showUpdateNotificationModal(updateInfo);
    } else {
        // 没有更新信息或没有更新，也显示新的更新提示弹窗
        // 先检查更新，然后显示结果
        checkForUpdates();
    }
}

function closeUpdateModal() {
    if (updateModal) {
        updateModal.classList.add('hidden');
    }
}

// 更新提示弹窗函数
function showUpdateNotificationModal(updateInfo) {
    if (!updateInfo || !updateNotificationModal) return;
    
    // 填充版本信息
    if (currentVersionNotificationEl) {
        currentVersionNotificationEl.textContent = updateInfo.currentVersion;
    }
    if (latestVersionNotificationEl) {
        latestVersionNotificationEl.textContent = updateInfo.latestVersion;
    }
    
    // 填充更新详情（支持Markdown格式）
    if (releaseNotesNotificationEl) {
        const releaseNotes = updateInfo.releaseNotes || '暂无更新说明';
        releaseNotesNotificationEl.innerHTML = formatMarkdownToHtml(releaseNotes);
    }
    
    // 填充发布时间
    if (publishTimeNotificationEl && updateInfo.publishedAt) {
        const publishDate = new Date(updateInfo.publishedAt);
        publishTimeNotificationEl.textContent = `${publishDate.toLocaleDateString('zh-CN')} ${publishDate.toLocaleTimeString('zh-CN')}`;
    }
    
    // 重置下载进度和隐藏相关元素
    if (downloadProgressNotificationEl) {
        downloadProgressNotificationEl.classList.add('hidden');
    }
    if (progressFillNotificationEl) {
        progressFillNotificationEl.style.width = '0%';
    }
    if (progressTextNotificationEl) {
        progressTextNotificationEl.textContent = '0%';
    }
    if (cancelDownloadNotificationBtn) {
        cancelDownloadNotificationBtn.classList.add('hidden');
    }
    
    // 重置下载按钮状态
    if (downloadUpdateNotificationBtn) {
        downloadUpdateNotificationBtn.disabled = false;
        downloadUpdateNotificationBtn.textContent = '立即下载';
        downloadUpdateNotificationBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    
    // 默认折叠更新详情
    if (updateDetailsContentEl) {
        updateDetailsContentEl.classList.add('hidden');
    }
    if (detailsArrowEl) {
        detailsArrowEl.style.transform = 'rotate(0deg)';
    }
    
    // 显示弹窗
    updateNotificationModal.classList.remove('hidden');
}

function closeUpdateNotificationModal() {
    if (updateNotificationModal) {
        updateNotificationModal.classList.add('hidden');
    }
}

// 处理更新提示弹窗中的下载按钮点击
async function handleDownloadUpdateNotification() {
    if (!updateInfo) return;
    
    // 显示下载进度条
    if (downloadProgressNotificationEl) {
        downloadProgressNotificationEl.classList.remove('hidden');
    }
    
    // 禁用下载按钮并更新样式
    if (downloadUpdateNotificationBtn) {
        downloadUpdateNotificationBtn.disabled = true;
        downloadUpdateNotificationBtn.textContent = '下载中...';
        downloadUpdateNotificationBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
    
    // 显示取消按钮
    if (cancelDownloadNotificationBtn) {
        cancelDownloadNotificationBtn.classList.remove('hidden');
    }
    
    try {
        if (updateInfo.installerUrl) {
            // 自动下载安装
            await downloadAndInstallUpdateNotification();
        } else {
            // 打开下载页面
            await ipcRenderer.invoke('open-download-page', updateInfo.downloadUrl);
            closeUpdateNotificationModal();
        }
    } catch (error) {
        console.error('下载更新失败:', error);
        showToast('下载更新失败: ' + error.message, 'error');
        
        // 恢复按钮状态
        if (downloadUpdateNotificationBtn) {
            downloadUpdateNotificationBtn.disabled = false;
            downloadUpdateNotificationBtn.textContent = '立即下载';
            downloadUpdateNotificationBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
        
        // 隐藏进度条和取消按钮
        if (downloadProgressNotificationEl) {
            downloadProgressNotificationEl.classList.add('hidden');
        }
        if (cancelDownloadNotificationBtn) {
            cancelDownloadNotificationBtn.classList.add('hidden');
        }
    }
}

// 处理跳过版本
function handleSkipUpdateNotification() {
    if (updateInfo && updateInfo.latestVersion) {
        // 将跳过的版本保存到本地存储
        localStorage.setItem('skippedVersion', updateInfo.latestVersion);
        showToast(`已跳过版本 v${updateInfo.latestVersion}`, 'info');
    }
    closeUpdateNotificationModal();
}

// 简单的Markdown转HTML函数
function formatMarkdownToHtml(markdown) {
    if (!markdown) return '';
    
    let html = markdown
        // 转义HTML特殊字符
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // 处理标题
        .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mb-3 mt-4 text-gray-800">$1</h3>')
        .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mb-3 mt-4 text-gray-800">$1</h2>')
        .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mb-4 mt-2 text-gray-800">$1</h1>')
        // 处理粗体
        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
        // 处理斜体
        .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
        // 处理代码
        .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono">$1</code>')
        // 处理链接
        .replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" class="text-blue-600 hover:text-blue-800 underline" target="_blank">$1</a>')
        // 处理列表项
        .replace(/^[\s]*[-\*\+] (.*$)/gim, '<li class="ml-4 mb-1 list-disc">$1</li>');
    
    // 包装列表项
    html = html.replace(/(<li[^>]*>.*?<\/li>)/gs, '<ul class="mb-3 ml-4">$1</ul>');
    
    // 处理段落：将双换行转换为段落分隔，单换行保持为换行
    html = html
        // 先处理双换行为段落分隔符
        .replace(/\n\s*\n/g, '</p><p class="mb-3">')
        // 处理单换行为br
        .replace(/\n/g, '<br>');
    
    // 包装在段落中
    html = '<p class="mb-3">' + html + '</p>';
    
    // 清理空段落和多余的br标签
    html = html
        .replace(/<p[^>]*>\s*<\/p>/g, '') // 移除空段落
        .replace(/(<br>\s*){3,}/g, '<br><br>') // 限制连续br标签最多2个
        .replace(/<p[^>]*>\s*(<br>\s*)+/g, '<p class="mb-3">') // 移除段落开头的br
        .replace(/(<br>\s*)+\s*<\/p>/g, '</p>'); // 移除段落结尾的br
    
    return html;
}

// 处理取消下载
async function handleCancelDownload() {
    try {
        // 调用主进程取消下载
        const result = await ipcRenderer.invoke('cancel-download');
        
        if (result.success) {
            // 本地状态重置
            if (downloadController) {
                downloadController.abort();
                downloadController = null;
            }
            
            isDownloading = false;
            
            // 隐藏进度条
            if (downloadProgressNotificationEl) {
                downloadProgressNotificationEl.classList.add('hidden');
            }
            
            // 重新启用下载按钮
            if (downloadUpdateNotificationBtn) {
                downloadUpdateNotificationBtn.disabled = false;
                downloadUpdateNotificationBtn.textContent = '立即下载';
                downloadUpdateNotificationBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            
            // 隐藏取消按钮
            if (cancelDownloadNotificationBtn) {
                cancelDownloadNotificationBtn.classList.add('hidden');
            }
            
            showToast('下载已取消', 'info');
        } else {
            console.error('取消下载失败:', result.error);
            showToast('取消下载失败', 'error');
        }
    } catch (error) {
        console.error('取消下载时发生错误:', error);
        showToast('取消下载时发生错误', 'error');
    }
}

// 切换更新详情的显示/隐藏
function toggleUpdateDetails() {
    const isExpanded = !updateDetailsContentEl.classList.contains('hidden');
    
    if (isExpanded) {
        // 折叠
        updateDetailsContentEl.classList.add('hidden');
        detailsArrowEl.style.transform = 'rotate(0deg)';
    } else {
        // 展开
        updateDetailsContentEl.classList.remove('hidden');
        detailsArrowEl.style.transform = 'rotate(180deg)';
    }
}

// 自动下载安装更新（弹窗版本）
async function downloadAndInstallUpdateNotification() {
    if (!updateInfo || !updateInfo.installerUrl) {
        showToast('无法获取安装包下载链接', 'error');
        return;
    }
    
    isDownloading = true;
    
    // 重置进度条状态
    if (progressFillNotificationEl) {
        progressFillNotificationEl.style.width = '0%';
    }
    if (progressTextNotificationEl) {
        progressTextNotificationEl.textContent = '0%';
    }
    
    // 创建下载控制器
    downloadController = new AbortController();
    
    try {
        // 监听下载进度
        const progressHandler = (event, progressData) => {
            if (progressFillNotificationEl && progressTextNotificationEl && progressData.progress) {
                progressFillNotificationEl.style.width = progressData.progress + '%';
                if (progressData.downloaded && progressData.total) {
                    progressTextNotificationEl.textContent = `${Math.round(progressData.progress)}% (${formatFileSize(progressData.downloaded)}/${formatFileSize(progressData.total)})`;
                } else {
                    progressTextNotificationEl.textContent = Math.round(progressData.progress) + '%';
                }
            }
        };
        
        ipcRenderer.on('download-progress', progressHandler);
        
        const result = await ipcRenderer.invoke('download-and-install-update', updateInfo.installerUrl);
        
        // 移除进度监听器
        ipcRenderer.removeListener('download-progress', progressHandler);
        
        if (result.success) {
            showToast('更新下载完成，即将重启应用进行安装...', 'success');
            closeUpdateNotificationModal();
            // 隐藏取消按钮
            if (cancelDownloadNotificationBtn) {
                cancelDownloadNotificationBtn.classList.add('hidden');
            }
        } else {
            // 检查是否是用户取消
            if (result.cancelled) {
                console.log('下载已被用户取消');
                return; // 用户取消，不显示错误信息
            }
            throw new Error(result.error || '下载失败');
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('下载已被用户取消');
            return; // 用户取消，不显示错误信息
        }
        console.error('下载安装更新失败:', error);
        showToast('下载安装更新失败: ' + error.message, 'error');
    } finally {
        isDownloading = false;
        downloadController = null;
    }
}

// 设置模态框函数
function showSettingsModal() {
    loadCurrentSettings();
    settingsModal.classList.remove('hidden');
}

// 静默检查更新（应用启动时使用，同时更新UI状态）
async function checkForUpdatesQuietly() {
    console.log('开始执行静默检查更新...');
    try {
        console.log('调用 check-for-updates IPC...');
        const result = await ipcRenderer.invoke('check-for-updates');
        console.log('检查更新结果:', result);
        
        if (result.success) {
            // 更新最新版本显示
            if (latestVersionEl) {
                latestVersionEl.textContent = result.latestVersion;
            }
            
            // 保存更新信息
            updateInfo = result;
            
            if (result.hasUpdate) {
                console.log('发现新版本，检查是否已跳过');
                
                // 检查是否已跳过此版本
                const skippedVersion = localStorage.getItem('skippedVersion');
                if (skippedVersion === result.latestVersion) {
                    console.log('用户已跳过此版本，不显示弹窗');
                    // 仍然添加new标识，但不弹窗
                    addNewBadgeToUpdateButton();
                } else {
                    console.log('直接弹出更新提示弹窗');
                    // 如果有更新，在检查更新按钮上添加new标识
                    addNewBadgeToUpdateButton();
                    
                    // 直接弹出更新提示弹窗
                    showUpdateNotificationModal(result);
                }
            } else {
                console.log('已是最新版本');
            }
        } else {
            console.log('检查更新失败:', result.error);
            if (latestVersionEl) {
                latestVersionEl.textContent = '检查失败';
            }
            
            // 如果是API限制错误，显示温和的提示
            if (result.error && (result.error.includes('rate limit exceeded') || result.error.includes('GitHub API请求次数超限'))) {
                console.log('GitHub API请求受限，建议配置GitHub Token');
                // 静默检查时不显示toast，避免打扰用户
            }
        }
    } catch (error) {
        // 静默失败，不显示错误信息
        console.log('静默检查更新失败:', error);
        if (latestVersionEl) {
            latestVersionEl.textContent = '检查失败';
        }
    }
}

// 为检查更新按钮添加new标识
function addNewBadgeToUpdateButton() {
    const updateBtn = document.getElementById('updateBtn');
    if (updateBtn && !updateBtn.querySelector('.new-badge')) {
        const badge = document.createElement('span');
        badge.className = 'new-badge';
        badge.textContent = 'NEW';
        updateBtn.appendChild(badge);
        updateBtn.classList.add('has-update');
    }
}

// 移除检查更新按钮的new标识
function removeNewBadgeFromUpdateButton() {
    const updateBtn = document.getElementById('updateBtn');
    if (updateBtn) {
        const badge = updateBtn.querySelector('.new-badge');
        if (badge) {
            badge.remove();
        }
        updateBtn.classList.remove('has-update');
    }
}

// 绑定版本检查事件
if (checkUpdateBtn) {
    checkUpdateBtn.addEventListener('click', checkForUpdates);
}

// GitHub Token 设置相关元素
const githubTokenInput = document.getElementById('githubTokenInput');
const toggleTokenVisibility = document.getElementById('toggleTokenVisibility');
const clearTokenBtn = document.getElementById('clearToken');
const githubGuideModal = document.getElementById('githubGuideModal');
const closeGithubGuide = document.getElementById('closeGithubGuide');
const githubGuideContent = document.getElementById('githubGuideContent');

// GitHub Token 可见性切换
if (toggleTokenVisibility) {
    toggleTokenVisibility.addEventListener('click', () => {
        const input = githubTokenInput;
        if (input.type === 'password') {
            input.type = 'text';
            toggleTokenVisibility.textContent = '🙈';
        } else {
            input.type = 'password';
            toggleTokenVisibility.textContent = '👁️';
        }
    });
}

// 清除 GitHub Token
if (clearTokenBtn) {
    clearTokenBtn.addEventListener('click', () => {
        if (githubTokenInput) {
            githubTokenInput.value = '';
            showToast('GitHub Token 已清除', 'info');
        }
    });
}

// 关闭 GitHub 指南模态框
if (closeGithubGuide) {
    closeGithubGuide.addEventListener('click', () => {
        closeGithubGuideModal();
    });
}

// 显示 GitHub 指南模态框
function showGithubGuideModal() {
    if (githubGuideModal) {
        githubGuideModal.classList.remove('hidden');
        loadGithubGuideContent();
    }
}

// 关闭 GitHub 指南模态框
function closeGithubGuideModal() {
    if (githubGuideModal) {
        githubGuideModal.classList.add('hidden');
    }
}

// 加载 GitHub 指南内容
async function loadGithubGuideContent() {
    if (!githubGuideContent) return;
    
    try {
        githubGuideContent.innerHTML = '<div class="loading-indicator">正在加载指南内容...</div>';
        
        // 调用主进程读取 Markdown 文件内容
        const result = await ipcRenderer.invoke('read-github-token-guide');
        
        if (result.success) {
            // 将 Markdown 转换为 HTML 并显示
            githubGuideContent.innerHTML = convertMarkdownToHtml(result.content);
        } else {
            githubGuideContent.innerHTML = `
                <div class="error-message">
                    <h3>❌ 无法加载指南内容</h3>
                    <p>错误信息: ${result.error}</p>
                    <p>请查看应用目录下的 <code>GITHUB_TOKEN_SETUP.md</code> 文件。</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('加载GitHub指南内容失败:', error);
        githubGuideContent.innerHTML = `
            <div class="error-message">
                <h3>❌ 加载失败</h3>
                <p>无法读取指南文件，请查看应用目录下的 <code>GITHUB_TOKEN_SETUP.md</code> 文件。</p>
            </div>
        `;
    }
}

// 简单的 Markdown 转 HTML 函数
function convertMarkdownToHtml(markdown) {
    let html = markdown
        // 标题
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        // 粗体
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // 斜体
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // 代码块
        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
        // 行内代码
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // 链接
        .replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        // 换行
        .replace(/\n/g, '<br>');
    
    // 处理列表
    html = html.replace(/^\d+\. (.*)$/gm, '<li>$1</li>');
    html = html.replace(/^- (.*)$/gm, '<li>$1</li>');
    html = html.replace(/((<li>.*<\/li>\s*)+)/g, '<ul>$1</ul>');
    
    // 处理段落
    html = html.replace(/(<br>\s*){2,}/g, '</p><p>');
    html = '<p>' + html + '</p>';
    
    return html;
}

// 加载 GitHub Token 设置
async function loadGithubTokenSetting() {
    try {
        const result = await ipcRenderer.invoke('get-github-token');
        if (result.success && result.token && githubTokenInput) {
            githubTokenInput.value = result.token;
        }
    } catch (error) {
        console.error('加载GitHub Token设置失败:', error);
    }
}

// 保存 GitHub Token 设置
async function saveGithubTokenSetting() {
    if (!githubTokenInput) return;
    
    try {
        const token = githubTokenInput.value.trim();
        const result = await ipcRenderer.invoke('save-github-token', token);
        
        if (result.success) {
            if (token) {
                showToast('GitHub Token 已保存', 'success');
            } else {
                showToast('GitHub Token 已清除', 'info');
            }
        } else {
            showToast('保存 GitHub Token 失败: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('保存GitHub Token失败:', error);
        showToast('保存 GitHub Token 失败', 'error');
    }
}

// 修改设置保存函数，包含 GitHub Token
const originalSaveSettings = saveSettings;
if (typeof saveSettings === 'function') {
    window.saveSettings = async function() {
        // 先保存 GitHub Token
        await saveGithubTokenSetting();
        // 然后保存其他设置
        if (originalSaveSettings) {
            await originalSaveSettings();
        }
    };
}

// 修改设置加载函数，包含 GitHub Token
const originalLoadCurrentSettings = loadCurrentSettings;
if (typeof loadCurrentSettings === 'function') {
    window.loadCurrentSettings = async function() {
        // 先加载 GitHub Token
        await loadGithubTokenSetting();
        // 然后加载其他设置
        if (originalLoadCurrentSettings) {
            await originalLoadCurrentSettings();
        }
    };
}

// 处理GitHub Token配置指南链接
document.addEventListener('click', async (event) => {
    // 处理帮助页面中的指南链接（弹出页面显示）
    if (event.target.classList.contains('github-token-link') && event.target.dataset.action === 'show-github-guide') {
        event.preventDefault();
        showGithubGuideModal();
    }
    
    // 处理设置页面中的指南链接（应用内打开）
    if (event.target.classList.contains('github-token-guide-link') && event.target.dataset.action === 'open-guide') {
        event.preventDefault();
        showGithubGuideModal();
    }
});

// 文件监控功能实现

// 获取文件监控相关的DOM元素
const fileWatchToggle = document.getElementById('fileWatchToggle');
const queueLengthEl = document.getElementById('queueLength');
const activeTasksEl = document.getElementById('activeTasks');
const systemStatusEl = document.getElementById('systemStatus');

// 初始化文件监控功能（已禁用）
function initFileMonitoring() {
    // 文件监控功能已禁用
    console.log('文件监控功能已禁用');
    
    // 隐藏文件监控开关
    if (fileWatchToggle) {
        fileWatchToggle.style.display = 'none';
        const toggleContainer = fileWatchToggle.closest('.toggle-container');
        if (toggleContainer) {
            toggleContainer.style.display = 'none';
        }
    }
    
    // 不再监听后台PDF生成完成事件
    // ipcRenderer.on('background-pdf-generated', (event, data) => {
    //     console.log('后台PDF生成完成:', data);
    //     // 可以在这里添加UI提示或更新文件状态
    // });
}

// 切换文件监控状态（已禁用）
async function toggleFileWatching(enabled) {
    // 文件监控功能已禁用
    console.log('文件监控功能已禁用，无法切换状态');
    if (fileWatchToggle) {
        fileWatchToggle.checked = false;
    }
    showNotification('文件监控功能已禁用', 'info');
}

// 启动状态更新
function startStatusUpdates() {
    // 每5秒更新一次状态
    statusUpdateInterval = setInterval(async () => {
        try {
            const status = await ipcRenderer.invoke('get-background-task-status');
            updateStatusDisplay(status);
        } catch (error) {
            console.error('获取后台任务状态失败:', error);
        }
    }, 5000);
}

// 停止状态更新
function stopStatusUpdates() {
    if (statusUpdateInterval) {
        clearInterval(statusUpdateInterval);
        statusUpdateInterval = null;
    }
}

// 更新状态显示
function updateStatusDisplay(status) {
    backgroundTaskStatus = status;
    
    if (queueLengthEl) {
        queueLengthEl.textContent = status.queueLength;
    }
    
    if (activeTasksEl) {
        activeTasksEl.textContent = `${status.activeTasks}/${status.maxConcurrent}`;
    }
    
    if (systemStatusEl) {
        if (status.isSystemBusy) {
            systemStatusEl.textContent = '繁忙';
            systemStatusEl.className = 'text-yellow-600';
        } else {
            systemStatusEl.textContent = '空闲';
            systemStatusEl.className = 'text-green-600';
        }
    }
    
    // 更新开关状态
    if (fileWatchToggle && status.watchedFolder) {
        fileWatchToggle.checked = true;
        isFileWatchingEnabled = true;
    }
}

// 显示通知
function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg transition-all duration-300 transform translate-x-full`;
    
    // 根据类型设置样式
    switch (type) {
        case 'success':
            notification.className += ' bg-green-500 text-white';
            break;
        case 'error':
            notification.className += ' bg-red-500 text-white';
            break;
        case 'warning':
            notification.className += ' bg-yellow-500 text-white';
            break;
        default:
            notification.className += ' bg-blue-500 text-white';
    }
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // 显示动画
    setTimeout(() => {
        notification.classList.remove('translate-x-full');
    }, 100);
    
    // 自动隐藏
    setTimeout(() => {
        notification.classList.add('translate-x-full');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// 在文件夹选择时启动监控
function onFolderSelected(folderPath) {
    currentFolder = folderPath;
    
    // 文件监控功能已移除
}

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
    stopStatusUpdates();
});

// 文件监控功能已移除
document.addEventListener('DOMContentLoaded', () => {
    // 初始化代码已移除
});

// 点击模态框背景关闭
if (githubGuideModal) {
    githubGuideModal.addEventListener('click', (event) => {
        if (event.target === githubGuideModal) {
            closeGithubGuideModal();
        }
    });
}

// ESC 键关闭 GitHub 指南模态框
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && githubGuideModal && !githubGuideModal.classList.contains('hidden')) {
        closeGithubGuideModal();
    }
    
    // 嵌入式PDF查看器键盘导航
    if (embeddedPDFViewer && !embeddedPDFViewer.classList.contains('hidden')) {
        switch(event.key) {
            case 'ArrowUp':
                event.preventDefault();
                scrollPDFUp();
                break;
            case 'ArrowDown':
                event.preventDefault();
                scrollPDFDown();
                break;
            case 'Escape':
                hideEmbeddedPDFViewer();
                break;
        }
    }
});

// 嵌入式PDF查看器功能函数
function showEmbeddedPDFViewer(pdfPath) {
    if (!embeddedPDFViewer || !pdfPath) return;
    
    console.log('显示嵌入式PDF查看器:', pdfPath);
    
    // 隐藏其他预览元素
    previewImage.classList.add('hidden');
    previewPDF.classList.add('hidden');
    
    // 显示嵌入式PDF查看器
    embeddedPDFViewer.classList.remove('hidden');
    
    // 加载PDF
    loadEmbeddedPDF(pdfPath);
}

function hideEmbeddedPDFViewer() {
    if (!embeddedPDFViewer) return;
    
    embeddedPDFViewer.classList.add('hidden');
    
    // 清理PDF文档
    if (currentPDFDoc) {
        currentPDFDoc.destroy();
        currentPDFDoc = null;
    }
    
    // 清理页面容器
    if (pdfPages) {
        pdfPages.innerHTML = '';
    }
    
    // 重置状态
    currentPDFPage = 1;
    totalPDFPages = 0;
    currentPDFScale = 1;
    isFitToWidth = true; // 重置为适应宽度模式
}

async function loadEmbeddedPDF(pdfPath) {
    try {
        console.log('开始加载PDF:', pdfPath);
        
        // 设置当前预览路径
        currentPreviewPath = pdfPath;
        
        // 检查PDF.js是否可用
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js库未加载');
        }
        
        // 显示加载状态
        if (pdfPages) {
            pdfPages.innerHTML = '<div class="flex items-center justify-center h-64"><div class="text-gray-500">正在加载PDF...</div></div>';
        }
        
        // 加载PDF文档，添加更多配置选项
        const loadingTask = pdfjsLib.getDocument({
            url: pdfPath,
            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
            cMapPacked: true,
            standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/',
            useSystemFonts: false,
            disableFontFace: false,
            disableRange: false
        });
        
        console.log('PDF加载任务创建成功');
        currentPDFDoc = await loadingTask.promise;
        console.log('PDF文档加载成功，页数:', currentPDFDoc.numPages);
        
        totalPDFPages = currentPDFDoc.numPages;
        currentPDFPage = 1;
        
        // 更新页面信息
        updatePDFPageInfo();
        
        // 默认适应宽度
        fitPDFToWidth();
        
        console.log('PDF渲染完成');
    } catch (error) {
        console.error('加载PDF失败:', error);
        
        if (pdfPages) {
            pdfPages.innerHTML = `<div class="flex items-center justify-center h-64"><div class="text-red-500">PDF加载失败: ${error.message}</div></div>`;
        }
    }
}

async function renderAllPDFPages() {
    if (!currentPDFDoc || !pdfPages) {
        console.error('PDF文档或容器不存在');
        return;
    }
    
    console.log('开始渲染PDF页面，总页数:', totalPDFPages);
    
    // 清空容器
    pdfPages.innerHTML = '';
    
    // 限制渲染页数以提高性能
    const maxPagesToRender = Math.min(totalPDFPages, 5);
    
    // 渲染每一页
    for (let pageNum = 1; pageNum <= maxPagesToRender; pageNum++) {
        try {
            console.log('渲染第', pageNum, '页');
            
            // 获取页面
            const page = await currentPDFDoc.getPage(pageNum);
            
            // 计算视口
            const viewport = page.getViewport({ scale: currentPDFScale });
            
            // 创建页面容器
            const pageContainer = document.createElement('div');
            pageContainer.className = 'pdf-page-container mb-4';
            
            // 创建canvas
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            canvas.className = 'border border-gray-300 shadow-lg';
            
            pageContainer.appendChild(canvas);
            
            // 添加页码标签
            const pageLabel = document.createElement('div');
            pageLabel.className = 'text-center text-sm text-gray-600 mt-2';
            pageLabel.textContent = `第 ${pageNum} 页`;
            pageContainer.appendChild(pageLabel);
            
            // 添加到容器
            pdfPages.appendChild(pageContainer);
            
            // 渲染页面到canvas
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
            console.log('第', pageNum, '页渲染完成');
            
        } catch (error) {
            console.error('渲染第', pageNum, '页失败:', error);
            
            // 创建错误页面
            const errorContainer = document.createElement('div');
            errorContainer.className = 'pdf-page-container mb-4 p-4 border border-red-300 bg-red-50';
            errorContainer.innerHTML = `<div class="text-red-600">第 ${pageNum} 页渲染失败: ${error.message}</div>`;
            pdfPages.appendChild(errorContainer);
        }
    }
    
    // 如果有更多页面，显示提示
    if (totalPDFPages > maxPagesToRender) {
        const moreContainer = document.createElement('div');
        moreContainer.className = 'pdf-page-container mb-4 p-4 border border-gray-300 bg-gray-50';
        moreContainer.innerHTML = `<div class="text-gray-600">还有 ${totalPDFPages - maxPagesToRender} 页未显示（为了性能考虑）</div>`;
        pdfPages.appendChild(moreContainer);
    }
}

function updatePDFPageInfo() {
    if (pdfPageInfo && totalPDFPages > 0) {
        pdfPageInfo.textContent = `共 ${totalPDFPages} 页`;
    }
}

function updatePDFZoomSelect() {
    if (pdfZoomSelect) {
        // 检查当前缩放是否是通过"适应宽度"设置的
        if (isFitToWidth) {
            pdfZoomSelect.value = 'fit';
        } else {
            pdfZoomSelect.value = currentPDFScale.toString();
        }
    }
}

function fitPDFToWidth() {
    if (!currentPDFDoc || !pdfPagesContainer) return;
    
    // 获取容器宽度
    const containerWidth = pdfPagesContainer.clientWidth - 40; // 减去padding
    
    // 获取第一页来计算缩放比例
    currentPDFDoc.getPage(1).then(page => {
        const viewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / viewport.width;
        currentPDFScale = Math.min(scale, 3); // 最大缩放3倍
        
        renderAllPDFPages();
        updatePDFZoomSelect();
    });
}

function scrollPDFUp() {
    if (pdfPagesContainer) {
        pdfPagesContainer.scrollBy(0, -100);
    }
}

function scrollPDFDown() {
    if (pdfPagesContainer) {
        pdfPagesContainer.scrollBy(0, 100);
    }
}

// 图片预览相关函数
let currentImagePaths = [];
let currentImageIndex = 0;

// 加载图片预览
async function loadImagePreview(pdfPath) {
    try {
        console.log('开始加载图片预览:', pdfPath);
        
        // 显示加载状态
        const pdfPagesContainer = document.getElementById('pdfPagesContainer');
        if (pdfPagesContainer) {
            pdfPagesContainer.innerHTML = '<div class="loading-message">正在生成图片预览...</div>';
        }
        
        // 调用主进程转换PDF为图片
        const result = await ipcRenderer.invoke('convert-pdf-to-images', pdfPath);
        
        if (result.success) {
            currentImagePaths = result.imagePaths;
            currentImageIndex = 0;
            
            console.log(result.cached ? '使用缓存图片' : '使用新生成的图片', '共', currentImagePaths.length, '张');
            
            // 显示图片预览
            displayImagePreview();
            
            // 更新页面信息
            updateImagePageInfo();
            
        } else {
            console.error('图片预览加载失败:', result.error);
            if (pdfPagesContainer) {
                pdfPagesContainer.innerHTML = `
                    <div class="error-message">
                        <p>图片预览加载失败: ${result.error}</p>
                        <button onclick="loadEmbeddedPDF('${pdfPath}')">切换到PDF预览</button>
                    </div>
                `;
            }
        }
        
    } catch (error) {
        console.error('图片预览加载错误:', error);
        const pdfPagesContainer = document.getElementById('pdfPagesContainer');
        if (pdfPagesContainer) {
            pdfPagesContainer.innerHTML = `
                <div class="error-message">
                    <p>图片预览加载错误: ${error.message}</p>
                    <button onclick="loadEmbeddedPDF('${pdfPath}')">切换到PDF预览</button>
                </div>
            `;
        }
    }
}

// 显示图片预览
function displayImagePreview() {
    const pdfPagesContainer = document.getElementById('pdfPagesContainer');
    if (!pdfPagesContainer || currentImagePaths.length === 0) {
        return;
    }
    
    // 清空容器
    pdfPagesContainer.innerHTML = '';
    
    // 创建图片容器
    currentImagePaths.forEach((imagePath, index) => {
        const imageContainer = document.createElement('div');
        imageContainer.className = 'image-page-container';
        imageContainer.style.cssText = `
            margin-bottom: 20px;
            text-align: center;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 10px;
            background: white;
        `;
        
        const img = document.createElement('img');
        img.src = `file://${imagePath}`;
        img.style.cssText = `
            max-width: 100%;
            height: auto;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        `;
        
        const pageLabel = document.createElement('div');
        pageLabel.textContent = `第 ${index + 1} 页`;
        pageLabel.style.cssText = `
            margin-top: 10px;
            color: #666;
            font-size: 14px;
        `;
        
        imageContainer.appendChild(img);
        imageContainer.appendChild(pageLabel);
        pdfPagesContainer.appendChild(imageContainer);
    });
}

// 更新图片页面信息
function updateImagePageInfo() {
    const pageInfo = document.getElementById('pdfPageInfo');
    if (pageInfo && currentImagePaths.length > 0) {
        pageInfo.textContent = `共 ${currentImagePaths.length} 页`;
    }
}

// 切换预览模式
function togglePreviewMode(pdfPath) {
    const currentMode = document.getElementById('previewModeToggle');
    if (currentMode && currentMode.textContent.includes('图片')) {
        // 当前是PDF模式，切换到图片模式
        loadImagePreview(pdfPath);
        currentMode.textContent = '切换到PDF预览';
    } else {
        // 当前是图片模式，切换到PDF模式
        loadEmbeddedPDF(pdfPath);
        if (currentMode) {
            currentMode.textContent = '切换到图片预览';
        }
    }
}