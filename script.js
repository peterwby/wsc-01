// 获取DOM元素
const video = document.getElementById('video');
const barcodeResult = document.getElementById('barcode');
const productName = document.getElementById('product-name');
const manualBarcode = document.getElementById('manual-barcode');
const manualSearchButton = document.getElementById('manual-search-button');
const rescanButton = document.getElementById('rescan-button');

// 初始化ZXing解码器
const codeReader = new ZXing.BrowserMultiFormatReader();

// 跟踪视频流和解码控制
let currentVideoStream = null;
let isDecodingActive = false;

// 防抖函数：确保在指定时间内只执行一次
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 添加标志位，跟踪当前是否正在进行 API 调用
let isSearching = false;
let lastScannedCode = null;
let isScanning = false;
let scanningStatusInterval = null;

// 更新扫描状态显示
function updateScanningStatus() {
    if (!isSearching && !lastScannedCode && isDecodingActive) {
        const dots = '.'.repeat((Date.now() / 500) % 4);
        barcodeResult.textContent = `识别中${dots}`;
        productName.innerHTML = '请将条码/二维码对准摄像头';
    }
}

// 开始显示扫描状态
function startScanningStatus() {
    isScanning = true;
    updateScanningStatus();
    scanningStatusInterval = setInterval(updateScanningStatus, 500);
}

// 停止显示扫描状态
function stopScanningStatus() {
    isScanning = false;
    if (scanningStatusInterval) {
        clearInterval(scanningStatusInterval);
        scanningStatusInterval = null;
    }
}

// 停止视频流和解码
async function stopScanning() {
    isDecodingActive = false;
    stopScanningStatus();
    
    try {
        await codeReader.reset();
        if (currentVideoStream) {
            currentVideoStream.getTracks().forEach(track => track.stop());
            currentVideoStream = null;
        }
        video.srcObject = null;
    } catch (error) {
        console.error('停止扫描时出错:', error);
    }
}

// 使用防抖包装 searchAndDisplayProductInfo 函数
const debouncedSearch = debounce(async (barcode) => {
    if (isSearching) {
        console.log('已有搜索正在进行中，跳过此次请求');
        return;
    }

    if (!barcode || barcode.trim() === '') {
        alert('请输入或扫描有效的条形码。');
        return;
    }

    try {
        stopScanningStatus();
        isSearching = true;
        lastScannedCode = barcode;
        barcodeResult.textContent = barcode;
        productName.innerHTML = '查询中...';

        // 扫描成功后停止解码
        if (isDecodingActive) {
            await stopScanning();
            rescanButton.disabled = false; // 启用重新扫描按钮
        }

        const backendApiUrl = `/api/search?barcode=${barcode}`;
        const response = await fetch(backendApiUrl);
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(`后端错误: ${response.status} - ${errData.error || '未知错误'}`);
        }
        
        const data = await response.json();

        let productInfo = '未找到商品信息';
        if (data.error) {
            productInfo = `查询失败: ${data.error}`;
            console.error('SerpAPI 返回错误:', data.error);
        } else if (data.organic_results && data.organic_results.length > 0) {
            const firstResult = data.organic_results[0];
            let title = '';
            let attributesHTML = '';
            if (firstResult.title) {
                title = `<strong>${firstResult.title}</strong>`;
            }
            if (firstResult.snippet) {
                const attributes = firstResult.snippet
                    .split(/\s+|；|，/)
                    .map(attr => attr.trim())
                    .filter(attr => attr.length > 0 && attr !== '属性.' && attr !== '...');
                if (attributes.length > 0) {
                    attributesHTML = '<ul>' + attributes.map(attr => `<li>${attr}</li>`).join('') + '</ul>';
                } else {
                    attributesHTML = `<p><small>${firstResult.snippet}</small></p>`;
                }
                if (!title && attributes.length > 0) {
                    title = `<strong>${attributes[0]}</strong>`;
                    attributesHTML = '<ul>' + attributes.slice(1).map(attr => `<li>${attr}</li>`).join('') + '</ul>';
                    if (attributes.length === 1) attributesHTML = '';
                }
            }
            if (title || attributesHTML) {
                productInfo = title + attributesHTML;
            } else {
                productInfo = '未能提取有效商品信息';
            }
        } else if (data.knowledge_graph && data.knowledge_graph.title && data.knowledge_graph.entity_type !== 'related_questions') {
            const kg = data.knowledge_graph;
            productInfo = kg.title;
            if (kg.description) {
                productInfo += ` - ${kg.description}`;
            }
        }
        productName.innerHTML = productInfo;

    } catch (error) {
        console.error('查询或处理失败:', error);
        productName.textContent = `查询失败 (${error.message || '网络或服务器错误'})`;
    } finally {
        isSearching = false;
    }
}, 1000);

// 启动摄像头和扫描
async function startScanning() {
    try {
        // 如果已经在扫描，先停止
        if (isDecodingActive) {
            await stopScanning();
        }

        isDecodingActive = true;
        lastScannedCode = null; // 重置上次扫描的结果
        rescanButton.disabled = true; // 禁用重新扫描按钮

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" }
        });

        currentVideoStream = stream;
        video.srcObject = stream;
        await video.play();

        startScanningStatus();

        codeReader.decodeFromVideoDevice(null, video, (result, err) => {
            if (!isDecodingActive) return; // 如果解码已停止，不处理结果

            if (result) {
                debouncedSearch(result.text);
            }
            
            if (err && !(err instanceof ZXing.NotFoundException)) {
                console.error('扫描错误:', err);
                stopScanningStatus();
                barcodeResult.textContent = '扫描出错';
                productName.textContent = '请重试';
                rescanButton.disabled = false;
            }
        });

    } catch (error) {
        console.error('摄像头访问错误:', error);
        alert('无法访问摄像头，请确保已授予摄像头权限。\n错误: ' + error.message);
        productName.textContent = '摄像头错误';
        barcodeResult.textContent = '错误';
        rescanButton.disabled = false;
    }
}

// 为手动搜索按钮添加事件监听
manualSearchButton.addEventListener('click', () => {
    stopScanningStatus();
    debouncedSearch(manualBarcode.value);
});

// 为重新扫描按钮添加事件监听
rescanButton.addEventListener('click', () => {
    startScanning();
});

// 允许在输入框按回车键触发搜索
manualBarcode.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        manualSearchButton.click();
    }
});

// 清理函数
window.addEventListener('beforeunload', () => {
    stopScanning();
});

// 页面加载完成后开始扫描
window.addEventListener('load', startScanning); 