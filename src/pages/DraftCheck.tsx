import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import PremiumOverlay from '../components/PremiumOverlay';

interface SemanticScore {
  score: number;
  verdict: string;
  explanation: string;
}

interface SimilarPost {
  text: string;
  similarity: number;
  index: number;
}

interface Cannibalization {
  detected: boolean;
  similarPosts: SimilarPost[];
}

interface HookAnalysis {
  hook: number;
  rhythm: number;
  cta: number;
  clickbaitRisk: '低' | '中' | '高';
  suggestions: string[];
}

interface EvaluationResult {
  semanticScore: SemanticScore;
  cannibalization: Cannibalization;
  hookAnalysis: HookAnalysis;
}

function getAuthToken(): string | null {
  return localStorage.getItem('threadsiq_token');
}

export default function DraftCheck() {
  const { isAuthenticated, login, user } = useAuth();
  
  const [hasHistory, setHasHistory] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState('');

  // Check if user has history on mount
  useEffect(() => {
    if (isAuthenticated) {
      const token = getAuthToken();
      fetch('/api/evaluate', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      })
        .then(res => res.json())
        .then(data => {
          setHasHistory(data.hasHistory || false);
          setLoading(false);
        })
        .catch(() => {
          setHasHistory(false);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const handleEvaluate = async () => {
    if (!draft.trim() || !isAuthenticated) return;

    setIsEvaluating(true);
    setError('');
    setResult(null);

    try {
      const token = getAuthToken();
      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ draft: draft.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'no_history') {
          setHasHistory(false);
          setError('請先進行一次完整分析');
        } else {
          setError(data.error || '分析失敗，請稍後再試');
        }
        return;
      }

      setResult(data);
    } catch (err) {
      setError('分析過程發生錯誤，請稍後再試');
    } finally {
      setIsEvaluating(false);
    }
  };

  const getVerdictLabel = (verdict: string) => {
    switch (verdict) {
      case 'strengthen': return { label: '強化', color: '#22C55E', bg: 'bg-green-500/10', border: 'border-green-500/30' };
      case 'neutral': return { label: '中性', color: '#EAB308', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' };
      case 'dilute': return { label: '稀釋', color: '#EF4444', bg: 'bg-red-500/10', border: 'border-red-500/30' };
      default: return { label: '未知', color: '#6B7280', bg: 'bg-gray-500/10', border: 'border-gray-500/30' };
    }
  };

  const getClickbaitColor = (risk: string) => {
    switch (risk) {
      case '低': return '#22C55E';
      case '中': return '#EAB308';
      case '高': return '#EF4444';
      default: return '#6B7280';
    }
  };

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="text-4xl mb-4">🔐</div>
          <h1 className="text-2xl font-bold mb-2">請先登入</h1>
          <p className="text-gray-500 mb-6">
            登入 LINE 帳號以使用發文前檢查功能
          </p>
          <button
            onClick={login}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#06C755] hover:bg-[#05B54C] text-white font-medium rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
            </svg>
            LINE 登入
          </button>
        </div>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Get user plan - check if paid user
  const userPlan = (user as any)?.plan;
  const isPaidUser = userPlan === 'creator' || userPlan === 'pro';

  // Free users ALWAYS see PremiumOverlay first (regardless of history)
  if (!isPaidUser) {
    return (
      <>
        <PremiumOverlay featureName="發文前語意評分" requiredPlan="creator" />
        <div className="min-h-[calc(100vh-4rem)] py-8 px-4">
          <div className="max-w-3xl mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">發文前檢查</h1>
              <p className="text-gray-500">
                輸入你的草稿，AI 會分析語意方向、檢測蠶食風險、評估 Hook 品質
              </p>
            </div>

            {/* Draft Input - blurred since premium feature */}
            <div className="bg-surface rounded-xl p-6 mb-8 opacity-50 pointer-events-none">
              <label className="block text-sm font-medium text-gray-400 mb-3">
                貼文草稿
              </label>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="在此輸入你的 Threads 草稿..."
                className="w-full h-48 bg-gray-900 border border-gray-800 rounded-lg p-4 text-gray-200 placeholder-gray-600 focus:border-accent focus:outline-none resize-y"
                disabled
              />
            </div>
          </div>
        </div>
      </>
    );
  }

  // Paid users: only show "no history" message if they haven't done an analysis yet
  if (!hasHistory) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="text-4xl mb-4">📊</div>
          <h1 className="text-2xl font-bold mb-2">請先進行一次完整分析</h1>
          <p className="text-gray-500 mb-6">
            發文前檢查需要先分析你的歷史貼文，建立語意基準線
          </p>
          <Link
            to="/analyze"
            className="inline-block px-6 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl transition-colors"
          >
            前往分析 →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] py-8 px-4">
      <PremiumOverlay featureName="發文前語意評分" requiredPlan="creator" />
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">發文前檢查</h1>
          <p className="text-gray-500">
            輸入你的草稿，AI 會分析語意方向、檢測蠶食風險、評估 Hook 品質
          </p>
        </div>

        {/* Draft Input */}
        <div className="bg-surface rounded-xl p-6 mb-8">
          <label className="block text-sm font-medium text-gray-400 mb-3">
            貼文草稿
          </label>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="在此輸入你的 Threads 草稿..."
            className="w-full h-48 bg-gray-900 border border-gray-800 rounded-lg p-4 text-gray-200 placeholder-gray-600 focus:border-accent focus:outline-none resize-y"
          />
          <div className="flex items-center justify-between mt-4">
            <span className="text-gray-500 text-sm">
              {draft.length} 字
            </span>
            <button
              onClick={handleEvaluate}
              disabled={isEvaluating || !draft.trim()}
              className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                isEvaluating || !draft.trim()
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  : 'bg-accent hover:bg-accent-hover text-white'
              }`}
            >
              {isEvaluating ? '分析中...' : '開始檢查'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 mb-6 text-red-400 text-center">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Semantic Score Card */}
            <div className={`bg-surface rounded-xl p-6 border ${getVerdictLabel(result.semanticScore.verdict).border}`}>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>📈</span> 語意評分
              </h3>
              <div className="flex items-center gap-4 mb-4">
                <div
                  className="text-5xl font-bold"
                  style={{ color: getVerdictLabel(result.semanticScore.verdict).color }}
                >
                  {result.semanticScore.score}
                </div>
                <div
                  className={`px-3 py-1 rounded-full text-sm font-medium ${getVerdictLabel(result.semanticScore.verdict).bg}`}
                  style={{ color: getVerdictLabel(result.semanticScore.verdict).color }}
                >
                  {getVerdictLabel(result.semanticScore.verdict).label}
                </div>
              </div>
              <p className="text-gray-400 text-sm">
                {result.semanticScore.explanation}
              </p>
            </div>

            {/* Cannibalization Alert */}
            <div className={`bg-surface rounded-xl p-6 border ${
              result.cannibalization.detected
                ? 'border-yellow-500/30'
                : 'border-green-500/30'
            }`}>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>{result.cannibalization.detected ? '⚠️' : '✅'}</span> 內容蠶食偵測
              </h3>
              {result.cannibalization.detected ? (
                <div>
                  <p className="text-yellow-400 mb-3">
                    發現 {result.cannibalization.similarPosts.length} 篇相似度過高的歷史貼文
                  </p>
                  <div className="space-y-3">
                    {result.cannibalization.similarPosts.map((post, idx) => (
                      <div key={idx} className="bg-gray-900/50 rounded-lg p-3">
                        <div className="text-gray-400 text-xs mb-1">
                          歷史貼文 #{post.index} · 相似度 {Math.round(post.similarity * 100)}%
                        </div>
                        <div className="text-gray-300 text-sm line-clamp-2">
                          {post.text}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-green-400">
                  這篇草稿與歷史貼文的相似度適中，不會造成內容蠶食
                </p>
              )}
            </div>

            {/* Hook Analysis - Radar Chart Alternative (using bars) */}
            <div className="bg-surface rounded-xl p-6 border border-gray-800">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>🎯</span> Hook 格式評分
              </h3>
              
              {/* Score bars */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                {/* Hook */}
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-400 text-sm">開頭吸引力</span>
                    <span className="text-accent font-medium">{result.hookAnalysis.hook}/10</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all"
                      style={{ width: `${result.hookAnalysis.hook * 10}%` }}
                    />
                  </div>
                </div>
                
                {/* Rhythm */}
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-400 text-sm">段落節奏</span>
                    <span className="text-accent font-medium">{result.hookAnalysis.rhythm}/10</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all"
                      style={{ width: `${result.hookAnalysis.rhythm * 10}%` }}
                    />
                  </div>
                </div>
                
                {/* CTA */}
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-400 text-sm">呼籲行動</span>
                    <span className="text-accent font-medium">{result.hookAnalysis.cta}/10</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all"
                      style={{ width: `${result.hookAnalysis.cta * 10}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Clickbait risk */}
              <div className="flex items-center justify-between py-3 border-t border-gray-800">
                <span className="text-gray-400">Clickbait 風險</span>
                <span
                  className="px-3 py-1 rounded-full text-sm font-medium"
                  style={{
                    color: getClickbaitColor(result.hookAnalysis.clickbaitRisk),
                    backgroundColor: `${getClickbaitColor(result.hookAnalysis.clickbaitRisk)}20`
                  }}
                >
                  {result.hookAnalysis.clickbaitRisk}
                </span>
              </div>

              {/* Suggestions */}
              {result.hookAnalysis.suggestions && result.hookAnalysis.suggestions.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <h4 className="text-sm font-medium text-gray-400 mb-3">💡 改善建議</h4>
                  <ul className="space-y-2">
                    {result.hookAnalysis.suggestions.map((suggestion, idx) => (
                      <li key={idx} className="text-gray-300 text-sm flex items-start gap-2">
                        <span className="text-accent">•</span>
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Restart button */}
            <button
              onClick={() => { setResult(null); setDraft(''); }}
              className="w-full py-3 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-700 rounded-xl font-medium transition-colors"
            >
              再次檢查
            </button>
          </div>
        )}
      </div>
    </div>
  );
}