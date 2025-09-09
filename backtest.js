const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// 全局变量
let chart = null;
let candlestickSeries = null;
let barCountSeries = null;
let ema20Series = null;
let ema220Series = null;

let klineData = [];
let currentIndex = 0;
let isPlaying = false;
let playInterval = null;
let playSpeed = 3;
let currentDrawingTool = null;
let drawings = [];

// 模式管理
let maskCanvas = null;
let maskCtx = null;
// Canvas覆盖层相关变量
let overlayCanvas = null;
let overlayCtx = null;
let lineStartPoint = null;
let isDrawing = false;
let lastThrottleTime = 0;
const THROTTLE_INTERVAL = 50; // 50ms节流间隔

// 创建Canvas覆盖层
function createCanvasOverlay(container) {
    // 创建Canvas元素
    overlayCanvas = document.createElement('canvas');
    overlayCanvas.style.position = 'absolute';
    overlayCanvas.style.top = '0';
    overlayCanvas.style.left = '0';
    overlayCanvas.style.pointerEvents = 'none'; // 让鼠标事件穿透到图表
    overlayCanvas.style.zIndex = '10';
    
    // 设置Canvas尺寸
    overlayCanvas.width = container.clientWidth;
    overlayCanvas.height = container.clientHeight;
    
    // 获取绘制上下文
    overlayCtx = overlayCanvas.getContext('2d');
    
    // 将Canvas添加到容器
    container.appendChild(overlayCanvas);
    
    // 监听容器尺寸变化
    const resizeObserver = new ResizeObserver(() => {
        overlayCanvas.width = container.clientWidth;
        overlayCanvas.height = container.clientHeight;
    });
    resizeObserver.observe(container);
}

// 创建遮罩画布
function createMaskCanvas(container) {
    maskCanvas = document.createElement('canvas');
    maskCanvas.style.position = 'absolute';
    maskCanvas.style.top = '0';
    maskCanvas.style.left = '0';
    maskCanvas.style.pointerEvents = 'none';
    maskCanvas.style.zIndex = '5'; // 在图表之上，绘图层之下
    
    maskCtx = maskCanvas.getContext('2d');
    container.appendChild(maskCanvas);
    
    function resizeMaskCanvas() {
        const rect = container.getBoundingClientRect();
        maskCanvas.width = rect.width;
        maskCanvas.height = rect.height;
        maskCanvas.style.width = rect.width + 'px';
        maskCanvas.style.height = rect.height + 'px';
    }
    
    resizeMaskCanvas();
    window.addEventListener('resize', resizeMaskCanvas);
}

// 更新遮罩
function updateMask() {
    if (!maskCanvas || !maskCtx || !klineData.length) {
        return;
    }
    
    // 清除之前的遮罩
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    
    if (currentIndex >= klineData.length - 1) return;
    
    // 获取当前K线的时间坐标
    const currentTime = klineData[currentIndex].time;
    const currentX = chart.timeScale().timeToCoordinate(currentTime);
    
    if (currentX !== null) {
        // 绘制遮罩（从当前K线右侧到图表右边缘）
        maskCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        maskCtx.fillRect(currentX + 10, 0, maskCanvas.width - currentX - 10, maskCanvas.height);
        
        // 添加边界线
        maskCtx.strokeStyle = '#007bff';
        maskCtx.lineWidth = 2;
        maskCtx.beginPath();
        maskCtx.moveTo(currentX + 10, 0);
        maskCtx.lineTo(currentX + 10, maskCanvas.height);
        maskCtx.stroke();
    }
}

// 在Canvas上绘制临时线段
function drawTempLineOnCanvas(startX, startY, endX, endY) {
    if (!overlayCtx) return;
    
    // 清除Canvas
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    // 设置线段样式
    overlayCtx.strokeStyle = '#ffff00';
    overlayCtx.lineWidth = 2;
    overlayCtx.setLineDash([]);
    
    // 绘制线段
    overlayCtx.beginPath();
    overlayCtx.moveTo(startX, startY);
    overlayCtx.lineTo(endX, endY);
    overlayCtx.stroke();
}

// 清除Canvas上的临时线段
function clearTempLine() {
    if (!overlayCtx) return;
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

// 节流函数
function throttle(func, interval) {
    return function(...args) {
        const now = Date.now();
        if (now - lastThrottleTime >= interval) {
            lastThrottleTime = now;
            func.apply(this, args);
        }
    };
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    initializeChart();
    setupEventListeners();
    await loadData();
    updateUI();
});

