import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import PostInput from '../components/PostInput';
import { runAnalysis, getTopicAnalysisWithClusters, AnalysisResult } from '../lib/api';
import { runAnalysis as runClientAnalysis, calculateHealthScore } from '../lib/analysis';

const MIN_POSTS = 5;
const MAX_POSTS = 30;
const MAX_FREE_USES = 3;

export default function Analyze() {
  const { user, loginAsGuest } = useAuth();
  const navigate = useNavigate();
  
  const [posts, setPosts] = useState<string[]>(['', '', '', '', '']);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [remainingUses, setRemainingUses] = useState(MAX_FREE_USES);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');

  useEffect(() => {
    if (!user) {
      loginAsGuest();
    }
  }, [user, loginAsGuest]);

  // Load remaining uses from localStorage on mount
  useEffect(() => {
    if (user) {
      const stored = localStorage.getItem(`threadsiq_usage_${user.id}`);
      const count = stored ? parseInt(stored, 10) : MAX_FREE_USES;
      setRemainingUses(count);
    }
  }, [user]);

  const validPosts = posts.filter(p => p.trim().length > 0);

  const handleBulkImport = () => {
    const separator = bulkText.includes('\n---\n') ? '\n---\n' : '\n===\n';
    const imported = bulkText
      .split(separator)
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .slice(0, MAX_POSTS);
    if (imported.length >= MIN_POSTS) {
      setPosts(imported);
      setShowBulkImport(false);
      setBulkText('');
    }
  };

  const addPost = () => {
    if (posts.length < MAX_POSTS) {
      setPosts([...posts, '']);
    }
  };

  const updatePost = (index: number, value: string) => {
    const newPosts = [...posts];
    newPosts[index] = value;
    setPosts(newPosts);
  };

  const removePost = (index: number) => {
    if (posts.length > MIN_POSTS) {
      const newPosts = posts.filter((_, i) => i !== index);
      setPosts(newPosts);
    }
  };

  const handleAnalyze = async () => {
    if (!user || validPosts.length < MIN_POSTS) return;

    setIsAnalyzing(true);
    setError('');

    try {
      // Step 1: Get embeddings from server
      setStep('正在分析你的貼文語意...');
      
      const result = await runAnalysis(validPosts, user.id);
      
      // Step 2: Run client-side UMAP + DBSCAN
      setStep('計算語意距離與集群分組...');
      const { points2D, labels, clusterCount } = runClientAnalysis(result.embeddings);
      
      // Step 3: Get cluster info for topic analysis
      const clusters: { id: number; posts: string[] }[] = [];
      for (let i = 0; i < clusterCount; i++) {
        const clusterPostIndices = labels
          .map((label, idx) => label === i ? idx : -1)
          .filter(idx => idx !== -1);
        const clusterPosts = clusterPostIndices.map(idx => validPosts[idx]);
        clusters.push({ id: i, posts: clusterPosts });
      }
      
      // Step 4: Get topic analysis from API
      setStep('AI 正在生成建議...');
      const topicAnalysis = await getTopicAnalysisWithClusters(validPosts, clusters);
      
      // Step 5: Calculate health score
      setStep('計算健康分數...');
      const healthScore = calculateHealthScore(result.embeddings, labels, clusterCount);
      
      // Step 6: Build final result
      const analysisResult: AnalysisResult = {
        ...result,
        points2D,
        labels,
        topicAnalysis: {
          ...topicAnalysis,
          healthScore,
        },
      };
      
      // Save to localStorage
      const storageKey = `threadsiq_analyses_${user.id}`;
      const existingAnalyses = JSON.parse(localStorage.getItem(storageKey) || '[]');
      existingAnalyses.unshift({
        id: result.id,
        posts: validPosts,
        result: analysisResult,
        createdAt: new Date().toISOString(),
      });
      localStorage.setItem(storageKey, JSON.stringify(existingAnalyses));
      
      setRemainingUses(result.remainingUses);
      navigate(`/report/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失敗，請稍後再試');
    } finally {
      setIsAnalyzing(false);
      setStep('');
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">輸入你的 Threads 貼文</h1>
          <p className="text-gray-500">
            貼上你最近發布的 {MIN_POSTS}-{MAX_POSTS} 篇貼文，讓 AI 分析你的內容主題
          </p>
        </div>

        {/* Bulk import toggle */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowBulkImport(!showBulkImport)}
            className="text-sm text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
          >
            {showBulkImport ? '← 逐篇輸入' : '📋 批量匯入'}
          </button>
        </div>

        {/* Bulk import panel */}
        {showBulkImport && (
          <div className="bg-surface rounded-xl p-6 mb-8">
            <h3 className="text-lg font-semibold mb-2">批量匯入貼文</h3>
            <p className="text-gray-500 text-sm mb-4">
              將多篇貼文貼在下方，每篇之間用 <code className="bg-gray-800 px-1.5 py-0.5 rounded text-accent">---</code> 分隔
            </p>
            <textarea
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              placeholder={`第一篇貼文內容...\n---\n第二篇貼文內容...\n---\n第三篇貼文內容...`}
              className="w-full h-64 bg-gray-900 border border-gray-800 rounded-lg p-4 text-gray-200 placeholder-gray-600 focus:border-accent focus:outline-none resize-y text-sm"
            />
            <div className="flex items-center justify-between mt-4">
              <span className="text-gray-500 text-sm">
                偵測到 {bulkText.split(bulkText.includes('\n---\n') ? '\n---\n' : '\n===\n').filter(p => p.trim()).length} 篇貼文
              </span>
              <button
                onClick={handleBulkImport}
                disabled={bulkText.split(bulkText.includes('\n---\n') ? '\n---\n' : '\n===\n').filter(p => p.trim()).length < MIN_POSTS}
                className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                  bulkText.split(bulkText.includes('\n---\n') ? '\n---\n' : '\n===\n').filter(p => p.trim()).length >= MIN_POSTS
                    ? 'bg-accent hover:bg-accent-hover text-white'
                    : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                }`}
              >
                匯入
              </button>
            </div>
          </div>
        )}

        {/* Remaining uses */}
        <div className="bg-surface rounded-xl p-4 mb-8 flex items-center justify-between">
          <span className="text-gray-400">剩餘免費分析次數</span>
          <div className="flex gap-1">
            {Array.from({ length: MAX_FREE_USES }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full ${
                  i < remainingUses ? 'bg-accent' : 'bg-gray-700'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Post inputs */}
        <div className="space-y-4 mb-8">
          {posts.map((post, index) => (
            <PostInput
              key={index}
              index={index}
              value={post}
              onChange={(value) => updatePost(index, value)}
              onRemove={() => removePost(index)}
              canRemove={posts.length > MIN_POSTS}
            />
          ))}
        </div>

        {/* Add more button */}
        {posts.length < MAX_POSTS && (
          <button
            onClick={addPost}
            className="w-full py-3 border-2 border-dashed border-gray-800 rounded-xl text-gray-500 hover:border-gray-700 hover:text-gray-400 transition-colors mb-8"
          >
            + 新增貼文
          </button>
        )}

        {/* Error message */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 mb-6 text-red-400 text-center">
            {error}
          </div>
        )}

        {/* Analyzing state */}
        {isAnalyzing && (
          <div className="bg-surface rounded-xl p-8 mb-6">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-gray-300">{step}</span>
            </div>
            <div className="text-center text-gray-500 text-sm">
              這可能需要幾秒鐘...
            </div>
          </div>
        )}

        {/* Submit button */}
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || validPosts.length < MIN_POSTS || remainingUses <= 0}
          className={`w-full py-4 rounded-xl font-semibold text-lg transition-all ${
            isAnalyzing || validPosts.length < MIN_POSTS || remainingUses <= 0
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
              : 'bg-accent hover:bg-accent-hover text-white hover:scale-[1.02]'
          }`}
        >
          {isAnalyzing ? '分析中...' : '開始分析'}
        </button>

        {/* Post count hint */}
        <p className="text-center text-gray-600 text-sm mt-4">
          已輸入 {validPosts.length} 篇貼文（最少 {MIN_POSTS} 篇）
        </p>
      </div>
    </div>
  );
}
