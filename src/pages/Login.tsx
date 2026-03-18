import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate('/analyze');
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  const handleLineLogin = () => {
    login();
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">登入 ThreadsIQ</h1>
          <p className="text-gray-500">
            使用 LINE 帳號登入，開始分析你的 Threads 帳號
          </p>
        </div>

        <div className="space-y-4">
          {/* LINE Login */}
          <button
            onClick={handleLineLogin}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-[#06C755] hover:bg-[#05B54C] text-white font-medium rounded-xl transition-colors"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="white">
              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
            </svg>
            LINE 登入
          </button>
        </div>

        <p className="text-center text-gray-500 text-xs mt-6">
          登入後可進行 3 次免費分析，結果將儲存在雲端
        </p>
      </div>
    </div>
  );
}