// 返回主页
function goBack() {
    window.location.href = 'index.html';
}

// 移除不再使用的currentLine变量

// 处理Canvas绘图逻辑
function handleCanvasDrawing(param) {
    if (!currentDrawingTool || !param.point) return;
    
    if (currentDrawingTool === 'line') {
        if (!isDrawing) {
            // 开始绘制 - 记录起始点
            const startPrice = candlestickSeries.coordinateToPrice(param.point.y);
            // 如果param.time为undefined，使用坐标转换获取时间
            const startTime = param.time || chart.timeScale().coordinateToTime(param.point.x);
            
            // 验证时间和价格数据有效性
            if (!startTime || startPrice === null || startPrice === undefined || !isFinite(startPrice)) {
                console.error('Invalid start data:', { time: startTime, price: startPrice });
                updateStatus('绘制失败：请在有效的图表区域内点击');
                return;
            }
            
            lineStartPoint = {
                x: param.point.x,
                y: param.point.y,
                time: startTime,
                price: startPrice
            };
            isDrawing = true;
            
            console.log('Canvas line start:', lineStartPoint);
            updateStatus('请选择终点绘制线段');
        } else {
            // 结束绘制 - 创建最终LineSeries
            const endPrice = candlestickSeries.coordinateToPrice(param.point.y);
            // 如果param.time为undefined，使用坐标转换获取时间
            const endTime = param.time || chart.timeScale().coordinateToTime(param.point.x);
            
            // 验证时间和价格数据有效性
            if (!endTime || endPrice === null || endPrice === undefined || !isFinite(endPrice)) {
                console.error('Invalid end data:', { time: endTime, price: endPrice });
                updateStatus('绘制失败：请在有效的图表区域内点击');
                isDrawing = false;
                clearTempLine();
                return;
            }
            
            const endPoint = {
                x: param.point.x,
                y: param.point.y,
                time: endTime,
                price: endPrice
            };
            
            console.log('Canvas line end:', endPoint);
            
            // 立即重置绘图状态，停止Canvas实时绘制
            isDrawing = false;
            
            // 立即清除Canvas临时线段，避免与LineSeries重叠
            clearTempLine();
            
            // 等待一帧确保Canvas清除完成
            requestAnimationFrame(() => {
                // 验证数据有效性，避免null值错误
                if (!lineStartPoint.time || !endPoint.time || 
                    lineStartPoint.price === null || endPoint.price === null) {
                    console.error('Invalid line data:', { lineStartPoint, endPoint });
                    updateStatus('绘制失败：数据无效');
                    return;
                }
                
                // 创建最终的LineSeries
                const lineData = [
                    { time: lineStartPoint.time, value: lineStartPoint.price },
                    { time: endPoint.time, value: endPoint.price }
                ];
                
                console.log('Creating LineSeries with data:', lineData);
                
                const lineSeries = chart.addLineSeries({
                    color: '#ffff00', // 与临时线段颜色保持一致
                    lineWidth: 2,
                    priceLineVisible: false, // 不显示价格线
                    lastValueVisible: false, // 不显示最后价格标签
                    autoscaleInfoProvider: () => null // 不影响y轴缩放
                });
                
                lineSeries.setData(lineData);
                 
                 // 保存绘图信息
                 drawings.push({
                     type: 'line',
                     series: lineSeries,
                     data: lineData,
                     startPoint: lineStartPoint,
                     endPoint: endPoint
                 });
            
                // 重置绘图状态
                lineStartPoint = null;
                
                console.log('Canvas line created:', drawings[drawings.length - 1]);
                updateStatus('线段绘制完成');
                
                // 自动取消选择画线工具
                currentDrawingTool = null;
                document.querySelectorAll('.chart-tool-item').forEach(t => t.classList.remove('active'));
            }); // 结束requestAnimationFrame回调
        }
    }

    // 原来的箭头标记
    if (currentDrawingTool === 'arrow-up' || currentDrawingTool === 'arrow-down') {
        const price = candlestickSeries.coordinateToPrice(param.point.y);
        const time = chart.timeScale().coordinateToTime(param.point.x);
        
        if (!price || !time) return;
        
        const marker = {
            time: time,
            position: currentDrawingTool === 'arrow-up' ? 'belowBar' : 'aboveBar',
            color: currentDrawingTool === 'arrow-up' ? '#4bffb5' : '#ff4976',
            shape: currentDrawingTool === 'arrow-up' ? 'arrowUp' : 'arrowDown',
            text: currentDrawingTool === 'arrow-up' ? '上涨' : '下跌'
        };
        
        candlestickSeries.setMarkers([...candlestickSeries.markers || [], marker]);
        drawings.push(marker);
    }
}


