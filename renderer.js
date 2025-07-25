const { ipcRenderer } = require('electron');

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

// DOM元素
const selectFolderBtn = document.getElementById('selectFolder');
const currentFolderEl = document.getElementById('currentFolder');
const filesListEl = document.getElementById('filesList');
const loadingEl = document.getElementById('loadingMessage');
const emptyEl = document.getElementById('emptyMessage');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearch');
const totalFilesEl = document.getElementById('totalFiles');
const taggedFilesEl = document.getElementById('taggedFiles');
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

// 设置相关元素
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettings');
const cachePathInput = document.getElementById('cachePathInput');
const tagsPathInput = document.getElementById('tagsPathInput');
const selectCachePathBtn = document.getElementById('selectCachePath');
const selectTagsPathBtn = document.getElementById('selectTagsPath');
const resetCachePathBtn = document.getElementById('resetCachePath');
const resetTagsPathBtn = document.getElementById('resetTagsPath');
// 移除已删除的元素引用
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
const previewFileName = document.getElementById('previewFileName');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const previewCounter = document.getElementById('previewCounter');
const previewLoading = document.getElementById('previewLoading');
const editPreviewTagsBtn = document.getElementById('editPreviewTags');
const openPreviewFileBtn = document.getElementById('openPreviewFile');
const previewTagsEl = document.getElementById('previewTags');

// 初始化
init();

