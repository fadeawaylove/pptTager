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
        
        // 计算总耗时
        const totalTime = Date.now() - startTime;
        
        // 如果任务完成太快，稍微延迟以确保用户看到启动画面
        const minDisplayTime = 300;
        if (totalTime < minDisplayTime) {
            const waitTime = minDisplayTime - totalTime;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
    } catch (error) {
        console.error('初始化过程中出错:', error);
        // 即使出错也要确保最小显示时间
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime < 800) {
            await new Promise(resolve => setTimeout(resolve, 800 - elapsedTime));
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
    
    // 更新导航按钮状态
    prevBtn.disabled = currentPreviewIndex === 0;
    nextBtn.disabled = currentPreviewIndex === previewFiles.length - 1;
}

function showPrevPreview() {
    if (currentPreviewIndex > 0) {
        currentPreviewIndex--;
        showPreview();
    }
}

function showNextPreview() {
    if (currentPreviewIndex < previewFiles.length - 1) {
        currentPreviewIndex++;
        showPreview();
    }
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

// 版本检查相关元素
const currentVersionEl = document.getElementById('currentVersion');
const latestVersionEl = document.getElementById('latestVersion');
const updateStatusEl = document.getElementById('updateStatus');
const checkUpdateBtn = document.getElementById('checkUpdateBtn');
const downloadUpdateBtn = document.getElementById('downloadUpdateBtn');
const updateDetailsEl = document.getElementById('updateDetails');
const releaseNotesEl = document.getElementById('releaseNotes');
const publishTimeEl = document.getElementById('publishTime');

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

// 检查更新
async function checkForUpdates() {
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
            
            // 显示错误信息
            showToast('检查更新失败: ' + (result.error || '网络连接错误'), 'error');
        }
    } catch (error) {
        console.error('检查更新失败:', error);
        updateStatusEl.textContent = '检查失败';
        updateStatusEl.className = 'update-status error';
        latestVersionEl.textContent = '检查失败';
        showToast('检查更新失败: ' + error.message, 'error');
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
        // 禁用下载按钮
        downloadUpdateBtn.disabled = true;
        downloadUpdateBtn.textContent = '准备下载...';
        
        // 调用主进程下载并安装
        const result = await ipcRenderer.invoke('download-and-install-update', updateInfo.installerUrl);
        
        if (result.success) {
            showToast(result.message, 'success');
        } else {
            showToast('下载安装失败: ' + (result.error || '未知错误'), 'error');
            // 恢复按钮状态
            downloadUpdateBtn.disabled = false;
            downloadUpdateBtn.textContent = '自动下载安装';
        }
    } catch (error) {
        console.error('下载安装失败:', error);
        showToast('下载安装失败: ' + error.message, 'error');
        // 恢复按钮状态
        downloadUpdateBtn.disabled = false;
        downloadUpdateBtn.textContent = '自动下载安装';
    }
}

// 监听下载进度事件
ipcRenderer.on('download-progress', (event, progressData) => {
    const { status, progress, message } = progressData;
    
    switch (status) {
        case 'started':
            downloadUpdateBtn.textContent = '开始下载...';
            updateStatusEl.textContent = message;
            break;
        case 'downloading':
            downloadUpdateBtn.textContent = `下载中 ${progress}%`;
            updateStatusEl.textContent = message;
            break;
        case 'completed':
            downloadUpdateBtn.textContent = '启动安装...';
            updateStatusEl.textContent = message;
            break;
        case 'error':
            downloadUpdateBtn.textContent = '下载失败';
            updateStatusEl.textContent = message;
            showToast(message, 'error');
            // 恢复按钮状态
            setTimeout(() => {
                downloadUpdateBtn.disabled = false;
                downloadUpdateBtn.textContent = '自动下载安装';
            }, 3000);
            break;
    }
});

// 修改showSettingsModal函数以包含版本信息初始化和自动检查更新
function showSettingsModal() {
    loadCurrentSettings();
    settingsModal.classList.remove('hidden');
    // 初始化版本信息
    initVersionInfo();
    // 自动检查更新
    setTimeout(() => {
        checkForUpdates();
    }, 500);
}

// 绑定版本检查事件
if (checkUpdateBtn) {
    checkUpdateBtn.addEventListener('click', checkForUpdates);
}