// 清除绘图
function clearDrawings() {
    // 这里可以添加清除绘图的逻辑
    console.log('清除所有绘图');
}

// 选择绘图工具
function selectDrawingTool(toolType) {
    console.log('选择绘图工具:', toolType);
    // 这里可以添加绘图工具的逻辑
}

// 随机日期函数
function randomDate() {
    if (!klineData || klineData.length === 0) {
        updateStatus('没有数据可用');
        return;
    }
    
    // 找到所有bar_count=1的数据点（开盘时刻）
    const openingBars = [];
    for (let i = 0; i < klineData.length; i++) {
        if (klineData[i].barCount === 1) {
            openingBars.push(i);
        }
    }
    
    if (openingBars.length === 0) {
        // 如果没有找到bar_count=1的数据，使用原来的随机逻辑
        const randomIndex = Math.floor(Math.random() * klineData.length);
        currentIndex = randomIndex;
    } else {
        // 随机选择一个开盘时刻
        const randomOpeningIndex = openingBars[Math.floor(Math.random() * openingBars.length)];
        
        // 设置为该开盘时刻前一根K线的位置（不包括bar_count=1这根K线）
        // 这样updateChart会显示从0到randomOpeningIndex-1的所有K线
        currentIndex = Math.max(0, randomOpeningIndex - 1);
    }
    
    updateChart();
    updateInfo();
    updateProgress();
    
    const startDate = new Date(klineData[currentIndex].time * 1000);
    updateStatus(`随机复盘: ${startDate.toLocaleString()}`);
}

// 上一根K线
function prevCandle() {
    if (!klineData || klineData.length === 0) return;
    if (currentIndex > 0) {
        currentIndex--;
        updateChart();
        updateInfo();
        updateProgress();
    }
}

// 下一根K线
function nextCandle() {
    console.log('nextCandle函数被调用');
    console.log('klineData:', klineData);
    console.log('klineData.length:', klineData ? klineData.length : 'undefined');
    console.log('currentIndex:', currentIndex);
    
    if (!klineData || klineData.length === 0) {
        console.log('数据为空，退出函数');
        return;
    }
    
    if (currentIndex < klineData.length - 1) {
        console.log('切换到下一根K线，从', currentIndex, '到', currentIndex + 1);
        currentIndex++;
        console.log('调用updateChart()');
        updateChart();
        console.log('调用updateInfo()');
        updateInfo();
        console.log('调用updateProgress()');
        updateProgress();
        console.log('nextCandle函数执行完成');
    } else {
        console.log('已经是最后一根K线，无法继续');
    }
}

// 播放/暂停切换
function togglePlay() {
    if (isPlaying) {
        pausePlayback();
    } else {
        startPlayback();
    }
}

// 开始播放
function startPlayback() {
    if (!klineData || klineData.length === 0) return;
    
    isPlaying = true;
    const playBtn = document.getElementById('playPauseBtn');
    if (playBtn) {
        playBtn.innerHTML = '<span>⏸️ 暂停</span>';
    }
    
    playInterval = setInterval(() => {
        if (currentIndex < klineData.length - 1) {
            currentIndex++;
            updateChart();
            updateInfo();
            updateProgress();
        } else {
            pausePlayback();
        }
    }, 1000 / playSpeed);
}

// 暂停播放
function pausePlayback() {
    isPlaying = false;
    const playBtn = document.getElementById('playPauseBtn');
    if (playBtn) {
        playBtn.innerHTML = '<span>▶️ 播放</span>';
    }
    
    if (playInterval) {
        clearInterval(playInterval);
        playInterval = null;
    }
}

// 跳转到指定日期
function jumpToDate() {
    const dateInput = document.getElementById('dateInput');
    if (!dateInput || !klineData || klineData.length === 0) return;
    
    const selectedDate = new Date(dateInput.value);
    const selectedTimestamp = selectedDate.getTime() / 1000;
    
    // 找到最接近的K线
    let closestIndex = 0;
    let minDiff = Math.abs(klineData[0].time - selectedTimestamp);
    
    for (let i = 1; i < klineData.length; i++) {
        const diff = Math.abs(klineData[i].time - selectedTimestamp);
        if (diff < minDiff) {
            minDiff = diff;
            closestIndex = i;
        }
    }
    
    currentIndex = closestIndex;
    updateChart();
    updateInfo();
    updateProgress();
}

