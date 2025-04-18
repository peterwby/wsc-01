// 获取DOM元素
const video = document.getElementById('video');
const barcodeResult = document.getElementById('barcode');
const productName = document.getElementById('product-name');
const manualBarcode = document.getElementById('manual-barcode');
const manualSearchButton = document.getElementById('manual-search-button');
const rescanButton = document.getElementById('rescan-button');
const scanOverlay = document.querySelector('.scan-overlay');

// 检查是否为移动设备
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// 播放扫描成功提示音
function playBeepSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1500, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
        console.warn('无法播放提示音:', error);
    }
}

// 触发振动反馈
function vibrateDevice() {
    if (navigator.vibrate) {
        try {
            navigator.vibrate(100);
        } catch (error) {
            console.warn('无法触发振动:', error);
        }
    }
}

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
        productName.innerHTML = '请将条码对准中间扫描框<br>保持15-20厘米的距离';
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

// 获取设备最佳摄像头配置
async function getBestVideoConstraints() {
    const isMobile = isMobileDevice();
    
    if (isMobile) {
        // 移动设备优先使用后置摄像头，设置适中的分辨率
        return {
            facingMode: { exact: "environment" }, // 强制使用后置摄像头
            width: { min: 640, ideal: 1280, max: 1920 },
            height: { min: 480, ideal: 720, max: 1080 },
            frameRate: { ideal: 30 },
            focusMode: { ideal: "continuous" } // 启用持续自动对焦
        };
    } else {
        // PC设备使用默认配置
        return {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
        };
    }
}

// 获取支持的摄像头能力
async function getSupportedConstraints(stream) {
    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities();
    console.log('摄像头支持的能力:', capabilities);
    return capabilities;
}

// 配置摄像头自动对焦
async function configureAutoFocus(stream) {
    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities();
    
    // 检查是否支持自动对焦
    if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
        try {
            // 先尝试使用高级配置
            await track.applyConstraints({
                advanced: [{ focusMode: 'continuous' }]
            });
            console.log('已启用持续自动对焦（高级模式）');
        } catch (error) {
            console.warn('高级自动对焦失败，尝试基本模式:', error);
            try {
                // 如果高级配置失败，尝试基本配置
                await track.applyConstraints({
                    focusMode: 'continuous'
                });
                console.log('已启用持续自动对焦（基本模式）');
            } catch (error) {
                console.warn('无法启用自动对焦:', error);
            }
        }
    } else {
        console.warn('当前设备不支持持续自动对焦');
    }
}

// 启动摄像头和扫描
async function startScanning() {
    try {
        if (isDecodingActive) {
            await stopScanning();
        }

        isDecodingActive = true;
        lastScannedCode = null;
        rescanButton.disabled = true;
        scanOverlay.style.display = 'block';

        // 获取设备特定的视频配置
        const videoConstraints = await getBestVideoConstraints();
        console.log('视频配置:', videoConstraints);
        
        const stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints
        });

        // 配置自动对焦
        await configureAutoFocus(stream);
        
        // 配置视频元素
        currentVideoStream = stream;
        video.srcObject = stream;
        await video.play();

        // 等待视频元数据加载完成
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                console.log(`视频分辨率: ${video.videoWidth}x${video.videoHeight}`);
                resolve();
            };
        });

        startScanningStatus();

        // 配置 ZXing
        const hints = new Map();
        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
            ZXing.BarcodeFormat.EAN_13,
            ZXing.BarcodeFormat.EAN_8,
            ZXing.BarcodeFormat.CODE_128,
            ZXing.BarcodeFormat.UPC_A,
            ZXing.BarcodeFormat.UPC_E
        ]);
        
        // 使用更短的防抖时间
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

                // 扫描成功后停止解码并隐藏扫描指示区域
                if (isDecodingActive) {
                    await stopScanning();
                    rescanButton.disabled = false; // 启用重新扫描按钮
                    scanOverlay.style.display = 'none'; // 隐藏扫描指示区域
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
        }, 300); // 移动设备使用更短的防抖时间

        // 开始解码
        codeReader.decodeFromVideoDevice(null, video, (result, err) => {
            if (!isDecodingActive) return;

            if (result) {
                console.log('成功识别到条形码:', result.text);
                // 播放成功提示音（仅移动设备）
                if (isMobileDevice()) {
                    vibrateDevice();
                    playBeepSound();
                }
                debouncedSearch(result.text);
            }
            
            if (err && !(err instanceof ZXing.NotFoundException)) {
                console.error('扫描错误:', err);
                stopScanningStatus();
                barcodeResult.textContent = '扫描出错';
                productName.textContent = '请重试';
                rescanButton.disabled = false;
                scanOverlay.style.display = 'none';
            }
        });

    } catch (error) {
        console.error('摄像头访问错误:', error);
        if (error.name === 'NotAllowedError') {
            alert('请允许访问摄像头权限以进行扫码。');
        } else if (error.name === 'NotFoundError') {
            alert('未找到可用的摄像头设备。');
        } else if (error.name === 'NotReadableError') {
            alert('摄像头可能被其他应用占用，请关闭其他应用后重试。');
        } else {
            alert('摄像头出现错误：' + error.message);
        }
        productName.textContent = '摄像头错误';
        barcodeResult.textContent = '错误';
        rescanButton.disabled = false;
        scanOverlay.style.display = 'none';
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