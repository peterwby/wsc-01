// 获取DOM元素
const video = document.getElementById('video');
const barcodeResult = document.getElementById('barcode');
const productName = document.getElementById('product-name');
const manualBarcode = document.getElementById('manual-barcode');
const manualSearchButton = document.getElementById('manual-search-button');

// 初始化ZXing解码器
const codeReader = new ZXing.BrowserMultiFormatReader();

// --- 新增：提取核心 API 调用和结果处理逻辑 --- 
async function searchAndDisplayProductInfo(barcode) {
    if (!barcode || barcode.trim() === '') {
        alert('请输入或扫描有效的条形码。');
        return;
    }

    // 更新显示的条形码
    barcodeResult.textContent = barcode;
    // 清空之前的结果并显示查询状态
    productName.innerHTML = '查询中...';

    // 构建指向后端代理的请求URL (使用相对路径)
    const backendApiUrl = `/api/search?barcode=${barcode}`;

    try {
        const response = await fetch(backendApiUrl);
        if (!response.ok) {
            // 如果后端返回错误状态
            const errData = await response.json();
            throw new Error(`后端错误: ${response.status} - ${errData.error || '未知错误'}`);
        }
        const data = await response.json();
        console.log('后端代理响应 (来自 SerpAPI):', data);

        // --- SerpAPI 响应解析逻辑 (保持不变) ---
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
        // --- 逻辑结束 ---
        productName.innerHTML = productInfo;

    } catch (error) {
        console.error('查询或处理失败:', error);
        productName.textContent = `查询失败 (${error.message || '网络或服务器错误'})`;
    }
}
// --- 新函数结束 ---

// 启动摄像头和扫描
async function startScanning() {
    try {
        // 请求摄像头权限
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" } // 优先使用后置摄像头
        });

        // 显示视频流
        video.srcObject = stream;
        await video.play();

        // 开始解码
        codeReader.decodeFromVideoDevice(null, video, (result, err) => {
            if (result) {
                // 成功解码，调用新的处理函数
                searchAndDisplayProductInfo(result.text);
            }
            // 处理ZXing自身的解码错误
            if (err && !(err instanceof ZXing.NotFoundException)) {
                console.error('扫描错误:', err);
            }
        });

    } catch (error) {
        // 处理摄像头访问错误
        console.error('摄像头访问错误:', error);
        alert('无法访问摄像头，请确保已授予摄像头权限。\n错误: ' + error.message);
        // 更新界面显示错误状态
        productName.textContent = '摄像头错误';
        barcodeResult.textContent = '错误';
    }
}

// --- 新增：为手动搜索按钮添加事件监听 --- 
manualSearchButton.addEventListener('click', () => {
    const barcodeValue = manualBarcode.value;
    searchAndDisplayProductInfo(barcodeValue);
});

// --- 新增：允许在输入框按回车键触发搜索 --- 
manualBarcode.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault(); // 阻止默认的回车行为（如表单提交）
        manualSearchButton.click(); // 模拟点击搜索按钮
    }
});

// 页面加载完成后开始扫描
window.addEventListener('load', startScanning); 