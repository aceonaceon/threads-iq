import { useState } from 'react';
import { useAuth } from '../lib/auth';

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

export default function ThreadGenerator() {
  const { isAuthenticated } = useAuth();
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(7);
  const [style, setStyle] = useState<'casual' | 'professional' | 'story'>('casual');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<ThreadGeneratorResponse | null>(null);
  const [editedPosts, setEditedPosts] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError('請輸入主題');
      return;
    }

    setIsLoading(true);
    setError('');
    setResults(null);
    setEditedPosts({});

    try {
      const token = localStorage.getItem('threadsiq_token');
      const response = await fetch('/api/thread-generator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          topic: topic.trim(),
          count,
          style,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || '生成失敗，請稍後再試');
        return;
      }

      setResults(data);
    } catch (err) {
      setError('網路錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateSingle = async (_order: number) => {
    // For now, just show a message that this feature requires backend support
    alert('重新生成單則功能開發中');
  };

  const getEditedText = (post: ThreadPost): string => {
    return editedPosts[post.order] ?? post.text;
  };

  const handleTextChange = (order: number, value: string) => {
    setEditedPosts(prev => ({ ...prev, [order]: value }));
  };

  const copyAll = () => {
    if (!results) return;
    
    const allText = results.threads
      .map(post => getEditedText(post))
      .join('\n\n---\n\n');
    
    navigator.clipboard.writeText(allText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getScoreColor = (score: number): string => {
    if (score >= 8) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (score >= 6) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    return 'bg-red-500/20 text-red-400 border-red-500/30';
  };

  const getDiversityColor = (score: number): string => {
    if (score >= 0.7) return 'text-green-400';
    if (score >= 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] py-8">
      <div className="max-w-3xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">串文引擎</h1>
          <p className="text-gray-400">輸入主題，AI 自動生成吸睛串文</p>
        </div>

        {/* Input Form */}
        <div className="bg-surface rounded-xl p-6 border border-white/5 mb-6">
          <div className="space-y-5">
            {/* Topic Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                主題 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="例如：如何在 Threads 獲得更多讚"
                className="w-full px-4 py-3 bg-background border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Count Slider */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                串文數量：<span className="text-accent">{count}</span> 篇
              </label>
              <input
                type="range"
                min="5"
                max="10"
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value))}
                className="w-full h-2 bg-background rounded-lg appearance-none cursor-pointer accent-accent"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>5 篇</span>
                <span>10 篇</span>
              </div>
            </div>

            {/* Style Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                風格
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: 'casual', label: '口語化', desc: '輕鬆活潑' },
                  { value: 'professional', label: '專業分析', desc: '數據導向' },
                  { value: 'story', label: '故事型', desc: '情節生動' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setStyle(option.value as typeof style)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      style === option.value
                        ? 'border-accent bg-accent/10'
                        : 'border-white/10 bg-background hover:border-white/20'
                    }`}
                  >
                    <div className={`font-medium ${style === option.value ? 'text-accent' : 'text-white'}`}>
                      {option.label}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{option.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={isLoading || !topic.trim()}
              className="w-full py-3 bg-cta hover:bg-cta-hover disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  生成中...
                </>
              ) : (
                '🚀 生成串文'
              )}
            </button>
          </div>
        </div>

        {/* Results */}
        {results && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-400">
                  整體多樣性：
                  <span className={`ml-1 font-medium ${getDiversityColor(results.overallDiversity)}`}>
                    {Math.round(results.overallDiversity * 100)}%
                  </span>
                </div>
                <div className="text-sm text-gray-400">
                  {results.threads.length} 篇串文
                </div>
              </div>
              <button
                onClick={copyAll}
                className="px-4 py-2 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 rounded-lg text-sm font-medium transition-colors"
              >
                {copied ? '✓ 已複製' : '📋 一鍵複製全部'}
              </button>
            </div>

            {/* Suggestions */}
            {results.suggestions.length > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <div className="text-sm font-medium text-yellow-400 mb-2">💡 建議</div>
                <ul className="space-y-1">
                  {results.suggestions.map((suggestion, idx) => (
                    <li key={idx} className="text-sm text-gray-300">• {suggestion}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Thread Posts */}
            <div className="space-y-4">
              {results.threads.map((post) => (
                <div
                  key={post.order}
                  className="bg-surface rounded-xl border border-white/5 overflow-hidden"
                >
                  {/* Post Header */}
                  <div className="px-4 py-3 bg-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-full bg-accent/20 text-accent text-sm font-medium flex items-center justify-center">
                        {post.order}
                      </span>
                      <span className="text-sm text-gray-400">
                        {post.order === results.threads.length ? '結尾 CTA' : `第 ${post.order} 篇`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Hook Score Badge */}
                      <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getScoreColor(post.hookScore)}`}>
                        Hook: {post.hookScore}/10
                      </span>
                      {/* Diversity Warning */}
                      {post.diversityFlag && (
                        <span className="px-2 py-1 rounded-md text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                          ⚠️ 相似
                        </span>
                      )}
                      {/* Cannibalization Warning */}
                      {post.cannibalizationFlag && (
                        <span className="px-2 py-1 rounded-md text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                          🚫 蠶食
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Post Content */}
                  <div className="p-4">
                    <textarea
                      value={getEditedText(post)}
                      onChange={(e) => handleTextChange(post.order, e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 bg-background border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none"
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        {getEditedText(post).length} 字元
                      </span>
                      <button
                        onClick={() => handleRegenerateSingle(post.order)}
                        className="text-xs text-gray-400 hover:text-accent transition-colors"
                      >
                        重新生成
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Not Authenticated */}
        {!isAuthenticated && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">登入後可使用串文引擎</div>
            <a
              href="/login"
              className="inline-block px-6 py-3 bg-cta hover:bg-cta-hover text-white font-medium rounded-lg transition-colors"
            >
              立即登入
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
