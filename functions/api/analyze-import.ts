// POST /api/analyze-import - Server-side analysis for imported posts
// Reads embeddings from D1, runs DBSCAN, samples posts, calls GPT for topics
// This avoids sending 9MB of embeddings to the frontend
import { Env } from './import/_shared';

// CORS helpers
function getCorsHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function base64Decode(str: string): string {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function verifyToken(token: string, secret: string): Promise<any> {
  try {
    const [payloadStr, sigStr] = token.split('.');
    if (!payloadStr || !sigStr) return null;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = Uint8Array.from(atob(sigStr.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payloadStr));
    if (!valid) return null;
    return JSON.parse(base64Decode(payloadStr));
  } catch { return null; }
}

// Cosine similarity
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
}

// DBSCAN implementation
function dbscan(embeddings: number[][], epsilon: number, minPts: number): { labels: number[], clusterCount: number } {
  const n = embeddings.length;
  const labels = new Array(n).fill(-2); // -2 = unvisited
  let clusterId = 0;
  
  // Pre-compute distance matrix (cosine distance = 1 - similarity)
  const distMatrix: number[][] = [];
  for (let i = 0; i < n; i++) {
    distMatrix[i] = [];
    for (let j = 0; j < n; j++) {
      distMatrix[i][j] = i === j ? 0 : 1 - cosineSimilarity(embeddings[i], embeddings[j]);
    }
  }
  
  function regionQuery(idx: number): number[] {
    const neighbors: number[] = [];
    for (let j = 0; j < n; j++) {
      if (distMatrix[idx][j] <= epsilon) neighbors.push(j);
    }
    return neighbors;
  }
  
  for (let i = 0; i < n; i++) {
    if (labels[i] !== -2) continue;
    
    const neighbors = regionQuery(i);
    if (neighbors.length < minPts) {
      labels[i] = -1; // noise
      continue;
    }
    
    labels[i] = clusterId;
    const queue = [...neighbors.filter(n => n !== i)];
    let qi = 0;
    
    while (qi < queue.length) {
      const j = queue[qi++];
      if (labels[j] === -1) labels[j] = clusterId;
      if (labels[j] !== -2) continue;
      
      labels[j] = clusterId;
      const jNeighbors = regionQuery(j);
      if (jNeighbors.length >= minPts) {
        for (const k of jNeighbors) {
          if (!queue.includes(k) && labels[k] <= -1) queue.push(k);
        }
      }
    }
    
    clusterId++;
  }
  
  // Replace -2 with -1 (shouldn't happen but just in case)
  for (let i = 0; i < n; i++) {
    if (labels[i] === -2) labels[i] = -1;
  }
  
  return { labels, clusterCount: clusterId };
}

// Compute DBSCAN parameters
function computeDbscanParams(embeddings: number[][]): { epsilon: number, minPts: number } {
  const n = embeddings.length;
  const k = Math.max(2, Math.floor(n * 0.08));
  
  // Compute k-distances
  const kDistances: number[] = [];
  for (let i = 0; i < n; i++) {
    const dists: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i !== j) dists.push(1 - cosineSimilarity(embeddings[i], embeddings[j]));
    }
    dists.sort((a, b) => a - b);
    kDistances.push(dists[k - 1] || 0);
  }
  
  kDistances.sort((a, b) => a - b);
  const epsilon = kDistances[Math.floor(kDistances.length * 0.75)];
  
  return { epsilon, minPts: k };
}

// Health score calculation
function calculateHealthScore(embeddings: number[][], labels: number[], clusterCount: number): number {
  if (embeddings.length === 0) return 0;
  
  const n = embeddings.length;
  const effectiveClusters = clusterCount === 0 ? 1 : clusterCount;
  
  // Concentration: how evenly distributed are posts across clusters
  const clusterSizes: number[] = new Array(effectiveClusters).fill(0);
  for (const label of labels) {
    if (label >= 0 && label < effectiveClusters) clusterSizes[label]++;
  }
  const maxSize = Math.max(...clusterSizes);
  const concentration = 1 - (maxSize / n);
  
  // Coverage: what % of posts are in clusters (not noise)
  const inCluster = labels.filter(l => l >= 0).length;
  const coverage = inCluster / n;
  
  // Coherence: average intra-cluster similarity
  let totalSim = 0, simCount = 0;
  for (let c = 0; c < effectiveClusters; c++) {
    const indices = labels.map((l, i) => l === c ? i : -1).filter(i => i >= 0);
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        totalSim += cosineSimilarity(embeddings[indices[i]], embeddings[indices[j]]);
        simCount++;
      }
    }
  }
  const coherence = simCount > 0 ? totalSim / simCount : 0;
  
  // Focus: how distinct are the clusters from each other
  let interSim = 0, interCount = 0;
  for (let c1 = 0; c1 < effectiveClusters; c1++) {
    for (let c2 = c1 + 1; c2 < effectiveClusters; c2++) {
      const idx1 = labels.map((l, i) => l === c1 ? i : -1).filter(i => i >= 0);
      const idx2 = labels.map((l, i) => l === c2 ? i : -1).filter(i => i >= 0);
      if (idx1.length > 0 && idx2.length > 0) {
        interSim += cosineSimilarity(embeddings[idx1[0]], embeddings[idx2[0]]);
        interCount++;
      }
    }
  }
  const focus = interCount > 0 ? 1 - (interSim / interCount) : 0.5;
  
  return Math.round((concentration * 30 + coverage * 30 + coherence * 25 + focus * 15) * 100) / 100;
}

