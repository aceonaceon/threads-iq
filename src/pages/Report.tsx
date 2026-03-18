import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import AnalysisReport from '../components/AnalysisReport';
import type { AnalysisResult } from '../lib/api';

interface StoredAnalysis {
  id: string;
  posts: string[];
  result: AnalysisResult;
  createdAt: string;
}

export default function Report() {
  const { id } = useParams<{ id: string }>();
  const [analysis, setAnalysis] = useState<StoredAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Search across all user storage keys for this analysis
    let found: StoredAnalysis | null = null;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('threadsiq_analyses')) {
        try {
          const analyses: StoredAnalysis[] = JSON.parse(localStorage.getItem(key) || '[]');
          const match = analyses.find((a) => a.id === id);
          if (match) {
            found = match;
            break;
          }
        } catch {}
      }
    }
    setAnalysis(found);
    setLoading(false);
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4">
        <h1 className="text-2xl font-bold mb-4">找不到分析報告</h1>
        <p className="text-gray-500 mb-6">這份報告可能已被刪除或不存在</p>
        <Link
          to="/analyze"
          className="px-6 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl transition-colors"
        >
          開始新分析
        </Link>
      </div>
    );
  }

  const { posts, result, createdAt } = analysis;
  const date = new Date(createdAt).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div>
      {/* Header */}
      <div className="bg-surface border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">分析報告</h1>
            <p className="text-sm text-gray-500">{date}</p>
          </div>
          <Link
            to="/analyze"
            className="text-accent hover:text-accent-hover text-sm font-medium"
          >
            + 新分析
          </Link>
        </div>
      </div>

      {/* Report content */}
      <AnalysisReport result={result} posts={posts} />
    </div>
  );
}