// 初始化图表
function initializeChart() {
    const container = document.getElementById('chartContainer');
    
    // 创建Canvas覆盖层
    createCanvasOverlay(container);
    
    // 创建遮罩画布
    createMaskCanvas(container);
    
    chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: {
            background: { color: '#ffffff' },
            textColor: '#333333',
        },
        grid: {
            vertLines: { color: '#e0e0e0' },
            horzLines: { color: '#e0e0e0' },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
        },
        rightPriceScale: {
            borderColor: '#e0e0e0',
            scaleMargins: {
                top: 0.05,    // 上边距10%
                bottom: 0.05, // 下边距10%
            },
        },
        timeScale: {
            borderColor: '#e0e0e0',
            timeVisible: true,
            secondsVisible: false,
            rightOffset: 12,
            barSpacing: 12,
            fixLeftEdge: false,
            fixRightEdge: false,
            tickMarkFormatter: (time) => {
                const date = new Date(time * 1000);
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                const day = date.getDate().toString().padStart(2, '0');
                const hours = date.getHours().toString().padStart(2, '0');
                const minutes = date.getMinutes().toString().padStart(2, '0');
                return `${month}-${day} ${hours}:${minutes}`;
            },
        },
        // 设置时区为上海时间，让UTC时间戳按本地时间显示
        localization: {
            locale: 'zh-CN',
            timeFormatter: (time) => {
                const date = new Date(time * 1000);
                return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
            },
        },
    });



    candlestickSeries = chart.addCandlestickSeries({
        upColor: '#ffffff',
        downColor: '#000000',
        borderDownColor: '#000000',
        borderUpColor: '#000000',
        wickDownColor: '#000000',
        wickUpColor: '#000000',
         borderVisible: true,
    borderWidth: 4,   // 👈 调节K线边框宽度，默认 1
    // 影线宽度
    wickVisible: true,
    wickWidth: 4,
        priceFormat: {
            type: 'price',
            precision: 0,   // 小数位数
            minMove: 1      // 最小价格跳动单位
        }
    });

    // 添加EMA20线系列 - 细红线
    ema20Series = chart.addLineSeries({
        color: '#FF0000', // 红色
        lineWidth: 1, // 细线
        priceLineVisible: false, // 不显示价格线
        lastValueVisible: false, // 不显示最后数值
        crosshairMarkerVisible: false, // 不显示十字线交点
        autoscaleInfoProvider: () => null, // 不参与自动缩放
    });

    // 添加EMA220线系列 - 灰色实线
    ema220Series = chart.addLineSeries({
        color: '#888888', // 灰色
        lineWidth: 1,
        priceLineVisible: false, // 不显示价格线
        lastValueVisible: false, // 不显示最后数值
        crosshairMarkerVisible: false, // 不显示十字线交点
        autoscaleInfoProvider: () => null, // 不参与自动缩放
    });

    // bar_count将通过文本标记显示，不需要独立的线系列

    // 响应式调整
    window.addEventListener('resize', () => {
        chart.applyOptions({ 
            width: container.clientWidth,
            height: container.clientHeight 
        });
    });

    // 图表点击事件（用于绘图）
    chart.subscribeClick((param) => {
        if (currentDrawingTool && param.point) {
            handleCanvasDrawing(param);
        }
    });

    // 价格变化监听
    candlestickSeries.subscribeDataChanged(() => {
        updateCurrentPrice();
    });
    
    // 十字线移动事件监听 - 使用节流优化性能
    const throttledCrosshairMove = throttle((param) => {
        updateCrosshairInfo(param);
        
        // 处理Canvas实时绘制
        if (currentDrawingTool === 'line' && isDrawing && lineStartPoint && param.point) {
            const startX = lineStartPoint.x;
            const startY = lineStartPoint.y;
            const endX = param.point.x;
            const endY = param.point.y;
            
            drawTempLineOnCanvas(startX, startY, endX, endY);
        }
    }, THROTTLE_INTERVAL);
    
    chart.subscribeCrosshairMove(throttledCrosshairMove);
    
    // 监听时间轴变化，当用户拖动或缩放图表时更新遮罩
    chart.timeScale().subscribeVisibleTimeRangeChange(() => {
        // 使用节流避免频繁更新
        setTimeout(() => {
            updateMask();
        }, 10);
    });
}

