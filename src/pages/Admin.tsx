import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface User {
  lineUserId: string;
  displayName: string;
  pictureUrl?: string;
  createdAt: string;
  weeklyUses: number;
  weeklyResetAt: string;
  bonusUses: number;
  referralCode: string;
  referredBy?: string;
  totalReferrals: number;
  commissionBalance: number;
  isPaid: boolean;
  plan: string;
}

interface ImportData {
  user_id: string;
  display_name: string;
  status: string;
  phase: string;
  total_fetched: number;
  target_posts: number;
  total_posts_in_db: number;
  total_with_embedding: number;
  earliest_post: string | null;
  latest_post: string | null;
  phase_a_completed_at: string | null;
  completed_at: string | null;
  started_at: string;
  rate_limit_paused_until: string | null;
}

interface Stats {
  totalUsers: number;
  activeThisWeek: number;
  paidUsers: number;
  totalAnalysisUsed: number;
}

const API_BASE = '';

function getStoredToken(): string | null {
  return localStorage.getItem('threadsiq_token');
}

export default function Admin() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [imports, setImports] = useState<ImportData[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ show: boolean; user: ImportData | null }>({ show: false, user: null });
  const [deleting, setDeleting] = useState(false);
  const refreshInterval = useRef<number | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-refresh when any import is in progress
  useEffect(() => {
    const hasInProgress = imports.some(i => 
      i.status === 'phase_a' || i.status === 'phase_b' || i.status === 'pending' || i.status === 'paused'
    );

    if (hasInProgress && !refreshInterval.current) {
      refreshInterval.current = window.setInterval(() => {
        fetchImports();
      }, 10000);
    } else if (!hasInProgress && refreshInterval.current) {
      clearInterval(refreshInterval.current);
      refreshInterval.current = null;
    }

    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    };
  }, [imports]);

  // Check if user is admin via API (more secure)
  useEffect(() => {
    if (isAdmin === false) {
      // Show error and redirect
      setTimeout(() => navigate('/'), 2000);
    }
  }, [isAdmin, navigate]);

  const fetchData = async () => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      // Fetch stats
      const statsRes = await fetch(`${API_BASE}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!statsRes.ok) {
        if (statsRes.status === 403) {
          setIsAdmin(false);
          setLoading(false);
          return;
        }
        throw new Error('Failed to fetch stats');
      }
      const statsData = await statsRes.json();
      setStats(statsData);
      setIsAdmin(true);

      // Fetch users
      const usersRes = await fetch(`${API_BASE}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!usersRes.ok) {
        throw new Error('Failed to fetch users');
      }
      const usersData = await usersRes.json();
      setUsers(usersData.users || []);

      // Fetch imports
      await fetchImports();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchImports = async () => {
    const token = getStoredToken();
    if (!token) return;

    try {
      const importsRes = await fetch(`${API_BASE}/api/admin/imports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (importsRes.ok) {
        const importsData = await importsRes.json();
        setImports(importsData.imports || []);
      }
    } catch (err) {
      console.error('Failed to fetch imports:', err);
    }
  };

  const handlePlanChange = async (userId: string, newPlan: string) => {
    const token = getStoredToken();
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: newPlan }),
      });

      if (!res.ok) {
        throw new Error('Failed to update plan');
      }

      // Update local state
      setUsers(users.map(u => 
        u.lineUserId === userId ? { ...u, plan: newPlan, isPaid: newPlan === 'creator' || newPlan === 'pro' } : u
      ));

      // Show toast
      setToast(`已更新會員等級為 ${newPlan === 'free' ? '免費' : newPlan === 'creator' ? '創作者' : '專業版'}`);
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      console.error(err);
      setToast('更新失敗');
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleDeleteUserData = async (user: ImportData) => {
    const token = getStoredToken();
    if (!token) return;

    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/imports/${user.user_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Failed to delete user data');
      }

      const data = await res.json();
      setToast(`已清除 ${user.display_name} 的資料（${data.deleted.posts} 篇貼文）`);
      setTimeout(() => setToast(null), 3000);
      
      // Refresh imports list
      await fetchImports();
    } catch (err) {
      console.error(err);
      setToast('清除失敗');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setDeleting(false);
      setConfirmDialog({ show: false, user: null });
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    // D1 stores UTC without Z suffix - ensure UTC parsing
    const normalized = dateStr.includes('T') || dateStr.includes('Z') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
    const date = new Date(normalized);
    return date.toLocaleDateString('zh-TW', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit',
      timeZone: 'Asia/Taipei',
    });
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    const normalized = dateStr.includes('T') || dateStr.includes('Z') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
    const date = new Date(normalized);
    return date.toLocaleString('zh-TW', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Taipei',
    });
  };

  const getPlanBadge = (plan: string) => {
    const planMap: Record<string, { text: string; class: string }> = {
      free: { text: '免費', class: 'bg-gray-600' },
      creator: { text: '創作者', class: 'bg-orange-500' },
      pro: { text: '專業版', class: 'bg-yellow-500' },
    };
    const p = planMap[plan] || planMap.free;
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full text-white ${p.class}`}>
        {p.text}
      </span>
    );
  };

  const getImportStatusBadge = (status: string, _phase: string) => {
    const statusMap: Record<string, { text: string; class: string }> = {
      phase_a: { text: 'Phase A', class: 'bg-blue-500' },
      phase_b: { text: 'Phase B', class: 'bg-purple-500' },
      pending: { text: '等待中', class: 'bg-gray-500' },
      completed: { text: '已完成', class: 'bg-green-500' },
      paused: { text: '已暫停', class: 'bg-yellow-500' },
      failed: { text: '失敗', class: 'bg-red-500' },
    };
    const s = statusMap[status] || { text: status, class: 'bg-gray-500' };
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full text-white ${s.class}`}>
        {s.text}
      </span>
    );
  };

  // Filter users by search
  const filteredUsers = users.filter(u => {
    const query = searchQuery.toLowerCase();
    return u.displayName?.toLowerCase().includes(query) || 
           u.lineUserId.toLowerCase().includes(query);
  });

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 text-lg">無權限</p>
          <p className="text-gray-500 text-sm mt-2">正在導向首頁...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] p-4 md:p-8">
      {/* Toast notification */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-accent text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in">
          {toast}
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-white/10 rounded-xl p-6 max-w-sm mx-4">
            <h3 className="text-lg font-medium text-white mb-4">確認清除資料</h3>
            <p className="text-gray-400 mb-6">
              確定要清除 <span className="text-white font-medium">{confirmDialog.user?.display_name}</span> 的所有匯入資料嗎？此操作不可逆。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDialog({ show: false, user: null })}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                disabled={deleting}
              >
                取消
              </button>
              <button
                onClick={() => confirmDialog.user && handleDeleteUserData(confirmDialog.user)}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                disabled={deleting}
              >
                {deleting ? '清除中...' : '確定清除'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-8">管理後台</h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-surface border border-white/10 rounded-xl p-4">
            <div className="text-gray-400 text-sm mb-1">總用戶數</div>
            <div className="text-2xl font-bold text-accent">{stats?.totalUsers || 0}</div>
          </div>
          <div className="bg-surface border border-white/10 rounded-xl p-4">
            <div className="text-gray-400 text-sm mb-1">本週活躍</div>
            <div className="text-2xl font-bold text-accent">{stats?.activeThisWeek || 0}</div>
          </div>
          <div className="bg-surface border border-white/10 rounded-xl p-4">
            <div className="text-gray-400 text-sm mb-1">付費用戶</div>
            <div className="text-2xl font-bold text-accent">{stats?.paidUsers || 0}</div>
          </div>
          <div className="bg-surface border border-white/10 rounded-xl p-4">
            <div className="text-gray-400 text-sm mb-1">總分析次數</div>
            <div className="text-2xl font-bold text-accent">{stats?.totalAnalysisUsed || 0}</div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="搜尋用戶名稱或 LINE ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full md:w-80 px-4 py-2 bg-surface border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
        </div>

        {/* Payment Records Placeholder */}
        <div className="bg-surface border border-white/10 rounded-xl p-4 mb-8">
          <h2 className="text-lg font-medium text-white mb-2">繳費記錄</h2>
          <p className="text-gray-500">尚未串接付款系統</p>
        </div>

        {/* Users Table - Desktop */}
        <div className="hidden md:block bg-surface border border-white/10 rounded-xl overflow-hidden mb-8">
          <table className="w-full">
            <thead className="bg-white/5">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">用戶</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">等級</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">推薦碼</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">本週使用</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">額外次數</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">推薦數</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">註冊時間</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredUsers.map(user => (
                <tr key={user.lineUserId} className="hover:bg-white/5">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {user.pictureUrl ? (
                        <img src={user.pictureUrl} alt={user.displayName} className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-sm">
                          {user.displayName?.charAt(0) || '?'}
                        </div>
                      )}
                      <div>
                        <div className="text-white text-sm font-medium">{user.displayName || '-'}</div>
                        <div className="text-gray-500 text-xs">{user.lineUserId}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.plan || 'free'}
                      onChange={(e) => handlePlanChange(user.lineUserId, e.target.value)}
                      className="bg-gray-800 border border-gray-700 text-white text-sm rounded px-2 py-1 focus:outline-none focus:border-accent"
                    >
                      <option value="free">免費</option>
                      <option value="creator">創作者</option>
                      <option value="pro">專業版</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-sm font-mono">{user.referralCode || '-'}</td>
                  <td className="px-4 py-3 text-gray-400 text-sm">{user.weeklyUses || 0}</td>
                  <td className="px-4 py-3 text-gray-400 text-sm">{user.bonusUses || 0}</td>
                  <td className="px-4 py-3 text-gray-400 text-sm">{user.totalReferrals || 0}</td>
                  <td className="px-4 py-3 text-gray-400 text-sm">{formatDate(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              {searchQuery ? '沒有符合的用戶' : '尚無用戶資料'}
            </div>
          )}
        </div>

        {/* Users Cards - Mobile */}
        <div className="md:hidden space-y-4 mb-8">
          {filteredUsers.map(user => (
            <div key={user.lineUserId} className="bg-surface border border-white/10 rounded-xl p-4">
              <div className="flex items-start gap-3 mb-3">
                {user.pictureUrl ? (
                  <img src={user.pictureUrl} alt={user.displayName} className="w-10 h-10 rounded-full" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-white">
                    {user.displayName?.charAt(0) || '?'}
                  </div>
                )}
                <div className="flex-1">
                  <div className="text-white font-medium">{user.displayName || '-'}</div>
                  <div className="text-gray-500 text-xs font-mono">{user.lineUserId}</div>
                </div>
                {getPlanBadge(user.plan || 'free')}
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                <div>
                  <span className="text-gray-500">本週使用：</span>
                  <span className="text-white">{user.weeklyUses || 0}</span>
                </div>
                <div>
                  <span className="text-gray-500">額外次數：</span>
                  <span className="text-white">{user.bonusUses || 0}</span>
                </div>
                <div>
                  <span className="text-gray-500">推薦數：</span>
                  <span className="text-white">{user.totalReferrals || 0}</span>
                </div>
                <div>
                  <span className="text-gray-500">註冊時間：</span>
                  <span className="text-white">{formatDate(user.createdAt)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-gray-500 text-sm">等級：</label>
                <select
                  value={user.plan || 'free'}
                  onChange={(e) => handlePlanChange(user.lineUserId, e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-white text-sm rounded px-2 py-1 focus:outline-none focus:border-accent"
                >
                  <option value="free">免費</option>
                  <option value="creator">創作者</option>
                  <option value="pro">專業版</option>
                </select>
              </div>
            </div>
          ))}
          {filteredUsers.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              {searchQuery ? '沒有符合的用戶' : '尚無用戶資料'}
            </div>
          )}
        </div>

        {/* Import Monitor Section */}
        <div className="bg-surface border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">匯入監控</h2>
            <button
              onClick={fetchImports}
              className="text-gray-400 hover:text-white text-sm transition-colors"
            >
              重新整理
            </button>
          </div>
          
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">用戶</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">狀態</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">已匯入</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Embedding</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">日期範圍</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">開始時間</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {imports.map(imp => (
                  <tr key={imp.user_id} className="hover:bg-white/5">
                    <td className="px-4 py-3">
                      <div>
                        <div className="text-white text-sm font-medium">{imp.display_name}</div>
                        <div className="text-gray-500 text-xs">{imp.user_id}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {getImportStatusBadge(imp.status, imp.phase)}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {imp.total_posts_in_db} 篇
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {imp.total_with_embedding} / {imp.total_posts_in_db}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {imp.earliest_post && imp.latest_post 
                        ? `${formatDate(imp.earliest_post)} ~ ${formatDate(imp.latest_post)}`
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {formatDateTime(imp.started_at)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setConfirmDialog({ show: true, user: imp })}
                        className="text-red-400 hover:text-red-300 text-sm transition-colors"
                      >
                        清除資料
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {imports.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                尚無匯入資料
              </div>
            )}
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-white/5">
            {imports.map(imp => (
              <div key={imp.user_id} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-white font-medium">{imp.display_name}</div>
                    <div className="text-gray-500 text-xs font-mono">{imp.user_id}</div>
                  </div>
                  {getImportStatusBadge(imp.status, imp.phase)}
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div>
                    <span className="text-gray-500">已匯入：</span>
                    <span className="text-white">{imp.total_posts_in_db} 篇</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Embedding：</span>
                    <span className="text-white">{imp.total_with_embedding} / {imp.total_posts_in_db}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">開始時間：</span>
                    <span className="text-white">{formatDateTime(imp.started_at)}</span>
                  </div>
                </div>

                <button
                  onClick={() => setConfirmDialog({ show: true, user: imp })}
                  className="text-red-400 hover:text-red-300 text-sm transition-colors"
                >
                  清除資料
                </button>
              </div>
            ))}
            {imports.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                尚無匯入資料
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
