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
  bonusRemaining: number;
}

export interface HistoryItem {
  id: string;
  postCount: number;
  clusterCount: number;
  noiseCount: number;
  healthScore: number;
  createdAt: string;
}

// Call the /api/analyze endpoint to get real embeddings
async function getEmbeddings(posts: string[]): Promise<{ embeddings: number[][]; remaining: number; bonusRemaining: number }> {
  const token = localStorage.getItem('threadsiq_token');
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ posts }),
  });

  if (!response.ok) {
    const error = await response.json();
    // Check if this is a usage exceeded error
    if (response.status === 403 || error.error === 'usage_exceeded') {
      throw new Error('usage_exceeded');
    }
    throw new Error(error.error || '取得語意嵌入失敗');
  }

  const data = await response.json() as { embeddings: number[][]; remaining: number; bonusRemaining: number };
  return data;
}

// Call the /api/topics endpoint to get real topic analysis
async function getTopicAnalysis(
  clusters: { id: number; posts: string[] }[],
  allPosts: string[]
): Promise<Omit<TopicAnalysis, 'healthScore'>> {
  const response = await fetch('/api/topics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clusters, allPosts }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '生成主題分析失敗');
  }

  return await response.json() as Omit<TopicAnalysis, 'healthScore'>;
}

// Get usage count from localStorage
function getUsageCount(userId: string): number {
  const key = `threadsiq_usage_${userId}`;
  const stored = localStorage.getItem(key);
  return stored ? parseInt(stored, 10) : 3;
}

export async function runAnalysis(posts: string[], _userId: string): Promise<AnalysisResult> {
  // Generate unique analysis ID
  const analysisId = uuidv4();

  // Step 1: Get embeddings from API (includes usage check and consumption)
  const { embeddings, remaining, bonusRemaining } = await getEmbeddings(posts);

  return {
    id: analysisId,
    embeddings,
    points2D: [],
    labels: [],
    topicAnalysis: {
      clusters: [],
      healthScore: 0,
      healthAssessment: '',
      nextPostSuggestions: [],
      recommendations: [],
    },
    remainingUses: remaining,
    bonusRemaining,
  };
}

export async function getTopicAnalysisWithClusters(
  posts: string[],
  clusters: { id: number; posts: string[] }[]
): Promise<Omit<TopicAnalysis, 'healthScore'>> {
  return getTopicAnalysis(clusters, posts);
}

export async function getHistory(userId: string): Promise<HistoryItem[]> {
  const key = `threadsiq_analyses_${userId}`;
  const stored = localStorage.getItem(key);
  if (!stored) return [];
  
  try {
    const analyses = JSON.parse(stored) as Array<{
      id: string;
      posts: string[];
      result: AnalysisResult;
      createdAt: string;
    }>;
    
    return analyses.map(a => ({
      id: a.id,
      postCount: a.posts.length,
      clusterCount: a.result.topicAnalysis.clusters.length,
      noiseCount: a.result.labels.filter(l => l === -1).length,
      healthScore: a.result.topicAnalysis.healthScore,
      createdAt: a.createdAt,
    }));
  } catch {
    return [];
  }
}

export async function getUsage(userId: string): Promise<{ remaining: number }> {
  return { remaining: getUsageCount(userId) };
}

export async function getAnalysis(id: string): Promise<AnalysisResult> {
  // Find in localStorage across all users (simplified for demo)
  const keys = Object.keys(localStorage).filter(k => k.startsWith('threadsiq_analyses_'));
  
  for (const key of keys) {
    const stored = localStorage.getItem(key);
    if (stored) {
      const analyses = JSON.parse(stored);
      const found = analyses.find((a: { id: string; result: AnalysisResult }) => a.id === id);
      if (found) {
        return found.result;
      }
    }
  }
  
  throw new Error('找不到分析結果');
}