export const onRequestPost: PagesFunction<Env> = async (context): Promise<Response> => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders() });
  }
  
  const headers = getCorsHeaders();
  
  try {
    // Auth
    const authHeader = context.request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: '未登入' }), { status: 401, headers });
    }
    const token = authHeader.substring(7);
    const payload = await verifyToken(token, context.env.LINE_CHANNEL_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers });
    }
    
    const lineUserId = payload.sub;
    
    // Get user plan
    const userStr = await context.env.THREADSIQ_STORE.get(`user:${lineUserId}`);
    const userData = userStr ? JSON.parse(userStr) : {};
    const plan = userData.plan || 'free';
    
    // Read posts with embeddings from D1
    const limit = plan === 'free' ? 30 : plan === 'creator' ? 300 : 10000;
    const posts = await context.env.THREADSIQ_DB.prepare(
      `SELECT id, text, embedding, posted_at FROM posts 
       WHERE user_id = ? AND embedding IS NOT NULL AND text IS NOT NULL AND text != ''
       ORDER BY posted_at DESC LIMIT ?`
    ).bind(lineUserId, limit).all<any>();
    
    const postsList = posts.results || [];
    
    if (postsList.length < 5) {
      return new Response(JSON.stringify({ error: '貼文數量不足，需要至少 5 篇有效貼文' }), { status: 400, headers });
    }
    
    // Parse embeddings
    const embeddings: number[][] = [];
    const validTexts: string[] = [];
    
    for (const post of postsList) {
      try {
        const emb = typeof post.embedding === 'string' ? JSON.parse(post.embedding) : post.embedding;
        if (emb && Array.isArray(emb) && emb.length > 0) {
          embeddings.push(emb);
          validTexts.push(post.text);
        }
      } catch {}
    }
    
    if (embeddings.length < 5) {
      return new Response(JSON.stringify({ error: '有效向量不足' }), { status: 400, headers });
    }
    
    // Run DBSCAN
    const { epsilon, minPts } = computeDbscanParams(embeddings);
    let { labels, clusterCount } = dbscan(embeddings, epsilon, minPts);
    
    // Fallback: if no clusters found, treat all as one
    if (clusterCount === 0) {
      labels = new Array(embeddings.length).fill(0);
      clusterCount = 1;
    }
    
    // Build clusters with sampled posts for GPT
    const clusters: { id: number; posts: string[] }[] = [];
    for (let c = 0; c < clusterCount; c++) {
      const clusterPosts = labels
        .map((l, i) => l === c ? validTexts[i] : null)
        .filter(Boolean) as string[];
      // Sample max 15 posts per cluster for GPT
      const sampled = clusterPosts.length > 15
        ? [...clusterPosts.slice(0, 10), ...clusterPosts.slice(-5)]
        : clusterPosts;
      clusters.push({ id: c, posts: sampled });
    }
    
    // Sample allPosts for GPT
    const maxForGpt = 50;
    const sampledAllPosts = validTexts.length > maxForGpt
      ? validTexts.filter((_, i) => i % Math.ceil(validTexts.length / maxForGpt) === 0)
      : validTexts;
    
    // Call GPT for topic analysis
    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `你是一位社群媒體內容分析師。分析以下 Threads 貼文的語意叢集，為每個叢集命名並給出建議。
回傳 JSON 格式：
{
  "clusters": [{ "id": number, "keywords": "關鍵字1, 關鍵字2", "description": "描述", "postCount": number, "percentage": number, "posts": ["代表貼文1", "代表貼文2"] }],
  "healthAssessment": "整體內容健康度評估",
  "nextPostSuggestions": ["建議1", "建議2", "建議3"],
  "recommendations": ["策略建議1", "策略建議2", "策略建議3"]
}`
          },
          {
            role: 'user',
            content: JSON.stringify({ clusters: clusters, allPosts: sampledAllPosts })
          }
        ],
      }),
    });
    
    if (!gptResponse.ok) {
      const errText = await gptResponse.text();
      console.error('GPT error:', errText);
      return new Response(JSON.stringify({ error: 'AI 分析失敗', detail: errText.substring(0, 200) }), { status: 500, headers });
    }
    
    const gptData: any = await gptResponse.json();
    const topicAnalysis = JSON.parse(gptData.choices[0].message.content);
    
    // Calculate health score
    const healthScore = calculateHealthScore(embeddings, labels, clusterCount);
    
    // Return complete analysis result (no UMAP - frontend can compute if needed from labels)
    return new Response(JSON.stringify({
      id: `import-${Date.now()}`,
      postCount: embeddings.length,
      labels,
      clusterCount,
      healthScore,
      topicAnalysis: {
        ...topicAnalysis,
        healthScore,
      },
    }), { status: 200, headers });
    
  } catch (error) {
    console.error('Analyze import error:', error);
    return new Response(JSON.stringify({ error: '分析失敗', detail: String(error) }), { status: 500, headers });
  }
};
