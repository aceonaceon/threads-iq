interface Env {
  OPENAI_API_KEY: string;
  LINE_CHANNEL_SECRET: string;
  THREADSIQ_STORE: KVNamespace;
}

interface EvaluateRequest {
  draft: string;
}

interface TokenPayload {
  sub: string;
  name: string;
  pic: string;
  iat: number;
  exp: number;
}

function base64Decode(str: string): string {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  try {
    const [payloadStr, sigStr] = token.split('.');
    if (!payloadStr || !sigStr) return null;
    
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadStr));
    const sigBytes = new Uint8Array(signature);
    let sigBinary = '';
    for (const byte of sigBytes) {
      sigBinary += String.fromCharCode(byte);
    }
    const expectedSig = btoa(sigBinary);
    
    if (sigStr !== expectedSig) return null;
    
    const payload = JSON.parse(base64Decode(payloadStr)) as TokenPayload;
    
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;
    
    return payload;
  } catch {
    return null;
  }
}

function getAuthToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

// Compute cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Compute centroid of multiple vectors
function computeCentroid(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  
  const dimensions = vectors[0].length;
  const centroid = new Array(dimensions).fill(0);
  
  for (const v of vectors) {
    for (let i = 0; i < dimensions; i++) {
      centroid[i] += v[i];
    }
  }
  
  for (let i = 0; i < dimensions; i++) {
    centroid[i] /= vectors.length;
  }
  
  return centroid;
}

export const onRequestGet: PagesFunction<Env> = async (context): Promise<Response> => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    // Verify authentication
    const token = getAuthToken(context.request);
    if (!token) {
      return new Response(
        JSON.stringify({ hasHistory: false }),
        { status: 200, headers }
      );
    }

    const payload = await verifyToken(token, context.env.LINE_CHANNEL_SECRET);
    if (!payload) {
      return new Response(
        JSON.stringify({ hasHistory: false }),
        { status: 200, headers }
      );
    }

    // Check if user has any analyses
    const analysesKey = `analyses:${payload.sub}`;
    const analysesStr = await context.env.THREADSIQ_STORE.get(analysesKey);
    
    let hasHistory = false;
    if (analysesStr) {
      const analyses = JSON.parse(analysesStr);
      hasHistory = analyses && analyses.length > 0 && analyses[0]?.posts?.length > 0;
    }

    return new Response(
      JSON.stringify({ hasHistory }),
      { status: 200, headers }
    );

  } catch (error) {
    console.error('Error in GET /api/evaluate:', error);
    return new Response(
      JSON.stringify({ hasHistory: false }),
      { status: 200, headers }
    );
  }
};

