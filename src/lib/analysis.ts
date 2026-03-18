// @ts-ignore - umap-js type issue
import UMAP from 'umap-js';

// Simple DBSCAN implementation
class DBSCAN {
  run(points: number[][], epsilon: number, minPts: number): number[][] {
    const labels: number[] = new Array(points.length).fill(-1);
    let clusterId = 0;

    for (let i = 0; i < points.length; i++) {
      if (labels[i] !== -1) continue;

      const neighbors = this.getNeighbors(points, i, epsilon);
      if (neighbors.length < minPts) {
        labels[i] = -1; // Noise
      } else {
        this.expandCluster(points, labels, i, neighbors, clusterId, epsilon, minPts);
        clusterId++;
      }
    }

    const clusters: number[][] = [];
    for (let c = 0; c < clusterId; c++) {
      clusters.push([]);
    }
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] >= 0) {
        clusters[labels[i]].push(i);
      }
    }

    return clusters.filter(c => c.length > 0);
  }

  private getNeighbors(points: number[][], i: number, epsilon: number): number[] {
    const neighbors: number[] = [];
    for (let j = 0; j < points.length; j++) {
      if (this.distance(points[i], points[j]) <= epsilon) {
        neighbors.push(j);
      }
    }
    return neighbors;
  }

  private distance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
  }

  private expandCluster(
    points: number[][],
    labels: number[],
    pointIdx: number,
    neighbors: number[],
    clusterId: number,
    epsilon: number,
    minPts: number
  ) {
    labels[pointIdx] = clusterId;
    const queue = [...neighbors];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (labels[current] === -1) {
        labels[current] = clusterId;
        const newNeighbors = this.getNeighbors(points, current, epsilon);
        if (newNeighbors.length >= minPts) {
          queue.push(...newNeighbors);
        }
      } else if (labels[current] === -1) {
        // Already visited but was noise, now part of cluster
        labels[current] = clusterId;
      }
    }
  }
}

// UMAP dimensionality reduction
function reduceDimensionality(embeddings: number[][], nComponents: number = 2): number[][] {
  const n = embeddings.length;
  
  if (n <= nComponents) {
    return embeddings.map(e => [...e.slice(0, nComponents)]);
  }

  // Use UMAP for dimensionality reduction
  const umap = new UMAP({
    nComponents,
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
  // Step 1: Reduce dimensionality with UMAP
  const points2D = reduceDimensionality(embeddings, 2);

  // Step 2: Run DBSCAN
  const dbscan = new DBSCAN();
  const epsilon = Math.max(0.5, 1.5 - (embeddings.length - 5) * 0.05); // Adaptive epsilon
  const minPts = Math.max(2, Math.floor(embeddings.length * 0.2));
  
  const clusters = dbscan.run(points2D, epsilon, minPts);

  // Step 3: Map cluster assignments
  const labels = new Array(embeddings.length).fill(-1);
  clusters.forEach((cluster, idx) => {
    cluster.forEach(pointIdx => {
      labels[pointIdx] = idx;
    });
  });

  const clusterCount = clusters.length;
  const noiseCount = labels.filter(l => l === -1).length;
  const clusterSizes = clusters.map(c => c.length);

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

  // 1. Concentration (40%): Largest cluster % of total
  const clusterSizes = new Map<number, number>();
  let noiseCount = 0;
  for (const label of labels) {
    if (label === -1) {
      noiseCount++;
    } else {
      clusterSizes.set(label, (clusterSizes.get(label) || 0) + 1);
    }
  }

  const maxClusterSize = Math.max(...Array.from(clusterSizes.values()), 0);
  const concentration = maxClusterSize / n;

  // 2. Coherence (30%): Average intra-cluster similarity (simplified)
  // Using variance of cluster sizes as proxy
  const sizes = Array.from(clusterSizes.values());
  const avgSize = sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0;
  const variance = sizes.length > 0 
    ? sizes.reduce((acc, s) => acc + (s - avgSize) ** 2, 0) / sizes.length 
    : 0;
  const normalizedVariance = avgSize > 0 ? Math.min(variance / (avgSize * avgSize), 1) : 1;
  const coherence = 1 - normalizedVariance;

  // 3. Coverage (20%): % of posts in clusters
  const coverage = (n - noiseCount) / n;

  // 4. Balance (10%): Evenness of cluster sizes (simplified Gini)
  const balance = clusterCount > 1 ? 1 - (variance / (avgSize * avgSize || 1)) : 1;

  // Weighted score
  const score = (
    concentration * 0.4 +
    coherence * 0.3 +
    coverage * 0.2 +
    balance * 0.1
  ) * 100;

  return Math.round(Math.max(0, Math.min(100, score)));
}
