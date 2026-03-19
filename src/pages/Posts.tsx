import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

interface Post {
  id: number;
  threads_post_id: string;
  text: string;
  posted_at: string;
  media_type: string;
  permalink: string;
  has_embedding: boolean;
  insights: {
    views: number;
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
  };
  engagement_rate: string;
}

interface PostsResponse {
  posts: Post[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  plan: string;
  sortBy: string;
  sortOrder: string;
  limit_applied: number | string;
}

const API_BASE = '';

function getStoredToken(): string | null {
  return localStorage.getItem('threadsiq_token');
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-TW', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

export default function Posts() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>('free');
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState('posted_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<{ new_posts: number; total_posts: number } | null>(null);
  const [dateRange, setDateRange] = useState<{ earliest: string; latest: string } | null>(null);

  const fetchPosts = async (page = 1, sort = sortBy, order = sortOrder) => {
    const token = getStoredToken();
    if (!token) {
      navigate('/login');
      return;
    }

    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: '20',
        sortBy: sort,
        sortOrder: order,
      });

      const res = await fetch(`${API_BASE}/api/posts/list?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch posts');
      }

      const data: PostsResponse = await res.json();
      setPosts(data.posts);
      setPlan(data.plan);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setCurrentPage(data.page);
      setSortBy(data.sortBy);
      setSortOrder(data.sortOrder);

      // Calculate date range
      if (data.posts.length > 0) {
        const dates = data.posts.map(p => new Date(p.posted_at).getTime());
        const latest = new Date(Math.max(...dates));
        const earliest = new Date(Math.min(...dates));
        setDateRange({
          earliest: earliest.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' }),
          latest: latest.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' }),
        });
      }
    } catch (err) {
      console.error(err);
      setError('載入失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    const token = getStoredToken();
    if (!token) return;

    setRefreshing(true);
    setRefreshResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/import/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errData = await res.json();
        if (errData.error === 'threads_not_connected') {
          alert('請先連結您的 Threads 帳號');
          return;
        }
        throw new Error('Refresh failed');
      }

      const data = await res.json();
      setRefreshResult({
        new_posts: data.new_posts,
        total_posts: data.total_posts,
      });

      // Refresh the posts list
      await fetchPosts(1, 'posted_at', 'desc');
    } catch (err) {
      console.error(err);
      alert('更新失敗，請稍後再試');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSort = (column: string) => {
    if (column === sortBy) {
      // Toggle order
      const newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
      setSortOrder(newOrder);
      fetchPosts(1, column, newOrder);
    } else {
      // New column - default to desc
      setSortBy(column);
      setSortOrder('desc');
      fetchPosts(1, column, 'desc');
    }
  };

  const handlePageChange = (newPage: number) => {
    fetchPosts(newPage, sortBy, sortOrder);
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const canRefresh = plan !== 'free';

  // Sort icon component
  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) {
      return <span className="text-gray-600 ml-1">⇅</span>;
    }
    return sortOrder === 'asc' ? (
      <span className="text-accent ml-1">▲</span>
    ) : (
      <span className="text-accent ml-1">▼</span>
    );
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              📊 你的 Threads 貼文
            </h1>
            {total > 0 && (
              <p className="text-gray-400 text-sm mt-1">
                共 {total} 篇
                {dateRange && ` ・最新：${dateRange.latest} ・最早：${dateRange.earliest}`}
              </p>
            )}
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing || !canRefresh}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              canRefresh
                ? 'bg-accent hover:bg-accent-hover text-white'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
            title={!canRefresh ? '升級解鎖定期更新功能' : ''}
          >
            {refreshing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                同步中...
              </>
            ) : (
              <>
                🔄 更新最新貼文
              </>
            )}
          </button>
        </div>

        {/* Refresh result banner */}
        {refreshResult && refreshResult.new_posts > 0 && (
          <div className="mb-6 bg-accent/20 border border-accent/50 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-accent text-lg">✨</span>
              <span className="text-white">
                新增 {refreshResult.new_posts} 篇貼文！總共 {refreshResult.total_posts} 篇
              </span>
            </div>
            <Link
              to="/analyze"
              className="text-accent hover:text-accent-hover font-medium flex items-center gap-1"
            >
              重新分析語意主題 →
            </Link>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-6 bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-red-400">
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="bg-surface border border-white/10 rounded-xl p-8 text-center">
            <p className="text-gray-400 mb-4">尚無匯入的貼文</p>
            <Link
              to="/analyze"
              className="text-accent hover:text-accent-hover font-medium"
            >
              前往分析頁面匯入 →
            </Link>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block bg-surface border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase w-1/3">
                      內容
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase cursor-pointer hover:text-white"
                      onClick={() => handleSort('posted_at')}
                    >
                      發布時間<SortIcon column="posted_at" />
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase cursor-pointer hover:text-white"
                      onClick={() => handleSort('views')}
                    >
                      觀看數<SortIcon column="views" />
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase cursor-pointer hover:text-white"
                      onClick={() => handleSort('likes')}
                    >
                      愛心<SortIcon column="likes" />
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase cursor-pointer hover:text-white"
                      onClick={() => handleSort('replies')}
                    >
                      回覆<SortIcon column="replies" />
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase cursor-pointer hover:text-white"
                      onClick={() => handleSort('reposts')}
                    >
                      轉發<SortIcon column="reposts" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      連結
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {posts.map((post) => (
                    <tr key={post.id} className="hover:bg-white/5">
                      <td className="px-4 py-3">
                        <div className="text-white text-sm line-clamp-2" title={post.text}>
                          {post.text.length > 80 ? post.text.substring(0, 80) + '...' : post.text}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm whitespace-nowrap">
                        {formatDate(post.posted_at)}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm">
                        {formatNumber(post.insights.views)}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm">
                        {formatNumber(post.insights.likes)}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm">
                        {formatNumber(post.insights.replies)}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm">
                        {formatNumber(post.insights.reposts)}
                      </td>
                      <td className="px-4 py-3">
                        {post.permalink && (
                          <a
                            href={post.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:text-accent-hover"
                          >
                            🔗
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-4">
              {posts.map((post) => (
                <div key={post.id} className="bg-surface border border-white/10 rounded-xl p-4">
                  <div className="text-white text-sm mb-3 line-clamp-3">
                    {post.text}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    <div>
                      <span className="text-gray-500">發布：</span>
                      <span className="text-gray-300">{formatDate(post.posted_at)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">觀看：</span>
                      <span className="text-gray-300">{formatNumber(post.insights.views)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">❤️：</span>
                      <span className="text-gray-300">{formatNumber(post.insights.likes)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">💬：</span>
                      <span className="text-gray-300">{formatNumber(post.insights.replies)}</span>
                    </div>
                  </div>
                  {post.permalink && (
                    <a
                      href={post.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:text-accent-hover text-sm flex items-center gap-1"
                    >
                      🔗 查看原文
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* Free user CTA */}
            {plan === 'free' && total > 30 && (
              <div className="mt-6 bg-gradient-to-r from-accent/20 to-orange-600/20 border border-accent/50 rounded-xl p-6 text-center">
                <h3 className="text-lg font-medium text-white mb-2">🔒 升級 Creator 方案解鎖 300 篇完整貼文</h3>
                <p className="text-gray-400 text-sm mb-4">
                  貼文數據全面掌控 + 成效排序 + 定期更新
                </p>
                <Link
                  to="/affiliate"
                  className="inline-block px-6 py-2 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors"
                >
                  立即升級 →
                </Link>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 bg-surface border border-white/10 rounded-lg text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  上一頁
                </button>
                <span className="text-gray-400 text-sm px-4">
                  第 {currentPage} / {totalPages} 頁
                </span>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 bg-surface border border-white/10 rounded-lg text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  下一頁
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