export const onRequestPost: PagesFunction<Env> = async (context): Promise<Response> => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    // Verify authentication
    const token = getAuthToken(context.request);
    if (!token) {
      return new Response(
        JSON.stringify({ error: '請先登入' }),
        { status: 401, headers }
      );
    }

    const payload = await verifyToken(token, context.env.LINE_CHANNEL_SECRET);
    if (!payload) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers }
      );
    }

    const { draft } = await context.request.json() as EvaluateRequest;

    if (!draft || typeof draft !== 'string') {
      return new Response(
        JSON.stringify({ error: '請提供草稿內容' }),
        { status: 400, headers }
      );
    }

    // Fetch latest analysis to get history posts
    const analysesKey = `analyses:${payload.sub}`;
    const analysesStr = await context.env.THREADSIQ_STORE.get(analysesKey);
    
    if (!analysesStr) {
      return new Response(
        JSON.stringify({ error: 'no_history', message: '請先進行一次完整分析' }),
        { status: 400, headers }
      );
    }

    const analyses = JSON.parse(analysesStr);
    if (!analyses || analyses.length === 0) {
      return new Response(
        JSON.stringify({ error: 'no_history', message: '請先進行一次完整分析' }),
        { status: 400, headers }
      );
    }

    // Get the latest analysis's posts as history
    const latestAnalysis = analyses[0];
    const historyPosts = latestAnalysis.posts;
    
    if (!historyPosts || !Array.isArray(historyPosts) || historyPosts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'no_history', message: '請先進行一次完整分析' }),
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

    // ========================================
    // Step 1: Get embeddings for draft + history
    // ========================================
    
    const allTexts = [draft, ...historyPosts];
    
    const embeddingsResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: allTexts,
      }),
    });

    if (!embeddingsResponse.ok) {
      const errorText = await embeddingsResponse.text();
      console.error('OpenAI Embeddings error:', errorText);
      return new Response(
        JSON.stringify({ error: 'AI 服務暫時無法使用，請稍後再試' }),
        { status: 500, headers }
      );
    }

    const embeddingsData = await embeddingsResponse.json() as { data: Array<{ embedding: number[], index: number }> };
    
    // Sort by index to maintain order
    const sortedEmbeddings = embeddingsData.data.sort((a, b) => a.index - b.index);
    const draftEmbedding = sortedEmbeddings[0].embedding;
    const historyEmbeddings = sortedEmbeddings.slice(1).map(e => e.embedding);

    // ========================================
    // Step 2: Semantic Scoring (B1) - draft vs centroid
    // ========================================
    
    const centroid = computeCentroid(historyEmbeddings);
    const similarityToCentroid = cosineSimilarity(draftEmbedding, centroid);
    
    let semanticVerdict: string;
    let semanticExplanation: string;
    
    if (similarityToCentroid > 0.7) {
      semanticVerdict = 'strengthen';
      semanticExplanation = '這篇草稿與你的歷史內容語意高度一致，發布後會強化你的內容定位。';
    } else if (similarityToCentroid >= 0.5) {
      semanticVerdict = 'neutral';
      semanticExplanation = '這篇草稿與歷史內容有一定關聯但不算高度重疊，可以考慮擴展新主題。';
    } else {
      semanticVerdict = 'dilute';
      semanticExplanation = '這篇草稿偏離你原本的內容主題軸，可能會稀釋你的帳號定位。';
    }

    const semanticScore = {
      score: Math.round(similarityToCentroid * 100),
      verdict: semanticVerdict,
      explanation: semanticExplanation,
    };

    // ========================================
    // Step 3: Cannibalization Detection (B2)
    // ========================================
    
    const CANNIBALIZATION_THRESHOLD = 0.85;
    const similarPosts: Array<{ text: string; similarity: number; index: number }> = [];
    
    for (let i = 0; i < historyEmbeddings.length; i++) {
      const similarity = cosineSimilarity(draftEmbedding, historyEmbeddings[i]);
      if (similarity > CANNIBALIZATION_THRESHOLD) {
        similarPosts.push({
          text: historyPosts[i].substring(0, 100) + (historyPosts[i].length > 100 ? '...' : ''),
          similarity: Math.round(similarity * 100) / 100,
          index: i + 1,
        });
      }
    }

    const cannibalization = {
      detected: similarPosts.length > 0,
      similarPosts: similarPosts,
    };

    // ========================================
    // Step 4: Hook Format Scoring (B5)
    // ========================================
    
    const hookAnalysisPrompt = `你是一個社群內容策略專家。請分析以下 Threads 貼文草稿的 Hook（開頭吸引力）品質。

貼文內容：
"""
${draft}
"""

請用 JSON 格式回覆，必須包含以下欄位：
{
  "hook": 1-10 的數字，評估開頭第一句是否能讓讀者停下來,
  "rhythm": 1-10 的數字，評估段落節奏（長短句交替、換行）,
  "cta": 1-10 的數字，評估是否有明確的呼籲行動（問問題、邀請留言等）,
  "clickbaitRisk": "低" 或 "中" 或 "高"，評估是否可能觸發平台演算法的 low signal 判定,
  "suggestions": ["具體改善建議1", "具體改善建議2", "具體改善建議3"]
}

只回覆 JSON，不要其他文字。`;

    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: '你是一個專業的社群內容策略顧問，擅长分析 Threads 贴文的 Hook 质量。' },
          { role: 'user', content: hookAnalysisPrompt }
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    let hookScore = {
      hook: 5,
      rhythm: 5,
      cta: 5,
      clickbaitRisk: '低' as '低' | '中' | '高',
      suggestions: ['無法分析，請稍後再試'] as string[],
    };

    if (gptResponse.ok) {
      const gptData = await gptResponse.json() as { choices: Array<{ message: { content: string } }> };
      const gptContent = gptData.choices[0]?.message?.content || '';
      
      try {
        // Try to parse as JSON
        const parsed = JSON.parse(gptContent);
        hookScore = {
          hook: typeof parsed.hook === 'number' ? Math.min(10, Math.max(1, parsed.hook)) : 5,
          rhythm: typeof parsed.rhythm === 'number' ? Math.min(10, Math.max(1, parsed.rhythm)) : 5,
          cta: typeof parsed.cta === 'number' ? Math.min(10, Math.max(1, parsed.cta)) : 5,
          clickbaitRisk: ['低', '中', '高'].includes(parsed.clickbaitRisk) ? parsed.clickbaitRisk : '低',
          suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : ['無具體建議'],
        };
      } catch (e) {
        console.error('Failed to parse GPT response as JSON:', gptContent);
      }
    } else {
      console.error('GPT API error:', await gptResponse.text());
    }

    // ========================================
    // Return combined result
    // ========================================
    
    const result = {
      semanticScore,
      cannibalization,
      hookAnalysis: hookScore,
    };

    return new Response(JSON.stringify(result), { status: 200, headers });

  } catch (error) {
    console.error('Error in /api/evaluate:', error);
    return new Response(
      JSON.stringify({ error: '分析過程發生錯誤，請稍後再試' }),
      { status: 500, headers }
    );
  }
};