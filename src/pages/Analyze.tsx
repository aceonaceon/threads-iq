import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import PostInput from '../components/PostInput';
import { runAnalysis, getTopicAnalysisWithClusters, AnalysisResult } from '../lib/api';
import { runAnalysis as runClientAnalysis, calculateHealthScore } from '../lib/analysis';

const MIN_POSTS = 5;
const MAX_POSTS = 30;
const MAX_FREE_USES = 3;

function getAuthToken(): string | null {
  return localStorage.getItem('threadsiq_token');
}

export default function Analyze() {
  const { user, isAuthenticated, login, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [posts, setPosts] = useState<string[]>(['', '', '', '', '']);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [weeklyRemaining, setWeeklyRemaining] = useState(MAX_FREE_USES);
  const [bonusRemaining, setBonusRemaining] = useState(0);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [showUsageExceededModal, setShowUsageExceededModal] = useState(false);
  
  // Threads OAuth state
  const [threadsConnected, setThreadsConnected] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [threadsAuthMessage, setThreadsAuthMessage] = useState('');

  // Load user data on mount
  useEffect(() => {
    if (isAuthenticated) {
      refreshUser().then(() => {
        // Get remaining uses from auth
        const token = getAuthToken();
        if (token) {
          fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then(res => res.json())
            .then(data => {
              setWeeklyRemaining(data.weeklyRemaining ?? MAX_FREE_USES);
              setBonusRemaining(data.bonusUses ?? 0);
            })
            .catch(console.error);
        }
      });
      
      // Check Threads connection status
      checkThreadsStatus();
    }
  }, [isAuthenticated, refreshUser]);

  // Handle Threads OAuth callback messages
  useEffect(() => {
    const authStatus = searchParams.get('threads_auth');
    if (authStatus) {
      if (authStatus === 'success') {
        setThreadsConnected(true);
        setThreadsAuthMessage('✅ Threads 帳號已連結成功！');
        setTimeout(() => setThreadsAuthMessage(''), 5000);
      } else if (authStatus === 'error') {
        setThreadsAuthMessage('❌ Threads 連結失敗，請稍後再試');
        setTimeout(() => setThreadsAuthMessage(''), 5000);
      }
      // Clean up URL
      window.history.replaceState(null, '', '/analyze');
    }
  }, [searchParams]);

  // Check Threads connection status
  const checkThreadsStatus = async () => {
    const token = getAuthToken();
    if (!token) return;
    
    try {
      const res = await fetch('/api/threads/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setThreadsConnected(data.connected || false);
    } catch (e) {
      console.error('Failed to check threads status:', e);
    }
  };

  // Connect to Threads (trigger OAuth flow)
  const connectThreads = () => {
    const lineToken = localStorage.getItem('threadsiq_token');
    if (!lineToken) return;
    window.location.href = `/api/auth/threads/login?token=${encodeURIComponent(lineToken)}`;
  };

  // Auto-import posts from Threads
  const importFromThreads = async () => {
    const token = getAuthToken();
    if (!token) return;
    
    setIsImporting(true);
    setImportProgress('正在取得你的 Threads 貼文...');
    
    try {
      const res = await fetch('/api/threads/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        if (data.error === 'threads_not_connected') {
          setThreadsAuthMessage('請先連結 Threads 帳號');
          connectThreads();
          return;
        }
        throw new Error(data.error || 'import_failed');
      }
      
      if (data.posts && data.posts.length > 0) {
        setImportProgress(`已取得 ${data.count} 篇貼文，正在處理...`);
        
        // Extract text from posts
        const importedPosts = data.posts
          .map((p: any) => p.text)
          .filter((t: string) => t && t.trim().length > 0);
        
        if (importedPosts.length >= MIN_POSTS) {
          setPosts(importedPosts.slice(0, MAX_POSTS));
          setImportProgress(`✅ 成功匯入 ${importedPosts.length} 篇貼文！`);
        } else {
          setImportProgress(`⚠️ 只取得 ${importedPosts.length} 篇文字貼文，至少需要 ${MIN_POSTS} 篇`);
        }
      } else {
        setImportProgress('⚠️ 沒有找到任何貼文，請確認你的 Threads 帳號有公開貼文');
      }
    } catch (e: any) {
      console.error('Import failed:', e);
      setImportProgress('❌ 匯入失敗，請稍後再試');
    } finally {
      setIsImporting(false);
      setTimeout(() => setImportProgress(''), 5000);
    }
  };

  const totalRemaining = weeklyRemaining + bonusRemaining;

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated && !user) {
      // Don't auto-login as guest anymore
    }
  }, [isAuthenticated, user]);

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
    if (!isAuthenticated || !user || validPosts.length < MIN_POSTS) return;

    setIsAnalyzing(true);
    setError('');

    try {
      // Step 1: Get embeddings from server (includes usage check)
      setStep('正在分析你的貼文語意...');
      
      const result = await runAnalysis(validPosts, user.id);
      
      // Step 2: Run client-side UMAP + DBSCAN
      setStep('計算語意距離與集群分組...');
      const { points2D, labels, clusterCount } = runClientAnalysis(result.embeddings);
      
      // Step 3: Get cluster info for topic analysis
      const clusters: { id: number; posts: string[] }[] = [];
      if (clusterCount === 0) {
        // Fallback: treat all posts as one cluster
        clusters.push({ id: 0, posts: validPosts });
      } else {
        for (let i = 0; i < clusterCount; i++) {
          const clusterPostIndices = labels
            .map((label, idx) => label === i ? idx : -1)
            .filter(idx => idx !== -1);
          const clusterPosts = clusterPostIndices.map(idx => validPosts[idx]);
          clusters.push({ id: i, posts: clusterPosts });
        }
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
      
      // Save to cloud
      const token = getAuthToken();
      if (token) {
        const saveResponse = await fetch('/api/analyses/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            id: result.id,
            posts: validPosts,
            result: analysisResult,
          }),
        });
        
        if (saveResponse.ok) {
          const saveData = await saveResponse.json();
          // Update remaining uses from response
          if (saveData.remaining !== undefined) {
            setWeeklyRemaining(saveData.remaining);
          }
          if (saveData.bonusRemaining !== undefined) {
            setBonusRemaining(saveData.bonusRemaining);
          }
        }
      }
      
      navigate(`/report/${result.id}`);
    } catch (err: any) {
      // Handle usage exceeded error
      if (err.message === 'usage_exceeded' || (err.response?.data?.error === 'usage_exceeded')) {
        setShowUsageExceededModal(true);
      } else {
        setError(err instanceof Error ? err.message : '分析失敗，請稍後再試');
      }
    } finally {
      setIsAnalyzing(false);
      setStep('');
    }
  };

  // Not authenticated - show login prompt
  if (!isAuthenticated) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="text-4xl mb-4">🔐</div>
          <h1 className="text-2xl font-bold mb-2">請先登入</h1>
          <p className="text-gray-500 mb-6">
            登入 LINE 帳號以使用分析功能
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

  return (
    <>
      {/* Usage Exceeded Modal */}
      {showUsageExceededModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-surface rounded-2xl p-8 max-w-md w-full text-center border border-gray-700">
            <div className="text-5xl mb-4">😔</div>
            <h2 className="text-2xl font-bold mb-2">本週免費次數已用完</h2>
            <p className="text-gray-400 mb-6">
              別擔心！分享連結給朋友，立即獲得 10 次額外分析
            </p>
            <div className="flex flex-col gap-3">
              <Link
                to="/affiliate"
                onClick={() => setShowUsageExceededModal(false)}
                className="px-6 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl transition-colors"
              >
                分享連結獲得更多次數 →
              </Link>
              <button
                onClick={() => setShowUsageExceededModal(false)}
                className="text-gray-500 hover:text-gray-400 text-sm transition-colors"
              >
                先不要
              </button>
            </div>
            <p className="text-gray-600 text-xs mt-4">
              升級付費（即將推出）
            </p>
          </div>
        </div>
      )}

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

          {/* Threads OAuth Section */}
          {isAuthenticated && user && (
            <div className="bg-surface rounded-xl p-6 mb-8 border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">🧵</div>
                  <div>
                    <h3 className="text-lg font-semibold">Threads 自動匯入</h3>
                    <p className="text-gray-500 text-sm">
                      {threadsConnected 
                        ? '已連結 Threads 帳號，一鍵匯入所有貼文' 
                        : '連結你的 Threads 帳號，自動匯入貼文'}
                    </p>
                  </div>
                </div>
                
                {!threadsConnected ? (
                  <button
                    onClick={connectThreads}
                    className="px-4 py-2 bg-[#1877F2] hover:bg-[#1861CB] text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
                    </svg>
                    連結 Threads
                  </button>
                ) : (
                  <button
                    onClick={importFromThreads}
                    disabled={isImporting}
                    className="px-4 py-2 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isImporting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        匯入中...
                      </>
                    ) : (
                      <>
                        ⚡ 自動匯入
                      </>
                    )}
                  </button>
                )}
              </div>
              
              {/* Import progress/status message */}
              {importProgress && (
                <div className={`text-sm ${importProgress.includes('✅') ? 'text-green-400' : importProgress.includes('❌') ? 'text-red-400' : 'text-gray-400'}`}>
                  {importProgress}
                </div>
              )}
              
              {/* Threads auth message */}
              {threadsAuthMessage && (
                <div className={`text-sm ${threadsAuthMessage.includes('✅') ? 'text-green-400' : 'text-red-400'}`}>
                  {threadsAuthMessage}
                </div>
              )}
            </div>
          )}

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

          {/* Remaining uses - Updated to show weekly + bonus */}
          <div className="bg-surface rounded-xl p-4 mb-8 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">剩餘次數</span>
              {bonusRemaining > 0 && (
                <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full">
                  +{bonusRemaining} 獎勵
                </span>
              )}
            </div>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(totalRemaining, MAX_FREE_USES) }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full ${
                    i < weeklyRemaining ? 'bg-accent' : 'bg-yellow-500'
                  }`}
                />
              ))}
              {totalRemaining === 0 && (
                <span className="text-red-400 text-sm">已用完</span>
              )}
              {totalRemaining > MAX_FREE_USES && (
                <span className="text-yellow-500 text-sm ml-2">+{totalRemaining - MAX_FREE_USES}</span>
              )}
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
            disabled={isAnalyzing || validPosts.length < MIN_POSTS || totalRemaining <= 0}
            className={`w-full py-4 rounded-xl font-semibold text-lg transition-all ${
              isAnalyzing || validPosts.length < MIN_POSTS || totalRemaining <= 0
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
    </>
  );
}
