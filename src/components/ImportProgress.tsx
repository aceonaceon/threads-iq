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
      // Start import
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
      setProgress(data.total_fetched || 0);
    } catch (e: any) {
      setError(e.message || '啟動匯入失敗');
      setStatus('error');
      onError?.(e.message);
    }
  }, [onError]);

  // Poll for import status
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
          setProgress(data.total_fetched || 0);
          setTarget(data.target_posts || 300);

          // If phase_a is done but embedding still processing
          if (data.phase_a_completed_at && !data.embeddings_ready) {
            setStatus('processing');
            setProgress(data.total_with_embedding || data.total_fetched);
          }
        }

        // Phase A completed - check if embeddings are done
        if (data.phase_a_completed_at) {
          const totalPosts = data.total_fetched || 0;
          const withEmbedding = data.total_with_embedding || 0;
          
          if (withEmbedding < totalPosts) {
            // Embeddings not done - trigger computation
            setStatus('processing');
            setProgress(withEmbedding);
            setTarget(totalPosts);
            
            // Call embeddings endpoint
            try {
              const embRes = await fetch('/api/import/embeddings', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
              });
              const embData = await embRes.json();
              if (embData.status === 'in_progress') {
                // More to process, keep polling
                setProgress(totalPosts - (embData.remaining || 0));
              }
            } catch (e) {
              console.error('Embedding computation error:', e);
            }
          } else {
            // All done!
            clearInterval(interval);
            setStatus('completed');
            setProgress(withEmbedding);
            setPostCount(withEmbedding);
            
            if (data.earliest_post && data.latest_post) {
              setDateRange({
                earliest: data.earliest_post,
                latest: data.latest_post,
              });
            }
            
            onImportComplete([], data);
          }
        }

        // Paused (rate limit)
        if (data.status === 'paused') {
          // Just continue polling - don't show error to user
        }

        // Failed
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

  // Keep import going by calling continue endpoint
  useEffect(() => {
    if (status !== 'importing' && status !== 'processing') return;

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

  // Format date for display
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // Calculate progress percentage
  const progressPercent = status === 'completed' ? 100 : Math.min((progress / target) * 100, 100);

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
            連結 Threads 帳號
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
    const estimatedMinutes = Math.max(1, Math.ceil(remainingPosts / 50 * 0.5)); // ~50 posts per 30 seconds
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
            <p className="text-gray-300">正在處理語意向量...</p>
            <p className="text-gray-500 text-sm">
              這需要一點時間
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
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className="bg-surface rounded-xl p-6 mb-8 border border-gray-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="text-2xl">✅</div>
          <div>
            <p className="text-lg font-semibold text-green-400">
              已匯入 {postCount} 篇貼文！
            </p>
            {dateRange && (
              <p className="text-gray-500 text-sm">
                {formatDate(dateRange.earliest)} - {formatDate(dateRange.latest)}
              </p>
            )}
          </div>
        </div>

        {/* Re-import link */}
        <button
          onClick={startImport}
          className="text-sm text-gray-500 hover:text-gray-400 transition-colors"
        >
          重新匯入
        </button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="bg-surface rounded-xl p-6 mb-8 border border-red-500/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="text-2xl">❌</div>
          <div>
            <p className="text-red-400">{error || '匯入失敗'}</p>
          </div>
        </div>
        <button
          onClick={startImport}
          className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-medium rounded-lg transition-colors"
        >
          重試
        </button>
      </div>
    );
  }

  return null;
}