// 加载CSV数据
async function loadData() {
    try {
        console.log('开始加载数据...');
        updateStatus('正在加载数据...');
        const csvPath = path.join(__dirname, 'data_with_ema.csv');
        console.log('CSV文件路径:', csvPath);
        
        if (!fs.existsSync(csvPath)) {
            throw new Error('数据文件不存在: data_with_ema.csv');
        }

        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        const lines = csvContent.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
            throw new Error('CSV文件格式错误或数据为空');
        }

        // 解析CSV头部
        const headers = lines[0].split(',').map(h => h.trim());
        console.log('CSV Headers:', headers);

        // 解析数据行
        klineData = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            if (values.length >= 6) {
                try {
                    // 修复：使用第8列的datetime而不是第0列的index
                    // 直接用JS Date解析，配合timezone配置显示正确时间
                    const originalDate = new Date(values[8].trim());
                    const timestamp = Math.floor(originalDate.getTime() / 1000);
                    const open = parseFloat(values[1]);
                    const close = parseFloat(values[2]);
                    const high = parseFloat(values[3]);
                    const low = parseFloat(values[4]);
                    const volume = parseFloat(values[5]);
                    const barCount = parseFloat(values[7]); // 解析bar_count数据
                    const ema20 = parseFloat(values[9]); // 解析EMA20数据
                    const ema220 = parseFloat(values[10]); // 解析EMA220数据

                    if (!isNaN(timestamp) && !isNaN(open) && !isNaN(high) && !isNaN(low) && !isNaN(close)) {
                        klineData.push({
                            time: timestamp,
                            open: open,
                            high: high,
                            low: low,
                            close: close,
                            volume: volume || 0,
                            barCount: barCount || 0,
                            ema20: ema20 || null,
                            ema220: ema220 || null
                        });
                    }
                } catch (e) {
                    console.warn(`跳过无效数据行 ${i}:`, values[0]);
                }
            }
        }

        // 按时间排序
        klineData.sort((a, b) => a.time - b.time);
        
        console.log(`成功加载 ${klineData.length} 条K线数据`);
        
        if (klineData.length === 0) {
            throw new Error('没有有效的K线数据');
        }




        
        // 初始化：设置为最后一根K线
        currentIndex = klineData.length - 1;
        updateChart();
        updateStatus('数据加载完成');
        
    } catch (error) {
        console.error('加载数据失败:', error);
        updateStatus(`加载失败: ${error.message}`);
        alert(`数据加载失败: ${error.message}`);
    }
}

// 更新图表显示
function updateChart() {
    if (!candlestickSeries || klineData.length === 0) return;

    // 始终显示全部数据，复盘模式通过遮罩隐藏未来K线
    const visibleData = klineData;
    
    candlestickSeries.setData(visibleData);
    
    // 添加bar_count文本标记 - 只显示偶数数字，无背景圆圈，只显示到当前索引
    if (candlestickSeries && visibleData.length > 0) {
        const markerVisibleData = visibleData.slice(0, currentIndex + 1);
        const markers = markerVisibleData
            .filter(item => item.barCount % 2 === 0) // 只显示偶数
            .map(item => {
                const isMultipleOfSix = item.barCount % 6 === 0;
                return {
                    time: item.time,
                    position: 'belowBar', // 显示在K线下方
                    color: isMultipleOfSix ? '#e91e63' : '#888888', // 6的倍数红色，其他灰色
                    shape: 'text', // 只显示文本，无背景形状
                    text: item.barCount.toString(), // 显示bar_count数字
                    size: 0 // 设置为0以移除背景形状
                };
            });
        candlestickSeries.setMarkers(markers);
    }
    
    // 更新EMA20数据 - 只显示到当前索引
    if (ema20Series && visibleData.length > 0) {
        const emaVisibleData = visibleData.slice(0, currentIndex + 1);
        const ema20Data = emaVisibleData
            .filter(item => item.ema20 !== null && !isNaN(item.ema20))
            .map(item => ({
                time: item.time,
                value: item.ema20
            }));
        ema20Series.setData(ema20Data);
    }
    
    // 更新EMA220数据 - 只显示到当前索引
    if (ema220Series && visibleData.length > 0) {
        const emaVisibleData = visibleData.slice(0, currentIndex + 1);
        const ema220Data = emaVisibleData
            .filter(item => item.ema220 !== null && !isNaN(item.ema220))
            .map(item => ({
                time: item.time,
                value: item.ema220
            }));
        ema220Series.setData(ema220Data);
    }
    
    // 设置固定的时间范围，让时间轴显示连续刻度
    if (visibleData.length === 1 && klineData.length > 0) {
        // 第一根K线时设置一个较大的时间范围，包含更多时间刻度
        const firstTime = klineData[0].time;
        const lastTime = klineData[klineData.length - 1].time;
        const timeRange = lastTime - firstTime;
        const extendedRange = timeRange * 0.1; // 扩展10%的时间范围
        
        chart.timeScale().setVisibleRange({
            from: firstTime - extendedRange,
            to: lastTime + extendedRange,
        });
    }
    // 其他情况下不调整视窗，让用户保持当前的视图位置
    
    updateCurrentTime();
    updateCurrentPrice();
    
    // 更新遮罩
    updateMask();
}

