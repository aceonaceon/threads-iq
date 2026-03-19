import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../lib/auth';

// Admin user ID - matches env variable ADMIN_USER_ID
const ADMIN_USER_ID = 'Ua98ecd52424d5d82c0091d52bb9afce4';

export default function Navbar() {
  const { user, isAuthenticated, logout, login } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;
  const totalRemaining = user ? (user.weeklyRemaining || 0) + (user.bonusUses || 0) : 0;

  // Check if current user is admin
  const isAdmin = isAuthenticated && user && user.id === ADMIN_USER_ID;

  const navLinks = isAuthenticated ? [
    { path: '/analyze', label: '分析' },
    { path: '/draft-check', label: '發文前檢查' },
    { path: '/thread-generator', label: '串文引擎' },
    { path: '/history', label: '歷史記錄' },
    { path: '/affiliate', label: '推薦計畫' },
    ...(isAdmin ? [{ path: '/admin', label: '管理後台' }] : []),
  ] : [];

  // Blog link is always visible
  const blogLink = { path: '/blog', label: '部落格' };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-surface/95 backdrop-blur-sm border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <span className="text-lg font-bold text-accent">ThreadsIQ</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-5">
          <Link
            to={blogLink.path}
            className={`text-sm font-medium transition-colors ${
              isActive(blogLink.path) ? 'text-accent' : 'text-gray-400 hover:text-white'
            }`}
          >
            {blogLink.label}
          </Link>
          {navLinks.map(link => (
            <Link
              key={link.path}
              to={link.path}
              className={`text-sm font-medium transition-colors ${
                isActive(link.path) ? 'text-accent' : 'text-gray-400 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          ))}

          {isAuthenticated && user ? (
            <div className="flex items-center gap-3">
              <div className="text-xs text-gray-400 bg-gray-800/50 px-2.5 py-1 rounded-full">
                剩餘 <span className="text-accent font-medium">{totalRemaining}</span> 次
              </div>
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="w-7 h-7 rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-white text-xs font-medium">
                  {user.name.charAt(0)}
                </div>
              )}
              <span className="text-sm text-gray-400 max-w-[80px] truncate">{user.name}</span>
              <button onClick={logout} className="text-xs text-gray-500 hover:text-white transition-colors">
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

        {/* Mobile: usage badge + hamburger */}
        <div className="flex md:hidden items-center gap-3">
          {isAuthenticated && user && (
            <div className="text-xs text-gray-400 bg-gray-800/50 px-2.5 py-1 rounded-full">
              <span className="text-accent font-medium">{totalRemaining}</span> 次
            </div>
          )}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 text-gray-400 hover:text-white transition-colors"
            aria-label="選單"
          >
            {menuOpen ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-white/5 bg-surface/98 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-4 py-3 space-y-1">
            {/* Blog link - always visible */}
            <Link
              to={blogLink.path}
              onClick={() => setMenuOpen(false)}
              className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(blogLink.path)
                  ? 'text-accent bg-accent/10'
                  : 'text-gray-300 hover:text-white hover:bg-white/5'
              }`}
            >
              {blogLink.label}
            </Link>

            {/* User info - only show when authenticated */}
            {isAuthenticated && user && (
              <div className="flex items-center gap-3 px-3 py-2.5 mb-2">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="w-9 h-9 rounded-full" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-white text-sm font-medium">
                    {user.name.charAt(0)}
                  </div>
                )}
                <div>
                  <div className="text-sm font-medium text-white">{user.name}</div>
                  <div className="text-xs text-gray-500">
                    剩餘 {totalRemaining} 次分析
                  </div>
                </div>
              </div>
            )}

            {/* Nav links - only show when authenticated */}
            {isAuthenticated && navLinks.map(link => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMenuOpen(false)}
                className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive(link.path)
                    ? 'text-accent bg-accent/10'
                    : 'text-gray-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {link.label}
              </Link>
            ))}

            {isAuthenticated && (
              <button
                onClick={() => { logout(); setMenuOpen(false); }}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
              >
                登出
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
