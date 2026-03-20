import { useState, useEffect, useCallback } from 'react';

interface ImportProgressProps {
  onImportComplete: (posts: any[], data: any) => void;
  onError?: (error: string) => void;
}

type ImportStatus = 'idle' | 'connecting' | 'importing' | 'processing' | 'completed' | 'error';

function getAuthToken(): string | null {
  return localStorage.getItem('threadsiq_token');
}

export default function ImportProgress({ onImportComplete, onError }: ImportProgressProps) {
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [target, setTarget] = useState(300);
  const [error, setError] = useState('');
  const [postCount, setPostCount] = useState(0);
  const [dateRange, setDateRange] = useState<{ earliest: string; latest: string } | null>(null);
  const [embeddingProgress, setEmbeddingProgress] = useState(0);

  // Check if import is already complete on mount
  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    
    (async () => {
      try {
        const res = await fetch('/api/import/status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        
        if (data.phase_a_completed_at) {
          const totalPosts = data.total_fetched || 0;
          const withEmb = data.total_with_embedding || 0;
          
          // Phase A done, check embeddings
          if (withEmb >= Math.min(totalPosts, 300)) {
            // All Phase A embeddings done
            setStatus('completed');
            setPostCount(withEmb);
            setProgress(withEmb);
            setTarget(withEmb);
            if (data.earliest_post && data.latest_post) {
              setDateRange({ earliest: data.earliest_post, latest: data.latest_post });
            }
            onImportComplete([], data);
          } else if (withEmb > 0) {
            // Partially embedded - trigger processing
            setStatus('processing');
            setTarget(Math.min(totalPosts, 300));
            setEmbeddingProgress(withEmb);
          } else {
            // Posts fetched but no embeddings yet
            setStatus('processing');
            setTarget(Math.min(totalPosts, 300));
            setEmbeddingProgress(0);
          }
        } else if (data.status === 'phase_a' || data.status === 'phase_b') {
          // Import still running
          const phaseATarget = data.target_posts || 300;
          setTarget(phaseATarget);
          setProgress(Math.min(data.total_fetched || 0, phaseATarget));
          setStatus('importing');
        }
      } catch (e) {
        // Not started yet, stay idle
      }
    })();
  }, []);

  // Start import
  const startImport = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setError('請先登入');
      setStatus('error');
      return;
    }

    setStatus('connecting');
    setError('');

    try {
      const res = await fetch('/api/import/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'threads_not_connected') {
          setError('請先連結 Threads 帳號');
          setStatus('error');
          return;
        }
        throw new Error(data.detail || data.error || '匯入失敗');
      }

      setStatus('importing');
      setTarget(data.target_posts || 300);
      setProgress(Math.min(data.total_fetched || 0, data.target_posts || 300));
    } catch (e: any) {
      setError(e.message || '啟動匯入失敗');
      setStatus('error');
      onError?.(e.message);
    }
  }, [onError]);

  // Poll for import status (Phase A only - cap progress at target)
  useEffect(() => {
    if (status !== 'importing' && status !== 'connecting') return;

    const token = getAuthToken();
    if (!token) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/import/status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (data.status === 'phase_a' || data.status === 'phase_b') {
          const phaseATarget = data.target_posts || 300;
          // Cap displayed progress at Phase A target
          setProgress(Math.min(data.total_fetched || 0, phaseATarget));
          setTarget(phaseATarget);
        }

        // Phase A completed → move to embedding processing
        if (data.phase_a_completed_at) {
          clearInterval(interval);
          const totalPosts = Math.min(data.total_fetched || 0, data.target_posts || 300);
          const withEmb = data.total_with_embedding || 0;
          
          if (withEmb >= totalPosts) {
            // Embeddings already done
            setStatus('completed');
            setPostCount(withEmb);
            setProgress(withEmb);
            if (data.earliest_post && data.latest_post) {
              setDateRange({ earliest: data.earliest_post, latest: data.latest_post });
            }
            onImportComplete([], data);
          } else {
            // Need to compute embeddings
            setStatus('processing');
            setTarget(totalPosts);
            setEmbeddingProgress(withEmb);
          }
        }

        // Paused or failed
        if (data.status === 'failed') {
          clearInterval(interval);
          setError(data.error || '匯入失敗');
          setStatus('error');
          onError?.(data.error);
        }
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [status, onImportComplete, onError]);

  // Drive import forward by calling continue endpoint (Phase A + Phase B background)
  useEffect(() => {
    if (status !== 'importing' && status !== 'processing' && status !== 'completed') return;

    const token = getAuthToken();
    if (!token) return;

    const continueInterval = setInterval(async () => {
      try {
        await fetch('/api/import/continue', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        console.error('Continue import error:', e);
      }
    }, 25000);

    return () => clearInterval(continueInterval);
  }, [status]);

  // Process embeddings (when status is 'processing')
  useEffect(() => {
    if (status !== 'processing') return;

    const token = getAuthToken();
    if (!token) return;

    let cancelled = false;

    const processEmbeddings = async () => {
      while (!cancelled) {
        try {
          const res = await fetch('/api/import/embeddings', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();

          if (data.status === 'complete') {
            // All embeddings done!
            const statusRes = await fetch('/api/import/status', {
              headers: { Authorization: `Bearer ${token}` },
            });
            const statusData = await statusRes.json();
            
            setStatus('completed');
            setPostCount(statusData.total_with_embedding || target);
            setProgress(statusData.total_with_embedding || target);
            if (statusData.earliest_post && statusData.latest_post) {
              setDateRange({ earliest: statusData.earliest_post, latest: statusData.latest_post });
            }
            onImportComplete([], statusData);
            return;
          }

          if (data.status === 'in_progress') {
            const done = target - (data.remaining || 0);
            setEmbeddingProgress(Math.max(0, Math.min(target, done)));
          }

          // Wait 2 seconds between batches
          await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
          console.error('Embedding batch error:', e);
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    };

    processEmbeddings();
    return () => { cancelled = true; };
  }, [status, target, onImportComplete]);

  // Calculate progress percentage
  const progressPercent = status === 'completed' ? 100 : 
    status === 'processing' ? Math.min((embeddingProgress / target) * 100, 99) :
    Math.min((progress / target) * 100, 100);

  // Render based on status
  if (status === 'idle') {
    return (
      <div className="bg-surface rounded-xl p-6 mb-8 border border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl">🧵</div>
            <div>
              <h3 className="text-lg font-semibold">Threads 自動匯入</h3>
              <p className="text-gray-500 text-sm">
                自動匯入最近 300 篇貼文或 6 個月內的貼文
              </p>
            </div>
          </div>
          <button
            onClick={startImport}
            className="px-4 py-2 bg-[#1877F2] hover:bg-[#1861CB] text-white font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
            </svg>
            開始匯入
          </button>
        </div>
      </div>
    );
  }

  if (status === 'connecting') {
    return (
      <div className="bg-surface rounded-xl p-6 mb-8 border border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-[#1877F2] border-t-transparent rounded-full animate-spin" />
          <div>
            <p className="text-gray-300">正在連結你的 Threads 帳號...</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'importing') {
    const remainingPosts = target - progress;
    const estimatedMinutes = Math.max(1, Math.ceil(remainingPosts / 50 * 0.5));
    return (
      <div className="bg-surface rounded-xl p-6 mb-8 border border-gray-800">
        <div className="mb-4">
          <p className="text-gray-300 mb-2">正在匯入你的 Threads 貼文...</p>
          <div className="flex items-center justify-between">
            <p className="text-gray-500 text-sm">
              {progress} / {target} 篇
            </p>
            <p className="text-gray-600 text-xs">
              預估剩餘 {estimatedMinutes} 分鐘
            </p>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="w-full h-2 bg-[#0a0a0a] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#E85D04] rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="text-gray-600 text-xs mt-2">
          為避免觸及 API 限制，匯入會分批進行。你可以離開此頁面，稍後回來查看進度。
        </p>
      </div>
    );
  }

  if (status === 'processing') {
    return (
      <div className="bg-surface rounded-xl p-6 mb-8 border border-gray-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-6 h-6 border-2 border-[#E85D04] border-t-transparent rounded-full animate-spin" />
          <div>
            <p className="text-gray-300">正在計算語意向量...</p>
            <p className="text-gray-500 text-sm">
              {embeddingProgress} / {target} 篇（每批 100 篇）
            </p>
          </div>
        </div>
        <div className="w-full h-2 bg-[#0a0a0a] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#E85D04] rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="text-gray-600 text-xs mt-2">
          每 100 篇約需 5 秒，請稍候...
        </p>
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className="bg-surface rounded-xl p-6 mb-8 border border-gray-800">
        <div className="flex items-center gap-3">
          <div className="text-2xl">✅</div>
          <div>
            <p className="text-lg font-semibold text-green-400">
              匯入完成：{postCount} 篇貼文
            </p>
            {dateRange && (
              <p className="text-gray-500 text-sm">
                {new Date(dateRange.earliest).toLocaleDateString('zh-TW')} ~ {new Date(dateRange.latest).toLocaleDateString('zh-TW')}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  return (
    <div className="bg-surface rounded-xl p-6 mb-8 border border-red-800/30">
      <div className="flex items-center gap-3 mb-3">
        <div className="text-2xl">❌</div>
        <div>
          <p className="text-red-400 font-medium">匯入失敗</p>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
      <button
        onClick={() => { setError(''); startImport(); }}
        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm"
      >
        重試
      </button>
    </div>
  );
}
