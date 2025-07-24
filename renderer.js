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

// 帮助相关元素
const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const closeHelpBtn = document.getElementById('closeHelp');

// 模态框元素
const tagModal = document.getElementById('tagModal');
const closeModalBtn = document.getElementById('closeModal');
const modalFileName = document.getElementById('modalFileName');
const tagInput = document.getElementById('tagInput');
const addTagBtn = document.getElementById('addTag');
const currentTagsEl = document.getElementById('currentTags');
const saveTagsBtn = document.getElementById('saveTagsBtn');
const cancelBtn = document.getElementById('cancelBtn');

// 预览模态框元素
const previewModal = document.getElementById('previewModal');
const closePreviewBtn = document.getElementById('closePreview');
const previewImage = document.getElementById('previewImage');
const previewFileName = document.getElementById('previewFileName');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const previewCounter = document.getElementById('previewCounter');
const previewLoading = document.getElementById('previewLoading');

// 初始化
init();

async function init() {
    // 加载已保存的标签数据
    tagsData = await ipcRenderer.invoke('load-tags');
    
    // 绑定事件
    bindEvents();
    
    // 尝试加载上次选择的文件夹
    const lastFolder = await ipcRenderer.invoke('get-last-folder');
    if (lastFolder) {
        currentFolder = lastFolder;
        currentFolderEl.textContent = lastFolder;
        await scanFiles();
    } else {
        // 显示空状态
        showEmptyState();
    }
    
    // 更新统计信息
    updateStats();
    
    // 更新标签面板
    updateTagsPanel();
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
            addTag();
        }
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
        await scanFiles();
    }
}

async function scanFiles() {
    showLoading();
    
    try {
        allFiles = await ipcRenderer.invoke('scan-ppt-files', currentFolder);
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

function renderFiles() {
    hideLoading();
    hideEmptyState();
    
    filesListEl.innerHTML = '';
    
    filteredFiles.forEach(file => {
        const fileCard = createFileCard(file);
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
        <div class="file-icon">📄</div>
        <div class="file-name">${file.name}</div>
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

async function saveTags() {
    const success = await ipcRenderer.invoke('save-tags', tagsData);
    if (success) {
        closeModal();
        renderFiles();
        updateStats();
        updateTagsPanel();
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

// 全局函数，供HTML调用
window.editTags = editTags;
window.openFile = openFile;
window.removeTag = removeTag;
window.previewFile = previewFile;