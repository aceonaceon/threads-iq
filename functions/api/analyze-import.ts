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
    
    // Get Threads user ID from KV
    const tokenStr = await context.env.THREADSIQ_STORE.get(`threads_token:${lineUserId}`);
    if (!tokenStr) {
      return new Response(JSON.stringify({ error: 'threads_not_connected' }), { status: 400, headers });
    }
    const tokenData = JSON.parse(tokenStr);
    const threadsUserId = tokenData.threadsUserId || '';
    
    if (!threadsUserId) {
      return new Response(JSON.stringify({ error: 'threads_not_connected' }), { status: 400, headers });
    }
    
    // Get user plan
    const userStr = await context.env.THREADSIQ_STORE.get(`user:${lineUserId}`);
    const userData = userStr ? JSON.parse(userStr) : {};
    const plan = userData.plan || 'free';
    
    // Read posts with embeddings from D1 (filtered by current Threads account)
    const limit = plan === 'free' ? 30 : plan === 'creator' ? 300 : 10000;
    const posts = await context.env.THREADSIQ_DB.prepare(
      `SELECT p.id, p.text, p.embedding, p.posted_at, p.media_type, p.threads_post_id,
              COALESCE(i.views, 0) as views, COALESCE(i.likes, 0) as likes,
              COALESCE(i.replies, 0) as replies, COALESCE(i.reposts, 0) as reposts,
              COALESCE(i.quotes, 0) as quotes
       FROM posts p
       LEFT JOIN post_insights i ON p.threads_post_id = i.threads_post_id AND p.user_id = i.user_id
       WHERE p.user_id = ? AND p.threads_user_id = ? AND p.embedding IS NOT NULL AND p.text IS NOT NULL AND p.text != ''
       ORDER BY p.posted_at DESC LIMIT ?`
    ).bind(lineUserId, threadsUserId, limit).all<any>();
    
    const postsList = posts.results || [];
    
    if (postsList.length < 5) {
      return new Response(JSON.stringify({ error: '貼文數量不足，需要至少 5 篇有效貼文' }), { status: 400, headers });
    }
    
    // Parse embeddings and collect engagement data
    const embeddings: number[][] = [];
    const validTexts: string[] = [];
    const postEngagements: { views: number; likes: number; replies: number; reposts: number; quotes: number; mediaType: string }[] = [];
    
    for (const post of postsList) {
      try {
        const emb = typeof post.embedding === 'string' ? JSON.parse(post.embedding) : post.embedding;
        if (emb && Array.isArray(emb) && emb.length > 0) {
          embeddings.push(emb);
          validTexts.push(post.text);
          postEngagements.push({
            views: post.views || 0,
            likes: post.likes || 0,
            replies: post.replies || 0,
            reposts: post.reposts || 0,
            quotes: post.quotes || 0,
            mediaType: post.media_type || 'text',
          });
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
    
    // Calculate weighted engagement and group by cluster/format
    const weightedEngagements = postEngagements.map(e => 
      (e.replies * 4) + (e.reposts * 5) + (e.quotes * 4) + (e.likes * 2)
    );
    
    // Account total stats
    let totalViews = 0, totalLikes = 0, totalReplies = 0, totalReposts = 0, totalQuotes = 0, totalWeightedEng = 0;
    for (let i = 0; i < postEngagements.length; i++) {
      const e = postEngagements[i];
      totalViews += e.views;
      totalLikes += e.likes;
      totalReplies += e.replies;
      totalReposts += e.reposts;
      totalQuotes += e.quotes;
      totalWeightedEng += weightedEngagements[i];
    }
    const totalPosts = postEngagements.length;
    const engagementRate = totalViews > 0 ? (totalWeightedEng / totalViews) * 100 : 0;
    
    const accountStats = {
      totalPosts,
      totalViews,
      totalLikes,
      totalReplies,
      totalReposts,
      totalQuotes,
      totalWeightedEngagement: totalWeightedEng,
      engagementRate: Math.round(engagementRate * 100) / 100,
    };
    
    // Group by cluster
    const clusterStats: { id: number; name: string; postCount: number; avgEngagementRate: number; topEngagement: number }[] = [];
    for (let c = 0; c < clusterCount; c++) {
      const clusterIndices = labels.map((l: number, i: number) => l === c ? i : -1).filter((i: number) => i >= 0);
      const clusterViews = clusterIndices.reduce((sum, i) => sum + postEngagements[i].views, 0);
      const clusterWeightedEng = clusterIndices.reduce((sum, i) => sum + weightedEngagements[i], 0);
      const clusterEngRate = clusterViews > 0 ? (clusterWeightedEng / clusterViews) * 100 : 0;
      const topEng = clusterIndices.reduce((max, i) => Math.max(max, weightedEngagements[i]), 0);
      clusterStats.push({
        id: c,
        name: `Cluster ${c}`,
        postCount: clusterIndices.length,
        avgEngagementRate: Math.round(clusterEngRate * 100) / 100,
        topEngagement: topEng,
      });
    }
    
    // Group by format (media_type)
    const formatMap: Record<string, { posts: number; views: number; weightedEng: number }> = {};
    for (let i = 0; i < postEngagements.length; i++) {
      const fmt = postEngagements[i].mediaType || 'text';
      if (!formatMap[fmt]) formatMap[fmt] = { posts: 0, views: 0, weightedEng: 0 };
      formatMap[fmt].posts++;
      formatMap[fmt].views += postEngagements[i].views;
      formatMap[fmt].weightedEng += weightedEngagements[i];
    }
    const formatStats = Object.entries(formatMap).map(([type, data]) => ({
      type,
      postCount: data.posts,
      avgEngagementRate: data.views > 0 ? Math.round((data.weightedEng / data.views) * 10000) / 100 : 0,
    }));
    
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
    
    // Call GPT for topic analysis with engagement data
    const gptSystemPrompt = `你是一位社群媒體內容分析師。分析以下 Threads 貼文的語意叢集，為每個叢集命名並給出建議。
以下是你帳號的真實數據，請基於這些數據給建議。千萬不要提及任何產業平均值或benchmark，因為我們沒有這些數據。

## 帳號整體數據
- 總貼文數: ${accountStats.totalPosts}
- 總瀏覽量: ${accountStats.totalViews}
- 總按讚數: ${accountStats.totalLikes}
- 總回覆數: ${accountStats.totalReplies}
- 總轉發數: ${accountStats.totalReposts}
- 總引用數: ${accountStats.totalQuotes}
- 總加權互動: ${accountStats.totalWeightedEngagement}
- 互動率: ${accountStats.engagementRate}%

## 叢集數據（加權互動 = 回覆×4 + 轉發×5 + 引用×4 + 按讚×2）
${clusterStats.map(c => `- ${c.name}: ${c.postCount}篇, 平均互動率${c.avgEngagementRate}%, 最高互動${c.topEngagement}`).join('\n')}

## 格式數據
${formatStats.map(f => `- ${f.type}: ${f.postCount}篇, 平均互動率${f.avgEngagementRate}%`).join('\n')}

每個叢集必須有一個「名稱」，這個名稱要能精準概括該叢集的內容主題（例如：「留學顧問觀點」、「生活日常分享」、「產業觀察評論」等）。
回傳 JSON 格式：
{
  "clusters": [{ "id": number, "name": "叢集名稱", "keywords": "關鍵字1, 關鍵字2", "description": "描述", "postCount": number, "percentage": number, "avgEngagementRate": number, "topEngagement": number, "posts": ["代表貼文1", "代表貼文2"] }],
  "healthAssessment": "整體內容健康度評估",
  "nextPostSuggestions": ["建議1", "建議2", "建議3"],
  "recommendations": ["策略建議1", "策略建議2", "策略建議3"]
}`;

    const gptUserData = {
      clusters: clusters.map((c, i) => ({
        ...c,
        avgEngagementRate: clusterStats[i]?.avgEngagementRate || 0,
        topEngagement: clusterStats[i]?.topEngagement || 0,
      })),
      formatStats,
      allPosts: sampledAllPosts,
    };
    
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
          { role: 'system', content: gptSystemPrompt },
          { role: 'user', content: JSON.stringify(gptUserData) }
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
    
    // Generate 2D layout from cluster labels (simple radial layout per cluster)
    const points2D: number[][] = labels.map((label: number, i: number) => {
      const clusterAngle = (label >= 0 ? label : clusterCount) * (2 * Math.PI / (clusterCount + 1));
      const jitter = (i * 0.618) % 1; // golden ratio jitter
      const radius = label >= 0 ? 3 + jitter * 2 : 8 + jitter * 2;
      return [
        Math.cos(clusterAngle + jitter * 0.5) * radius,
        Math.sin(clusterAngle + jitter * 0.5) * radius,
      ];
    });
    
    return new Response(JSON.stringify({
      id: `import-${Date.now()}`,
      postCount: embeddings.length,
      posts: validTexts,
      labels,
      clusterCount,
      healthScore,
      points2D,
      engagementStats: {
        account: accountStats,
        byCluster: clusterStats,
        byFormat: formatStats,
      },
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
