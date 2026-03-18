import { v4 as uuidv4 } from 'uuid';

export interface Post {
  text: string;
}

export interface Cluster {
  id: number;
  keywords: string;
  description?: string;
  postCount: number;
  percentage: number;
  posts: string[];
}

export interface TopicAnalysis {
  clusters: Cluster[];
  healthScore: number;
  healthAssessment: string;
  nextPostSuggestions: string[];
  recommendations: string[];
}

export interface AnalysisResult {
  id: string;
  embeddings: number[][];
  points2D: number[][];
  labels: number[];
  topicAnalysis: TopicAnalysis;
  remainingUses: number;
}

export interface HistoryItem {
  id: string;
  postCount: number;
  clusterCount: number;
  noiseCount: number;
  healthScore: number;
  createdAt: string;
}

// Generate mock embeddings for demo (in production, this would come from OpenAI)
function generateMockEmbeddings(posts: string[]): number[][] {
  return posts.map(() => 
    Array.from({ length: 1536 }, () => Math.random() * 2 - 1)
  );
}

// Generate mock topic analysis (in production, this would come from GPT)
function generateMockTopicAnalysis(posts: string[], clusterCount: number): TopicAnalysis {
  const keywords = [
    '留學規劃', '語言學習', '海外生活', '申請技巧', '簽證問題',
    '獎學金', '選校建議', '職涯發展', '文化交流', '生活費规划'
  ];
  
  const suggestions = [
    '分享你的留學申請時間規劃',
    '如何選擇適合的語言考試？',
    '留學生活中的文化衝擊調適',
    '國外租房經驗與建議',
    '留學期間的兼職工作選擇'
  ];
  
  const recommendations = [
    '建議保持主題一致性，這有助於吸引特定受眾',
    '可以考慮增加互動性內容，提高粉絲參與度',
    '適時分享個人經驗，讓內容更具親和力'
  ];

  const clusters: Cluster[] = [];
  const postsPerCluster = Math.floor(posts.length / clusterCount) || 1;
  
  for (let i = 0; i < clusterCount; i++) {
    const clusterPosts = posts.slice(i * postsPerCluster, (i + 1) * postsPerCluster);
    clusters.push({
      id: i,
      keywords: keywords[i % keywords.length],
      postCount: clusterPosts.length,
      percentage: Math.round(clusterPosts.length / posts.length * 100),
      posts: clusterPosts.slice(0, 3),
    });
  }

  return {
    clusters,
    healthScore: Math.floor(50 + Math.random() * 40),
    healthAssessment: '中等',
    nextPostSuggestions: suggestions.slice(0, 3),
    recommendations,
  };
}

export async function runAnalysis(posts: string[], _userId: string): Promise<AnalysisResult> {
  // Generate mock embeddings (in production, this would call the API)
  const embeddings = generateMockEmbeddings(posts);
  
  // Return mock result
  const analysisId = uuidv4();
  const topicAnalysis = generateMockTopicAnalysis(posts, Math.min(3, Math.floor(posts.length / 3)));
  
  return {
    id: analysisId,
    embeddings,
    points2D: [],
    labels: [],
    topicAnalysis,
    remainingUses: 2,
  };
}

export async function getHistory(_userId: string): Promise<HistoryItem[]> {
  return [];
}

export async function getUsage(_userId: string): Promise<{ remaining: number }> {
  return { remaining: 3 };
}

export async function getAnalysis(_id: string): Promise<AnalysisResult> {
  throw new Error('Not implemented');
}
