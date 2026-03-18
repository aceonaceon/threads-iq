// @ts-ignore - umap-js type issue
import { UMAP } from 'umap-js';

// Cosine distance between two vectors (0 = identical, 2 = opposite)
function cosineDistance(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}

// DBSCAN with custom distance function
class DBSCAN {
  private distMatrix: number[][];

  constructor(distMatrix: number[][]) {
    this.distMatrix = distMatrix;
  }

  run(epsilon: number, minPts: number): { labels: number[]; clusterCount: number } {
    const n = this.distMatrix.length;
    const labels = new Array(n).fill(-1);
    const visited = new Array(n).fill(false);
    let clusterId = 0;

    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      visited[i] = true;

      const neighbors = this.regionQuery(i, epsilon);
      if (neighbors.length < minPts) {
        labels[i] = -1; // Noise
      } else {
        this.expandCluster(labels, visited, i, neighbors, clusterId, epsilon, minPts);
        clusterId++;
      }
    }

    return { labels, clusterCount: clusterId };
  }

  private regionQuery(i: number, epsilon: number): number[] {
    const neighbors: number[] = [];
    for (let j = 0; j < this.distMatrix.length; j++) {
      if (this.distMatrix[i][j] <= epsilon) {
        neighbors.push(j);
      }
    }
    return neighbors;
  }

  private expandCluster(
    labels: number[],
    visited: boolean[],
    pointIdx: number,
    neighbors: number[],
    clusterId: number,
    epsilon: number,
    minPts: number
  ) {
    labels[pointIdx] = clusterId;
    const queue = [...neighbors];
    const inQueue = new Set(neighbors);

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (!visited[current]) {
        visited[current] = true;
        const newNeighbors = this.regionQuery(current, epsilon);
        if (newNeighbors.length >= minPts) {
          for (const nn of newNeighbors) {
            if (!inQueue.has(nn)) {
              queue.push(nn);
              inQueue.add(nn);
            }
          }
        }
      }

      if (labels[current] === -1) {
        labels[current] = clusterId;
      }
    }
  }
}

// UMAP dimensionality reduction (for visualization only)
function reduceDimensionality(embeddings: number[][]): number[][] {
  const n = embeddings.length;
  if (n <= 2) {
    return embeddings.map(e => [e[0] || 0, e[1] || 0]);
  }

  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: Math.min(15, n - 1),
    minDist: 0.1,
    spread: 1.0,
  } as any);

  return umap.fit(embeddings);
}

export interface AnalysisResult {
  points2D: number[][];
  labels: number[];
  clusterCount: number;
  noiseCount: number;
  clusterSizes: number[];
}

export function runAnalysis(embeddings: number[][]): AnalysisResult {
  const n = embeddings.length;

  // Step 1: Build cosine distance matrix on RAW embeddings (1536-dim)
  const distMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = cosineDistance(embeddings[i], embeddings[j]);
      distMatrix[i][j] = d;
      distMatrix[j][i] = d;
    }
  }

  // Step 2: Adaptive epsilon using k-distance curve on cosine distances
  const k = Math.max(3, Math.min(5, Math.floor(n * 0.1)));
  const kthDists: number[] = [];
  for (let i = 0; i < n; i++) {
    const sorted = [...distMatrix[i]].filter((_, j) => j !== i).sort((a, b) => a - b);
    kthDists.push(sorted[k - 1]);
  }
  kthDists.sort((a, b) => a - b);

  // Use 75th percentile — balanced: catches true outliers without over-filtering
  const epsilon = kthDists[Math.floor(kthDists.length * 0.75)];
  const minPts = Math.max(2, Math.floor(n * 0.08));

  // Step 3: DBSCAN on cosine distance matrix
  const dbscan = new DBSCAN(distMatrix);
  const { labels, clusterCount } = dbscan.run(epsilon, minPts);

  // Step 4: UMAP for visualization only
  const points2D = reduceDimensionality(embeddings);

  const noiseCount = labels.filter(l => l === -1).length;
  const clusterSizes: number[] = [];
  for (let c = 0; c < clusterCount; c++) {
    clusterSizes.push(labels.filter(l => l === c).length);
  }

  return {
    points2D,
    labels,
    clusterCount,
    noiseCount,
    clusterSizes,
  };
}

export function calculateHealthScore(
  embeddings: number[][],
  labels: number[],
  clusterCount: number
): number {
  const n = embeddings.length;
  if (n === 0) return 0;

  const clusterSizes = new Map<number, number>();
  let noiseCount = 0;
  for (const label of labels) {
    if (label === -1) {
      noiseCount++;
    } else {
      clusterSizes.set(label, (clusterSizes.get(label) || 0) + 1);
    }
  }

  // 1. Concentration (30%): Largest cluster % of non-noise posts
  const nonNoise = n - noiseCount;
  const maxClusterSize = Math.max(...Array.from(clusterSizes.values()), 0);
  const concentration = nonNoise > 0 ? maxClusterSize / nonNoise : 0;

  // 2. Coverage (30%): % of posts in clusters (not noise)
  const coverage = nonNoise / n;

  // 3. Coherence (25%): Average intra-cluster cosine similarity
  let totalSim = 0;
  let pairCount = 0;
  for (const [clusterId] of clusterSizes) {
    const members = labels
      .map((l, i) => l === clusterId ? i : -1)
      .filter(i => i >= 0);
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        totalSim += 1 - cosineDistance(embeddings[members[a]], embeddings[members[b]]);
        pairCount++;
      }
    }
  }
  const coherence = pairCount > 0 ? totalSim / pairCount : 0;

  // 4. Focus (15%): Penalty for too many tiny clusters (fragmentation)
  const idealClusters = Math.max(1, Math.floor(n / 8)); // ~1 cluster per 8 posts
  const focusRatio = clusterCount <= idealClusters ? 1 : idealClusters / clusterCount;

  // Weighted score
  const score = (
    concentration * 0.30 +
    coverage * 0.30 +
    coherence * 0.25 +
    focusRatio * 0.15
  ) * 100;

  return Math.round(Math.max(0, Math.min(100, score)));
}
