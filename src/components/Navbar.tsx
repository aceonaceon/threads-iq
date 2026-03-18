import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Navbar() {
  const { user, isAuthenticated, logout, login } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  // Calculate total remaining uses
  const totalRemaining = user ? (user.weeklyRemaining || 0) + (user.bonusUses || 0) : 0;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-surface/95 backdrop-blur-sm border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-xl font-bold text-accent">ThreadsIQ</span>
        </Link>

        <div className="flex items-center gap-6">
          {isAuthenticated && (
            <>
              <Link
                to="/analyze"
                className={`text-sm font-medium transition-colors ${
                  isActive('/analyze') ? 'text-accent' : 'text-gray-400 hover:text-white'
                }`}
              >
                分析
              </Link>
              <Link
                to="/history"
                className={`text-sm font-medium transition-colors ${
                  isActive('/history') ? 'text-accent' : 'text-gray-400 hover:text-white'
                }`}
              >
                歷史記錄
              </Link>
              <Link
                to="/affiliate"
                className={`text-sm font-medium transition-colors ${
                  isActive('/affiliate') ? 'text-accent' : 'text-gray-400 hover:text-white'
                }`}
              >
                推薦計畫
              </Link>
            </>
          )}

          {isAuthenticated && user ? (
            <div className="flex items-center gap-4">
              {/* Usage badge */}
              <div className="text-xs text-gray-400 bg-gray-800/50 px-3 py-1.5 rounded-full">
                剩餘 <span className="text-accent font-medium">{totalRemaining}</span> 次
              </div>
              
              {user.avatarUrl ? (
                <img 
                  src={user.avatarUrl} 
                  alt={user.name}
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-sm font-medium">
                  {user.name.charAt(0)}
                </div>
              )}
              <span className="text-sm text-gray-400">{user.name}</span>
              <button
                onClick={logout}
                className="text-sm text-gray-500 hover:text-white transition-colors"
              >
                登出
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="px-4 py-2 bg-cta hover:bg-cta-hover text-white text-sm font-medium rounded-lg transition-colors"
            >
              開始使用
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
