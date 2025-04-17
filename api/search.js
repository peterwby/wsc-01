import fetch from 'node-fetch';

// Vercel Serverless Function
export default async function handler(req, res) {
    const SERPAPI_KEY = process.env.SERPAPI_KEY;
    const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json';

    if (!SERPAPI_KEY) {
        console.error('错误：未配置 SERPAPI_KEY 环境变量');
        return res.status(500).json({ 
            error: '服务器配置错误', 
            details: '未配置 SERPAPI_KEY 环境变量'
        });
    }

    const barcode = req.query.barcode;
    if (!barcode) {
        return res.status(400).json({ error: '缺少 barcode 参数' });
    }

    const searchQuery = `条形码 ${barcode}`;
    const apiUrl = `${SERPAPI_ENDPOINT}?engine=google&q=${encodeURIComponent(searchQuery)}&api_key=${SERPAPI_KEY}`;

    try {
        const response = await fetch(apiUrl);
        const responseText = await response.text();
        
        try {
            const data = JSON.parse(responseText);
            
            if (!response.ok) {
                console.error('SerpAPI 请求失败:', data);
                return res.status(response.status).json({ 
                    error: 'SerpAPI 请求失败', 
                    details: data
                });
            }
            
            return res.status(200).json(data);
            
        } catch (parseError) {
            console.error('JSON 解析错误:', parseError);
            return res.status(500).json({ 
                error: '服务器响应解析错误',
                details: '响应不是有效的 JSON 格式'
            });
        }

    } catch (error) {
        console.error('调用 SerpAPI 时出错:', error);
        return res.status(500).json({ 
            error: '服务器内部错误',
            details: error.message
        });
    }
} 