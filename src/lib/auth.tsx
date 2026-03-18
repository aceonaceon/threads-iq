import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  name: string;
  avatarUrl?: string;
  weeklyUses: number;
  weeklyRemaining: number;
  bonusUses: number;
  totalRemaining: number;
  referralCode: string;
  totalReferrals: number;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_BASE = '';

function getStoredToken(): string | null {
  return localStorage.getItem('threadsiq_token');
}

function storeToken(token: string): void {
  localStorage.setItem('threadsiq_token', token);
}

function clearToken(): void {
  localStorage.removeItem('threadsiq_token');
}

function getTokenFromUrl(): string | null {
  const hash = window.location.hash;
  if (hash && hash.includes('token=')) {
    const token = hash.split('token=')[1]?.split('&')[0];
    if (token) {
      // Clear the hash after extracting token
      window.history.replaceState(null, '', window.location.pathname);
      return decodeURIComponent(token);
    }
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = async () => {
    const token = getStoredToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUser({
          id: userData.userId,
          name: userData.displayName,
          avatarUrl: userData.pictureUrl,
          weeklyUses: userData.weeklyUses || 0,
          weeklyRemaining: userData.weeklyRemaining,
          bonusUses: userData.bonusUses,
          totalRemaining: userData.totalRemaining,
          referralCode: userData.referralCode || '',
          totalReferrals: userData.totalReferrals || 0,
        });
      } else {
        clearToken();
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      clearToken();
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    await checkAuth();
  };

  useEffect(() => {
    // Check for token in URL first (from OAuth callback)
    const urlToken = getTokenFromUrl();
    if (urlToken) {
      storeToken(urlToken);
      // Clear the hash
      window.location.hash = '';
    }
    
    // Then check stored token
    checkAuth();
  }, []);

  const login = () => {
    // Get ref code from localStorage if exists
    const refCode = localStorage.getItem('threadsiq_ref');
    const refParam = refCode ? `?ref=${refCode}` : '';
    window.location.href = `/api/auth/login${refParam}`;
  };

  const logout = () => {
    clearToken();
    setUser(null);
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isLoading, 
      isAuthenticated: !!user,
      login, 
      logout,
      checkAuth,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
