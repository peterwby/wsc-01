const fetch = require('node-fetch');

// Vercel Serverless Function
export default async function handler(req, res) {
    // 从环境变量中获取 API Key (需要在 Vercel 平台配置)
    const SERPAPI_KEY = process.env.SERPAPI_KEY;
    const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json';

    if (!SERPAPI_KEY) {
        console.error('错误：未配置 SERPAPI_KEY 环境变量');
        return res.status(500).json({ error: '服务器配置错误' });
    }

    // 从请求查询参数中获取 barcode
    const barcode = req.query.barcode;

    if (!barcode) {
        return res.status(400).json({ error: '缺少 barcode 参数' });
    }

    console.log(`[API Function] 收到搜索请求，条形码: ${barcode}`);

    const searchQuery = `条形码 ${barcode}`; // 使用中文关键词
    const apiUrl = `${SERPAPI_ENDPOINT}?engine=google&q=${encodeURIComponent(searchQuery)}&api_key=${SERPAPI_KEY}`;

    try {
        const response = await fetch(apiUrl);
        const data = await response.json();
        console.log('[API Function] SerpAPI 响应:', JSON.stringify(data, null, 2));

        // 设置 CORS 头允许所有来源 (如果需要跨域访问，虽然同站部署通常不需要)
        // res.setHeader('Access-Control-Allow-Origin', '*'); 
        
        if (!response.ok) {
            console.error('[API Function] SerpAPI 请求失败:', data);
            // 将 SerpAPI 的错误状态和信息传递给前端
            return res.status(response.status).json({ error: 'SerpAPI 请求失败', details: data });
        }

        // 将 SerpAPI 的成功响应返回给前端
        res.status(200).json(data);

    } catch (error) {
        console.error('[API Function] 调用 SerpAPI 时出错:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
} 