async function init() {
    // 显示启动画面，隐藏主界面
    const splashScreen = document.getElementById('splashScreen');
    const container = document.querySelector('.container');
    
    // 记录启动时间
    const startTime = Date.now();
    
    try {
        // 1. 获取上次选择的文件夹
        const lastFolder = await ipcRenderer.invoke('get-last-folder');
        
        // 2. 加载已保存的标签数据
        tagsData = await ipcRenderer.invoke('load-tags', lastFolder);
        
        // 3. 绑定事件
        bindEvents();
        
        // 4. 如果有上次选择的文件夹，扫描文件
        if (lastFolder) {
            currentFolder = lastFolder;
            currentFolderEl.textContent = lastFolder;
            await scanFilesQuietly();
        }
        
        // 5. 更新统计信息和标签面板
        updateStats();
        updateTagsPanel();
        
        // 6. 首次打开应用时在后台自动检查更新（静默检查）
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
        if (lastFolder && allFiles.length > 0) {
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
    // 选择文件夹
    selectFolderBtn.addEventListener('click', selectFolder);
    
    // 搜索
    searchInput.addEventListener('input', handleSearch);
    clearSearchBtn.addEventListener('click', clearSearch);
    
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
    
    // 点击预览模态框外部关闭
    previewModal.addEventListener('click', (e) => {
        if (e.target === previewModal) {
            closePreviewModal();
        }
    });
    
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
    
    // 设置按钮事件
    if (settingsBtn) {
        settingsBtn.addEventListener('click', showSettingsModal);
    }
    closeSettingsBtn.addEventListener('click', closeSettingsModal);
    selectCachePathBtn.addEventListener('click', selectCachePath);
    selectTagsPathBtn.addEventListener('click', selectTagsPath);
    resetCachePathBtn.addEventListener('click', resetCachePath);
    resetTagsPathBtn.addEventListener('click', resetTagsPath);
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
        currentFolderEl.textContent = folderPath;
        
        // 重新加载标签数据，使用新的基础路径
        tagsData = await ipcRenderer.invoke('load-tags', currentFolder) || {};
        
        await scanFiles();
    }
}

async function scanFiles() {
    showLoading();
    
    try {
        const files = await ipcRenderer.invoke('scan-files', currentFolder);
        allFiles = files;
        filteredFiles = [...allFiles];
        
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
        <div class="file-name" title="${file.name}">${file.name}</div>
        <div class="file-info">
            大小: ${fileSize} | 修改时间: ${modifiedDate}
        </div>
        <div class="file-tags">
            ${fileTags.map(tag => `<span class="file-tag">${tag}</span>`).join('')}
        </div>
        <div class="file-actions">
            <button class="btn btn-small btn-preview" onclick="previewFile('${file.path.replace(/\\/g, '\\\\')}')">预览</button>
            <button class="btn btn-small btn-edit" onclick="editTags('${file.path.replace(/\\/g, '\\\\')}')">编辑标签</button>
            <button class="btn btn-small btn-open" onclick="openFile('${file.path.replace(/\\/g, '\\\\')}')">打开文件</button>
        </div>
    `;
    
    // 添加卡片点击事件预览
    card.addEventListener('click', (e) => {
        // 如果点击的是按钮，不触发预览
        if (!e.target.closest('.file-actions')) {
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
            
            // 搜索选中的标签
            const selectedTagMatch = selectedTags.size === 0 || 
                fileTags.some(tag => selectedTags.has(tag));
            
            return (nameMatch || tagMatch) && selectedTagMatch;
        });
    }
    
    // 如果有选中的标签但没有搜索词，只按标签过滤
    if (!query && selectedTags.size > 0) {
        filteredFiles = allFiles.filter(file => {
            const fileTags = tagsData[file.path] || [];
            return fileTags.some(tag => selectedTags.has(tag));
        });
    }
    
    renderFiles();
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
}

function updateTagsPanel() {
    const allTagsSet = new Set();
    
    // 收集所有标签
    Object.values(tagsData).forEach(tags => {
        tags.forEach(tag => allTagsSet.add(tag));
    });
    
    allTagsEl.innerHTML = '';
    
    Array.from(allTagsSet).sort().forEach(tag => {
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
    previewFileName.textContent = file.name;
    previewCounter.textContent = `${currentPreviewIndex + 1} / ${previewFiles.length}`;
    
    // 显示当前文件的标签
    updatePreviewTags(file);
    
    // 显示加载状态
    previewLoading.classList.remove('hidden');
    previewImage.classList.add('hidden');
    
    // 显示模态框
    previewModal.classList.remove('hidden');
    
    try {
        // 获取PPT预览
        const result = await ipcRenderer.invoke('get-ppt-preview', file.path);
        
        if (result.success) {
            // 成功获取图片预览
            previewImage.src = result.data;
            previewImage.classList.remove('hidden');
        } else if (result.svg) {
            // 显示SVG（安装提示或错误信息）
            const svgDataUrl = `data:image/svg+xml;base64,${btoa(result.svg)}`;
            previewImage.src = svgDataUrl;
            previewImage.classList.remove('hidden');
        } else {
            // 其他错误情况
            previewImage.src = '';
            previewImage.alt = result.error || '无法生成预览';
            previewImage.classList.remove('hidden');
        }
    } catch (error) {
        console.error('获取预览失败:', error);
        previewImage.src = '';
        previewImage.alt = '预览加载失败';
        previewImage.classList.remove('hidden');
    } finally {
        previewLoading.classList.add('hidden');
    }
    
    // 更新导航按钮状态（循环模式下始终可用，除非只有一张图片）
    const hasMultipleFiles = previewFiles.length > 1;
    prevBtn.disabled = !hasMultipleFiles;
    nextBtn.disabled = !hasMultipleFiles;
}

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

function closePreviewModal() {
    previewModal.classList.add('hidden');
    previewImage.src = '';
    currentPreviewIndex = 0;
    previewFiles = [];
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
        previewTagsEl.innerHTML = '<span style="color: #999; font-style: italic;">暂无标签</span>';
    } else {
        fileTags.forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = 'tag';
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
        cachePathInput.value = settings.cachePath || '';
        tagsPathInput.value = settings.tagsPath || '';
    } catch (error) {
        console.error('加载当前设置失败:', error);
        cachePathInput.value = '';
        tagsPathInput.value = '';
    }
}

async function selectCachePath() {
    try {
        const path = await ipcRenderer.invoke('select-cache-path');
        if (path) {
            cachePathInput.value = path;
        }
    } catch (error) {
        console.error('选择缓存路径失败:', error);
        alert('选择缓存路径失败');
    }
}

async function selectTagsPath() {
    try {
        const path = await ipcRenderer.invoke('select-tags-path');
        if (path) {
            tagsPathInput.value = path;
        }
    } catch (error) {
        console.error('选择标签路径失败:', error);
        alert('选择标签路径失败');
    }
}

async function resetCachePath() {
    try {
        const result = await ipcRenderer.invoke('reset-cache-path');
        if (result.success) {
            cachePathInput.value = result.path;
            showToast('缓存路径已重置为默认值', 'success');
        } else {
            showToast('重置缓存路径失败', 'error');
        }
    } catch (error) {
        console.error('重置缓存路径失败:', error);
        showToast('重置缓存路径失败', 'error');
    }
}

async function resetTagsPath() {
    try {
        const result = await ipcRenderer.invoke('reset-tags-path');
        if (result.success) {
            tagsPathInput.value = result.path;
            showToast('标签文件路径已重置为默认值', 'success');
        } else {
            showToast('重置标签文件路径失败', 'error');
        }
    } catch (error) {
        console.error('重置标签文件路径失败:', error);
        showToast('重置标签文件路径失败', 'error');
    }
}

// 冒泡提示功能
function showToast(message, type = 'success', duration = 4000) {
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
            cachePath: cachePathInput.value.trim() || null,
            tagsPath: tagsPathInput.value.trim() || null
        };
        
        const result = await ipcRenderer.invoke('save-settings', settings);
        if (result.success) {
            let message = '设置保存成功！';
            
            // 只有在缓存路径真正改变且成功迁移时才显示迁移提示
            if (result.cachePathChanged && result.cacheMigrated) {
                message += '\n\n已自动迁移您的原有缓存数据到新位置';
            }
            
            // 只有在路径真正改变时才提示重启
            if (result.cachePathChanged) {
                message += '\n\n注意：路径更改将在下次启动应用时生效';
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
            <div class="file-name" title="${file.name}">${file.name}</div>
            <div class="file-info">
                大小: ${fileSize} | 修改时间: ${modifiedDate}
            </div>
            <div class="file-tags">
                ${fileTags.map(tag => `<span class="file-tag">${tag}</span>`).join('')}
            </div>
        </div>
        <div class="file-actions">
            <button class="btn btn-small btn-preview" onclick="previewFile('${file.path.replace(/\\/g, '\\\\')}')">预览</button>
            <button class="btn btn-small btn-edit" onclick="editTags('${file.path.replace(/\\/g, '\\\\')}')">编辑标签</button>
            <button class="btn btn-small btn-open" onclick="openFile('${file.path.replace(/\\/g, '\\\\')}')">打开文件</button>
        </div>
    `;
    
    // 添加卡片点击事件预览
    card.addEventListener('click', (e) => {
        // 如果点击的是按钮，不触发预览
        if (!e.target.closest('.file-actions')) {
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

// 全局变量存储更新信息
let updateInfo = null;
// 全局变量跟踪下载状态
let isDownloading = false;

// 检查更新
async function checkForUpdates() {
    // 如果正在下载更新，禁止重复检查
    if (isDownloading) {
        showToast('正在下载更新，请稍候...', 'warning');
        return;
    }
    
    // 更新UI状态
    updateStatusEl.textContent = '检查中...';
    updateStatusEl.className = 'update-status checking';
    checkUpdateBtn.disabled = true;
    checkUpdateBtn.textContent = '检查中...';
    downloadUpdateBtn.classList.add('hidden');
    updateDetailsEl.classList.add('hidden');
    
    try {
        const result = await ipcRenderer.invoke('check-for-updates');
        
        if (result.success) {
            latestVersionEl.textContent = result.latestVersion;
            updateInfo = result; // 保存更新信息
            
            if (result.hasUpdate) {
                // 有更新可用
                updateStatusEl.textContent = '有新版本';
                updateStatusEl.className = 'update-status update-available';
                downloadUpdateBtn.classList.remove('hidden');
                
                // 根据是否有直接下载链接更新按钮文本
                if (result.installerUrl) {
                    downloadUpdateBtn.textContent = '自动下载安装';
                    downloadUpdateBtn.onclick = () => downloadAndInstallUpdate();
                } else {
                    downloadUpdateBtn.textContent = '前往下载页面';
                    downloadUpdateBtn.onclick = () => downloadUpdate(result.downloadUrl);
                }
                
                // 显示更新详情
                if (result.releaseNotes) {
                    releaseNotesEl.textContent = result.releaseNotes;
                    publishTimeEl.textContent = new Date(result.publishedAt).toLocaleString('zh-CN');
                    updateDetailsEl.classList.remove('hidden');
                }
                
            } else {
                // 已是最新版本
                updateStatusEl.textContent = '已是最新';
                updateStatusEl.className = 'update-status up-to-date';
            }
        } else {
            // 检查失败
            updateStatusEl.textContent = '检查失败';
            updateStatusEl.className = 'update-status error';
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
        updateStatusEl.textContent = '检查失败';
        updateStatusEl.className = 'update-status error';
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

// 监听下载进度事件
ipcRenderer.on('download-progress', (event, progressData) => {
    const { status, progress, message } = progressData;
    
    switch (status) {
        case 'started':
            downloadUpdateBtn.textContent = '开始下载...';
            updateStatusEl.textContent = message;
            // 确保按钮保持禁用状态
            downloadUpdateBtn.disabled = true;
            if (checkUpdateBtn) {
                checkUpdateBtn.disabled = true;
            }
            break;
        case 'downloading':
            downloadUpdateBtn.textContent = `下载中 ${progress}%`;
            updateStatusEl.textContent = message;
            // 确保按钮保持禁用状态
            downloadUpdateBtn.disabled = true;
            if (checkUpdateBtn) {
                checkUpdateBtn.disabled = true;
            }
            break;
        case 'completed':
            downloadUpdateBtn.textContent = '启动安装...';
            updateStatusEl.textContent = message;
            // 下载完成，即将退出应用，保持按钮禁用
            downloadUpdateBtn.disabled = true;
            if (checkUpdateBtn) {
                checkUpdateBtn.disabled = true;
            }
            break;
        case 'error':
            downloadUpdateBtn.textContent = '下载失败';
            updateStatusEl.textContent = message;
            showToast(message, 'error');
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
    // 初始化版本信息
    initVersionInfo();
    // 显示模态框
    if (updateModal) {
        updateModal.classList.remove('hidden');
    }
}

function closeUpdateModal() {
    if (updateModal) {
        updateModal.classList.add('hidden');
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
                console.log('发现新版本，添加NEW标识');
                // 如果有更新，在检查更新按钮上添加new标识
                addNewBadgeToUpdateButton();
                
                // 更新UI状态
                if (updateStatusEl) {
                    updateStatusEl.textContent = '有新版本';
                    updateStatusEl.className = 'update-status update-available';
                }
                
                // 显示一个简单的提示
                showToast(`发现新版本 v${result.latestVersion}，点击"检查更新"按钮查看详情`, 'info', 8000);
            } else {
                console.log('已是最新版本');
                // 更新UI状态为最新版本
                if (updateStatusEl) {
                    updateStatusEl.textContent = '已是最新';
                    updateStatusEl.className = 'update-status up-to-date';
                }
            }
        } else {
            console.log('检查更新失败:', result.error);
            // 更新UI状态为检查失败
            if (updateStatusEl) {
                updateStatusEl.textContent = '检查失败';
                updateStatusEl.className = 'update-status error';
            }
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
        // 更新UI状态为检查失败
        if (updateStatusEl) {
            updateStatusEl.textContent = '检查失败';
            updateStatusEl.className = 'update-status error';
        }
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
    // 处理帮助页面中的指南链接（外部打开）
    if (event.target.classList.contains('github-token-link') && event.target.dataset.action === 'open-github-token-guide') {
        event.preventDefault();
        try {
            // 调用主进程打开GitHub Token配置指南文件
            await ipcRenderer.invoke('open-github-token-guide');
        } catch (error) {
            console.error('打开GitHub Token配置指南失败:', error);
            showToast('无法打开配置指南文件，请查看应用目录下的 GITHUB_TOKEN_SETUP.md 文件', 'error');
        }
    }
    
    // 处理设置页面中的指南链接（应用内打开）
    if (event.target.classList.contains('github-token-guide-link') && event.target.dataset.action === 'open-guide') {
        event.preventDefault();
        showGithubGuideModal();
    }
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
});