interface Env {
  OPENAI_API_KEY: string;
  LINE_CHANNEL_SECRET: string;
  THREADSIQ_STORE: KVNamespace;
}

interface ThreadGeneratorRequest {
  topic: string;
  count?: number;
  style?: 'casual' | 'professional' | 'story';
  historyPosts?: string[];
}

interface ThreadPost {
  order: number;
  text: string;
  hookScore: number;
  diversityFlag: boolean;
  cannibalizationFlag: boolean;
}

interface ThreadGeneratorResponse {
  threads: ThreadPost[];
  overallDiversity: number;
  suggestions: string[];
}

// Token verification helpers
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

// Cosine similarity between two vectors
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

// Get embeddings for texts
async function getEmbeddings(texts: string[], apiKey: string): Promise<number[][]> {
  const embeddings: number[][] = [];
  
  // Process in batches to avoid rate limits
  const batchSize = 100;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: batch,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      throw new Error('Failed to get embeddings');
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    
    // Sort by index to maintain order
    const sortedData = data.data.sort((a, b) => a.index - b.index);
    for (const item of sortedData) {
      embeddings.push(item.embedding);
    }
  }
  
  return embeddings;
}

// Score hook quality using GPT
async function scoreHook(postText: string, style: string, apiKey: string): Promise<number> {
  const prompt = `你是一個社群媒體內容專家。請評估以下 Threads 貼文的鉤子（Hook）品質，給出 1-10 分。

評估標準：
- 開頭是否能立刻吸引注意力？
- 是否有明確的價值主張或好奇心？
- 是否符合 "${style}" 風格？

只需要回覆一個數字（1-10），不要其他文字。

貼文內容：
${postText}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: '你是一個社群媒體內容專家，擅長評估 Threads 貼文的鉤子品質。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      console.error('GPT scoring error:', await response.text());
      return 5; // Default score
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content?.trim() || '5';
    const score = parseInt(content.replace(/\D/g, ''), 10);
    return isNaN(score) ? 5 : Math.min(10, Math.max(1, score));
  } catch (error) {
    console.error('Error scoring hook:', error);
    return 5;
  }
}

// Generate thread posts using GPT
async function generateThreadPosts(topic: string, count: number, style: string, apiKey: string): Promise<string[]> {
  const styleDescriptions: Record<string, string> = {
    casual: '口語化、輕鬆活潑、使用年輕人常用語氣、適度表情符號',
    professional: '專業分析、數據導向、正式但易懂、權威感',
    story: '故事型敘述、有情節、有畫面感、讓讀者有代入感'
  };

  const prompt = `你是一個 Threads 內容創作專家。請根據以下主題生成 ${count} 則串文貼文。

主題：${topic}

風格要求：${styleDescriptions[style] || styleDescriptions.casual}

要求：
1. 每則貼文 100-300 字元（Threads 最佳長度）
2. 每則貼文要有不同的切入角度
3. 開頭要有強鉤子（Hook）
4. 最後一則要有明確的 CTA（呼籲行動）
5. 使用繁體中文
6. 適度使用換行讓閱讀更輕鬆
7. 適量使用表情符號（每則最多 1-2 個）
8. 每則貼文要能獨立閱讀但又有連貫性

請以 JSON 陣列格式回覆，每則貼文是一個字串：
["貼文1", "貼文2", "貼文3", ...]`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: '你是一個專業的社群媒體內容創作專家，擅長生成 Threads 串文。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GPT generation error:', errorText);
      throw new Error('Failed to generate threads');
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content || '[]';
    
    // Extract JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const posts = JSON.parse(jsonMatch[0]) as string[];
      return posts.slice(0, count);
    }
    
    // Fallback: try parsing entire response
    const posts = JSON.parse(content) as string[];
    return posts.slice(0, count);
  } catch (error) {
    console.error('Error generating threads:', error);
    throw new Error('Failed to generate thread posts');
  }
}

export const onRequestPost: PagesFunction<Env> = async (context): Promise<Response> => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  // Handle OPTIONS request
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

    const { topic, count = 7, style = 'casual', historyPosts = [] } = await context.request.json() as ThreadGeneratorRequest;

    if (!topic || topic.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: '請提供主題' }),
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

    // Generate thread posts
    const posts = await generateThreadPosts(topic.trim(), count, style, apiKey);
    
    // Get embeddings for generated posts
    const embeddings = await getEmbeddings(posts, apiKey);
    
    // Get embeddings for history posts if provided
    let historyEmbeddings: number[][] = [];
    if (historyPosts.length > 0) {
      historyEmbeddings = await getEmbeddings(historyPosts, apiKey);
    }

    // Analyze diversity between generated posts
    const threads: ThreadPost[] = [];
    const suggestions: string[] = [];
    let diversitySum = 0;
    let diversityCount = 0;

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const embedding = embeddings[i];
      
      // Check diversity with other generated posts
      let diversityFlag = false;
      for (let j = 0; j < posts.length; j++) {
        if (i !== j) {
          const similarity = cosineSimilarity(embedding, embeddings[j]);
          if (similarity > 0.85) {
            diversityFlag = true;
            break;
          }
        }
      }

      // Check cannibalization with history posts
      let cannibalizationFlag = false;
      if (historyEmbeddings.length > 0) {
        for (const historyEmbedding of historyEmbeddings) {
          const similarity = cosineSimilarity(embedding, historyEmbedding);
          if (similarity > 0.85) {
            cannibalizationFlag = true;
            break;
          }
        }
      }

      // Score hook quality
      const hookScore = await scoreHook(post, style, apiKey);

      threads.push({
        order: i + 1,
        text: post,
        hookScore,
        diversityFlag,
        cannibalizationFlag,
      });

      // Calculate diversity scores
      for (let j = i + 1; j < posts.length; j++) {
        const similarity = cosineSimilarity(embedding, embeddings[j]);
        diversitySum += 1 - similarity;
        diversityCount++;
      }
    }

    // Calculate overall diversity (1 - average similarity)
    const overallDiversity = diversityCount > 0 ? diversitySum / diversityCount : 1;

    // Generate suggestions
    const lowHookPosts = threads.filter(t => t.hookScore < 6);
    if (lowHookPosts.length > 0) {
      suggestions.push(`第 ${lowHookPosts.map(t => t.order).join(', ')} 則的鉤子較弱，建議加強開頭吸引力`);
    }

    const similarPairs: string[] = [];
    for (let i = 0; i < threads.length; i++) {
      for (let j = i + 1; j < threads.length; j++) {
        const similarity = cosineSimilarity(embeddings[i], embeddings[j]);
        if (similarity > 0.85) {
          similarPairs.push(`第 ${i + 1} 則和第 ${j + 1} 則內容相似度過高`);
        }
      }
    }
    if (similarPairs.length > 0) {
      suggestions.push(...similarPairs);
      suggestions.push('建議重新思考這些串文的角度切入');
    }

    if (threads.length > 0 && !threads[threads.length - 1].text.toLowerCase().includes('cta')) {
      suggestions.push('最後一則建議加入明確的 CTA 引導互動');
    }

    const response: ThreadGeneratorResponse = {
      threads,
      overallDiversity: Math.round(overallDiversity * 100) / 100,
      suggestions,
    };

    return new Response(JSON.stringify(response), { status: 200, headers });

  } catch (error) {
    console.error('Error in /api/thread-generator:', error);
    return new Response(
      JSON.stringify({ error: '生成過程發生錯誤，請稍後再試' }),
      { status: 500, headers }
    );
  }
};
