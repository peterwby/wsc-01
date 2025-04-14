// 获取DOM元素
const video = document.getElementById('video');
const barcodeResult = document.getElementById('barcode');
const productName = document.getElementById('product-name');
const price = document.getElementById('price');
const googleSearch = document.getElementById('google-search');
const baiduSearch = document.getElementById('baidu-search');

// 初始化ZXing解码器
const codeReader = new ZXing.BrowserMultiFormatReader();

// 更新搜索链接
function updateSearchLinks(productName, barcode) {
    // 如果商品名称有效，使用商品名称搜索
    if (productName && productName !== '名称未知' && productName !== '查询中...' && productName !== '未在 Open Food Facts 找到信息') {
        const encodedName = encodeURIComponent(productName);
        googleSearch.href = `https://www.google.com/search?q=${encodedName}`;
        baiduSearch.href = `https://www.baidu.com/s?wd=${encodedName}`;
    } else {
        // 如果商品名称无效，使用条形码搜索
        googleSearch.href = `https://www.google.com/search?q=${barcode}`;
        baiduSearch.href = `https://www.baidu.com/s?wd=${barcode}`;
    }
    
    // 始终显示搜索按钮
    googleSearch.style.display = 'inline';
    baiduSearch.style.display = 'inline';
}

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
                // 成功解码
                const barcode = result.text;
                barcodeResult.textContent = barcode;

                // --- 调用 Open Food Facts API ---
                // 清空之前的结果并显示查询状态
                productName.textContent = '查询中...';
                price.textContent = '-';

                fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        return response.json();
                    })
                    .then(data => {
                        console.log('Open Food Facts API Response:', data); // 打印 API 响应，方便调试
                        
                        let name = '名称未知';
                        if (data.status === 1 && data.product) {
                            // 找到商品 (status: 1 表示找到)
                            // 尝试获取商品名称，优先中文名，然后是英文名，最后是产品名
                            name = data.product.product_name_zh
                                || data.product.product_name_en
                                || data.product.product_name
                                || data.product.generic_name
                                || '名称未知';
                            
                            // 显示品牌信息（如果有）
                            if (data.product.brands) {
                                name = `${data.product.brands} ${name}`;
                            }
                        } else {
                            // API 中未找到该商品
                            name = '未在 Open Food Facts 找到信息';
                        }
                        
                        // 更新商品名称显示
                        productName.textContent = name;
                        // 更新价格显示（始终显示"价格需自行查询"）
                        price.textContent = '价格需自行查询';
                        
                        // 更新搜索链接（无论是否找到商品信息，都显示搜索按钮）
                        updateSearchLinks(name, barcode);

                    })
                    .catch(error => {
                        // 处理 fetch 过程中的错误
                        console.error('API 请求失败:', error);
                        productName.textContent = '查询失败 (网络或API错误)';
                        price.textContent = '-';
                        // 即使API失败，也显示搜索按钮
                        updateSearchLinks(null, barcode);
                    });
                // --- API 调用结束 ---

            }
            // 处理 ZXing 自身的解码错误
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
        price.textContent = '-';
        barcodeResult.textContent = '错误';
    }
}

// 页面加载完成后开始扫描
window.addEventListener('load', startScanning); 