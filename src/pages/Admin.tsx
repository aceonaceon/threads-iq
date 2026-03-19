import { useState, useEffect } from 'react';
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

function getUserIdFromToken(): string | null {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[0]));
    return payload.sub;
  } catch {
    return null;
  }
}

// Admin user ID - should match env variable ADMIN_USER_ID
const ADMIN_USER_ID = 'Ua98ecd52424d5d82c0091d52bb9afce4';

export default function Admin() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const userId = getUserIdFromToken();
    if (userId !== ADMIN_USER_ID) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    setIsAdmin(true);
    fetchData();
  }, []);

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

      // Fetch users
      const usersRes = await fetch(`${API_BASE}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!usersRes.ok) {
        throw new Error('Failed to fetch users');
      }
      const usersData = await usersRes.json();
      setUsers(usersData.users || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-TW', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
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
        <div className="hidden md:block bg-surface border border-white/10 rounded-xl overflow-hidden">
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
        <div className="md:hidden space-y-4">
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
      </div>
    </div>
  );
}