// 设置事件监听器
function setupEventListeners() {
    // 速度控制
    const speedSlider = document.getElementById('speedSlider');
    if (speedSlider) {
        speedSlider.addEventListener('input', (e) => {
            playSpeed = parseInt(e.target.value);
            const speedValue = document.getElementById('speedValue');
            if (speedValue) {
                speedValue.textContent = `${playSpeed}x`;
            }
            
            // 如果正在播放，重新设置间隔
            if (isPlaying) {
                clearInterval(playInterval);
                startPlayback();
            }
        });
    }
    
    // 日期选择
    const dateInput = document.getElementById('dateInput');
    if (dateInput) {
        dateInput.addEventListener('change', jumpToDate);
    }
    
    // 绘图工具
    document.querySelectorAll('.chart-tool-item[data-tool]').forEach(tool => {
        tool.addEventListener('click', function() {
            // 移除其他工具的active状态
            document.querySelectorAll('.chart-tool-item').forEach(t => t.classList.remove('active'));
            // 添加当前工具的active状态
            this.classList.add('active');
            
            const toolType = this.getAttribute('data-tool');
            selectDrawingTool(toolType);
        });
    });
    
    // clearDrawingsBtn元素不存在，已通过onclick直接绑定
    
    // 键盘快捷键
    document.addEventListener('keydown', handleKeyboard);
}

// 上一根K线
function previousBar() {
    if (currentIndex > 0) {
        currentIndex--;
        updateChart();
        updateUI();
    }
}

// 下一根K线
function nextBar() {
    if (currentIndex < allData.length - 1) {
        currentIndex++;
        updateChart();
        updateUI();
    }
}

// 播放/暂停
function togglePlayPause() {
    if (isPlaying) {
        stopPlayback();
    } else {
        startPlayback();
    }
}

// 开始播放
function startPlayback() {
    if (currentIndex >= allData.length - 1) {
        return;
    }
    
    isPlaying = true;
    document.getElementById('playPauseBtn').innerHTML = '⏸️ 暂停';
    
    const interval = Math.max(100, 1000 / playSpeed);
    playInterval = setInterval(() => {
        if (currentIndex < allData.length - 1) {
            currentIndex++;
            updateChart();
            updateUI();
        } else {
            stopPlayback();
        }
    }, interval);
}

// 停止播放
function stopPlayback() {
    isPlaying = false;
    if (playInterval) {
        clearInterval(playInterval);
        playInterval = null;
    }
    document.getElementById('playPauseBtn').innerHTML = '▶️ 播放';
}

// 跳转到指定日期
function jumpToDate() {
    const dateInput = document.getElementById('dateInput');
    const targetDate = new Date(dateInput.value);
    
    if (!targetDate || isNaN(targetDate.getTime())) {
        return;
    }
    
    // 设置为当天的15:00作为最后一根K线
    targetDate.setHours(15, 0, 0, 0);
    const targetTimestamp = targetDate.getTime() / 1000;
    
    // 找到最接近的K线
    let closestIndex = 0;
    let minDiff = Math.abs(klineData[0].time - targetTimestamp);
    
    for (let i = 1; i < klineData.length; i++) {
        const diff = Math.abs(klineData[i].time - targetTimestamp);
        if (diff < minDiff) {
            minDiff = diff;
            closestIndex = i;
        }
    }
    
    currentIndex = closestIndex;
    updateChart();
    updateUI();
    updateStatus(`跳转到 ${new Date(klineData[currentIndex].time * 1000).toLocaleString()}`);
}

