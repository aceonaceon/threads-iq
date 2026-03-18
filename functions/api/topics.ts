interface Env {
  OPENAI_API_KEY: string;
}

interface Cluster {
  id: number;
  posts: string[];
}

interface TopicsRequest {
  clusters: Cluster[];
  allPosts: string[];
}

interface TopicsResponse {
  clusters: Array<{
    id: number;
    keywords: string;
    description?: string;
    postCount: number;
    percentage: number;
    posts: string[];
  }>;
  healthAssessment: string;
  nextPostSuggestions: string[];
  recommendations: string[];
}

export const onRequestPost: PagesFunction<Env> = async (context): Promise<Response> => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Handle OPTIONS request
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    const { clusters, allPosts } = await context.request.json() as TopicsRequest;

    if (!clusters || !Array.isArray(clusters) || clusters.length === 0) {
      return new Response(
        JSON.stringify({ error: '請提供叢集資料' }),
        { status: 400, headers }
      );
    }

    const apiKey = context.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OPENAI_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: '伺服器設定錯誤，請稍後再試' }),
        { status: 500, headers }
      );
    }

    // Build the prompt for GPT
    const clusterDescriptions = clusters.map(c => {
      const postList = c.posts.map((p, i) => `${i + 1}. ${p}`).join('\n');
      return `叢集 ${c.id} (${c.posts.length} 篇貼文):\n${postList}`;
    }).join('\n\n');

    const allPostsList = allPosts.map((p, i) => `${i + 1}. ${p}`).join('\n');

    const systemPrompt = `你是一個專業的社群媒體內容分析師，專門分析 Threads 貼文的主題與質量。請用繁體中文回覆。`;

    const userPrompt = `請分析以下 Threads 貼文的叢集，針對每個叢集提供：

1. **關鍵字** (keywords): 2-4 個代表該叢集主題的中文關鍵字
2. **描述** (description): 簡短描述這個叢集的主要內容方向（50 字以內）
3. **健康評估** (healthAssessment): 根據以下維度評估整體內容健康度：
   - 主題多樣性：內容是否涵蓋多個相關主題
   - 內容深度：是否有專業知識或經驗分享
   - 互動性：是否具有引發討論的特質
   - 連貫性：內容風格是否一致
   請用 30-50 個字說明健康狀況
4. **建議發文方向** (nextPostSuggestions): 3 個建議的下次發文主題
5. **策略建議** (recommendations): 3 個具體的內容策略建議

所有回覆必須用繁體中文。

以下是所有貼文：
${allPostsList}

以下是叢集分類：
${clusterDescriptions}

請以 JSON 格式回覆，不要有額外的文字說明：
{
  "clusters": [
    {
      "id": 叢集ID,
      "keywords": "關鍵字1, 關鍵字2, 關鍵字3",
      "description": "描述文字",
      "postCount": 數量,
      "percentage": 百分比,
      "posts": ["代表性貼文1", "代表性貼文2"]
    }
  ],
  "healthAssessment": "健康評估文字",
  "nextPostSuggestions": ["建議1", "建議2", "建議3"],
  "recommendations": ["建議1", "建議2", "建議3"]
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'AI 服務暫時無法使用，請稍後再試' }),
        { status: 500, headers }
      );
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices[0]?.message?.content;
    if (!content) {
      return new Response(
        JSON.stringify({ error: 'AI 回覆格式錯誤，請稍後再試' }),
        { status: 500, headers }
      );
    }

    // Parse the JSON response
    const parsed = JSON.parse(content) as TopicsResponse;

    // Calculate percentages
    const totalPosts = allPosts.length;
    for (const cluster of parsed.clusters) {
      cluster.percentage = Math.round((cluster.postCount / totalPosts) * 100);
    }

    return new Response(JSON.stringify(parsed), { status: 200, headers });

  } catch (error) {
    console.error('Error in /api/topics:', error);
    return new Response(
      JSON.stringify({ error: '分析過程發生錯誤，請稍後再試' }),
      { status: 500, headers }
    );
  }
};
