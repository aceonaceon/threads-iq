import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import type { AnalysisResult } from '../lib/api';

interface StoredAnalysis {
  id: string;
  posts: string[];
  result: AnalysisResult;
  createdAt: string;
}

export default function History() {
  const { user } = useAuth();
  const [analyses, setAnalyses] = useState<StoredAnalysis[]>([]);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('threadsiq_analyses') || '[]');
    setAnalyses(stored);
  }, []);

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#22C55E';
    if (score >= 60) return '#84CC16';
    if (score >= 40) return '#EAB308';
    return '#EF4444';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-TW', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">請先登入查看歷史記錄</p>
          <Link
            to="/login"
            className="px-6 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl transition-colors"
          >
            登入
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">歷史記錄</h1>
            <p className="text-gray-500">追蹤你的內容演變</p>
          </div>
          <Link
            to="/analyze"
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
          >
            + 新分析
          </Link>
        </div>

        {analyses.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">📊</div>
            <h2 className="text-xl font-medium mb-2">還沒有分析記錄</h2>
            <p className="text-gray-500 mb-6">開始你的第一次 Threads 分析吧</p>
            <Link
              to="/analyze"
              className="px-6 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl transition-colors"
            >
              開始分析
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Trend chart placeholder */}
            <div className="bg-surface rounded-xl p-6 mb-6">
              <h3 className="text-sm font-medium text-gray-400 mb-4">健康分數趨勢</h3>
              <div className="flex items-end gap-2 h-24">
                {analyses.slice(0, 10).reverse().map((a) => {
                  const score = a.result.topicAnalysis.healthScore;
                  const height = (score / 100) * 80;
                  return (
                    <div
                      key={a.id}
                      className="flex-1 bg-accent/30 rounded-t hover:bg-accent/50 transition-colors cursor-pointer"
                      style={{ height: `${height}px` }}
                      title={`${formatDate(a.createdAt)}: ${score}分`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-gray-600 mt-2">
                <span>較早</span>
                <span>最近</span>
              </div>
            </div>

            {/* Analysis list */}
            {analyses.map((analysis) => {
              const { id, posts, result, createdAt } = analysis;
              const { healthScore, clusters } = result.topicAnalysis;
              const postCount = posts.length;
              const clusterCount = clusters.length;

              return (
                <Link
                  key={id}
                  to={`/report/${id}`}
                  className="block bg-surface hover:bg-surface-hover rounded-xl p-4 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span
                          className="text-2xl font-bold"
                          style={{ color: getScoreColor(healthScore) }}
                        >
                          {healthScore}
                        </span>
                        <span className="text-gray-500 text-sm">分</span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {postCount} 篇貼文 · {clusterCount} 個主題
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-400">{formatDate(createdAt)}</div>
                      <div className="text-accent text-sm mt-1">查看報告 →</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