// 跳转到随机日期
function jumpToRandomDate() {
    if (allData.length === 0) return;
    
    // 获取所有唯一日期
    const dates = new Set();
    allData.forEach(bar => {
        const date = new Date(bar.time * 1000);
        const dateStr = date.toISOString().split('T')[0];
        dates.add(dateStr);
    });
    
    const dateArray = Array.from(dates);
    const randomDate = dateArray[Math.floor(Math.random() * dateArray.length)];
    
    // 设置日期输入框并跳转
    document.getElementById('dateInput').value = randomDate;
    jumpToDate();
    
    updateStatus(`随机跳转到 ${randomDate}`);
}

// 选择绘图工具
function selectDrawingTool(tool) {
    // 清除之前的选择
    document.querySelectorAll('.drawing-tool').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (currentDrawingTool === tool) {
        // 取消选择
        currentDrawingTool = null;
        updateStatus('绘图工具已取消');
    } else {
        // 选择新工具
        currentDrawingTool = tool;
        document.querySelector(`[data-tool="${tool}"]`).classList.add('active');
        updateStatus(`已选择绘图工具: ${getToolName(tool)}`);
    }
}

// 获取工具名称
function getToolName(tool) {
    const names = {
        'line': '线段',
        'parallel': '平行线',
        'fibonacci': '斐波那契',
        'rectangle': '矩形',
        'arrow-up': '上涨箭头',
        'arrow-down': '下跌箭头'
    };
    return names[tool] || tool;
}


// 清除所有绘图
function clearAllDrawings() {
    // 删除所有LineSeries
    drawings.forEach(d => {
        if (d.series && d.series.remove) {
            d.series.remove();
        }
    });
    drawings = [];

    // 删除所有标记
    if (candlestickSeries) {
        candlestickSeries.setMarkers([]);
    }

    // 清除Canvas临时线段
    clearTempLine();
    
    // 重置绘图状态
    lineStartPoint = null;
    isDrawing = false;
    
    updateStatus('已清除所有绘图');
}


// 键盘快捷键
function handleKeyboard(e) {
    switch(e.key) {
        case 'ArrowLeft':
            e.preventDefault();
            previousBar();
            break;
        case 'ArrowRight':
            e.preventDefault();
            nextBar();
            break;
        case ' ':
            e.preventDefault();
            togglePlayPause();
            break;
        case 'r':
        case 'R':
            if (e.ctrlKey) {
                e.preventDefault();
                jumpToRandomDate();
            }
            break;
        case 'c':
        case 'C':
            if (e.ctrlKey) {
                e.preventDefault();
                clearAllDrawings();
            }
            break;
    }
}

// 更新UI显示
function updateUI() {
    updateInfo();
    updateProgress();
}

// 更新当前时间显示
function updateCurrentTime() {
    if (klineData.length > 0 && currentIndex < klineData.length) {
        const currentTime = new Date(klineData[currentIndex].time * 1000);
        // 使用明确的格式化方式，确保显示正确的时间格式
        const year = currentTime.getFullYear();
        const month = (currentTime.getMonth() + 1).toString().padStart(2, '0');
        const day = currentTime.getDate().toString().padStart(2, '0');
        const hour = currentTime.getHours().toString().padStart(2, '0');
        const minute = currentTime.getMinutes().toString().padStart(2, '0');
        document.getElementById('currentTime').textContent = `${year}/${month}/${day} ${hour}:${minute}`;
    }
}

// 更新当前价格显示
function updateCurrentPrice() {
    if (klineData.length > 0 && currentIndex < klineData.length) {
        const currentBar = klineData[currentIndex];
        document.getElementById('currentPrice').textContent = 
            `O: ${currentBar.open.toFixed(2)} H: ${currentBar.high.toFixed(2)} L: ${currentBar.low.toFixed(2)} C: ${currentBar.close.toFixed(2)}`;
    }
}

// 更新数据信息
function updateDataInfo() {
    if (klineData.length > 0) {
        document.getElementById('totalBars').textContent = klineData.length.toLocaleString();
        
        const startDate = new Date(klineData[0].time * 1000);
        const endDate = new Date(klineData[klineData.length - 1].time * 1000);
        
        document.getElementById('startDate').textContent = startDate.toLocaleDateString();
        document.getElementById('endDate').textContent = endDate.toLocaleDateString();
    }
}

