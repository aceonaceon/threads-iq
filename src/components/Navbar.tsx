import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Navbar() {
  const { user, logout, loginAsGuest } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-surface/95 backdrop-blur-sm border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-xl font-bold text-accent">ThreadsIQ</span>
        </Link>

        <div className="flex items-center gap-6">
          {user && (
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
            </>
          )}

          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">
                {user.name || user.email}
              </span>
              <button
                onClick={logout}
                className="text-sm text-gray-500 hover:text-white transition-colors"
              >
                登出
              </button>
            </div>
          ) : (
            <button
              onClick={loginAsGuest}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
            >
              開始使用
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