// 更新状态显示
function updateStatus(message) {
    document.getElementById('statusText').textContent = message;
    console.log('Status:', message);
}

// 更新信息面板
function updateInfo() {
    if (!klineData || klineData.length === 0) return;
    
    const totalBarsElement = document.getElementById('totalBars');
    const currentBarElement = document.getElementById('currentBar');
    const currentTimeElement = document.getElementById('currentTime');
    const currentPriceElement = document.getElementById('currentPrice');
    
    if (totalBarsElement) totalBarsElement.textContent = klineData.length;
    if (currentBarElement) currentBarElement.textContent = currentIndex + 1;
    
    if (currentIndex < klineData.length) {
        const currentCandle = klineData[currentIndex];
        if (currentTimeElement) {
            const date = new Date(currentCandle.time * 1000);
            currentTimeElement.textContent = date.toLocaleString();
        }
        if (currentPriceElement) {
            currentPriceElement.textContent = currentCandle.close.toFixed(2);
        }
    }
    
    // 更新日期范围显示
    if (klineData.length > 0) {
        const startDate = new Date(klineData[0].time * 1000);
        const endDate = new Date(klineData[klineData.length - 1].time * 1000);
        const startDateElement = document.getElementById('startDate');
        const endDateElement = document.getElementById('endDate');
        if (startDateElement) startDateElement.textContent = startDate.toLocaleDateString();
        if (endDateElement) endDateElement.textContent = endDate.toLocaleDateString();
    }
    

}



// 更新进度条
function updateProgress() {
    if (!klineData || klineData.length === 0) return;
    
    const progressFill = document.getElementById('progressFill');
    if (progressFill) {
        const progress = ((currentIndex + 1) / klineData.length) * 100;
        progressFill.style.width = progress + '%';
    }
}

// 页面卸载时清理
// 更新十字线信息显示
function updateCrosshairInfo(param) {
    const crosshairInfo = document.getElementById('crosshairInfo');
    const timeInfo = document.getElementById('timeInfo');
    const highInfo = document.getElementById('highInfo');
    const lowInfo = document.getElementById('lowInfo');
    const openInfo = document.getElementById('openInfo');
    const closeInfo = document.getElementById('closeInfo');
    const rangeInfo = document.getElementById('rangeInfo');
    const ema20Info = document.getElementById('ema20Info');
    const ema220Info = document.getElementById('ema220Info');
    
    if (!param.time || !param.point) {
        crosshairInfo.style.display = 'none';
        return;
    }
    
    // 获取当前时间对应的数据
    const candleData = param.seriesData.get(candlestickSeries);
    const ema20Data = param.seriesData.get(ema20Series);
    const ema220Data = param.seriesData.get(ema220Series);
    
    if (candleData) {
        crosshairInfo.style.display = 'block';
        
        // 格式化时间
        const date = new Date(param.time * 1000);
        const timeStr = date.toLocaleString('zh-CN', { 
            timeZone: 'Asia/Shanghai',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // 计算幅度 - 最高减最低的绝对值
        const range = Math.abs(candleData.high - candleData.low).toFixed(2);
        
        // 显示各项信息
        timeInfo.textContent = timeStr;
        highInfo.innerHTML = `<span style="color: #ff6b6b;">高: ${Math.round(candleData.high)}</span>`;
        lowInfo.innerHTML = `<span style="color: #4ecdc4;">低: ${Math.round(candleData.low)}</span>`;
        openInfo.innerHTML = `开: ${Math.round(candleData.open)}`;
        closeInfo.innerHTML = `收: ${Math.round(candleData.close)}`;
        rangeInfo.innerHTML = `幅: ${range}`;
        
        // 显示EMA信息
        if (ema20Data && ema20Data.value !== null) {
            ema20Info.innerHTML = `<span style="color: #ff9500;">20: ${ema20Data.value.toFixed(2)}</span>`;
        } else {
            ema20Info.innerHTML = '<span style="color: #ff9500;">20: --</span>';
        }
        
        if (ema220Data && ema220Data.value !== null) {
            ema220Info.innerHTML = `<span style="color: #999;">220: ${ema220Data.value.toFixed(2)}</span>`;
        } else {
            ema220Info.innerHTML = '<span style="color: #999;">220: --</span>';
        }
    } else {
        crosshairInfo.style.display = 'none';
    }
}

window.addEventListener('beforeunload', () => {
    if (playInterval) {
        clearInterval(playInterval);
    }
});