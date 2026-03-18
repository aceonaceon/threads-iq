import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';

interface Referral {
  userId: string;
  displayName: string;
  joinedAt: string;
  isPaid: boolean;
}

function getAuthToken(): string | null {
  return localStorage.getItem('threadsiq_token');
}

export default function Affiliate() {
  const { isAuthenticated, login } = useAuth();
  const [affiliateData, setAffiliateData] = useState<{
    referralCode: string;
    referralLink: string;
    totalReferrals: number;
    bonusUses: number;
    weeklyRemaining: number;
    commissionBalance: number;
    referralList: Referral[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      loadAffiliateData();
    }
  }, [isAuthenticated]);

  const loadAffiliateData = async () => {
    try {
      const token = getAuthToken();
      if (!token) return;

      const response = await fetch('/api/affiliate/info', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setAffiliateData(data);
      }
    } catch (error) {
      console.error('Failed to load affiliate data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!affiliateData?.referralLink) return;
    
    try {
      await navigator.clipboard.writeText(affiliateData.referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Not authenticated - show login prompt
  if (!isAuthenticated) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="text-4xl mb-4">🔐</div>
          <h1 className="text-2xl font-bold mb-2">請先登入</h1>
          <p className="text-gray-500 mb-6">
            登入 LINE 帳號以使用推薦計畫
          </p>
          <button
            onClick={login}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#06C755] hover:bg-[#05B54C] text-white font-medium rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
            </svg>
            LINE 登入
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !affiliateData) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">推薦計畫</h1>
          <p className="text-gray-500">
            邀請朋友使用 ThreadsIQ，一起獲得額外分析次數
          </p>
        </div>

        {/* Referral Link Box */}
        <div className="bg-surface rounded-xl p-6 mb-6 border border-gray-800">
          <h2 className="text-lg font-semibold mb-4">你的推薦連結</h2>
          <div className="flex gap-2">
            <div className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-300 overflow-hidden">
              <span className="text-sm break-all">{affiliateData.referralLink}</span>
            </div>
            <button
              onClick={copyToClipboard}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              {copied ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  已複製
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  複製
                </>
              )}
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-surface rounded-xl p-4 border border-gray-800 text-center">
            <div className="text-3xl font-bold text-accent">{affiliateData.totalReferrals}</div>
            <div className="text-sm text-gray-500 mt-1">推薦人數</div>
          </div>
          <div className="bg-surface rounded-xl p-4 border border-gray-800 text-center">
            <div className="text-3xl font-bold text-accent">{affiliateData.bonusUses}</div>
            <div className="text-sm text-gray-500 mt-1">獎勵次數</div>
          </div>
          <div className="bg-surface rounded-xl p-4 border border-gray-800 text-center">
            <div className="text-3xl font-bold text-accent">{affiliateData.weeklyRemaining}</div>
            <div className="text-sm text-gray-500 mt-1">本週剩餘</div>
          </div>
        </div>

        {/* Rules */}
        <div className="bg-surface rounded-xl p-6 mb-6 border border-gray-800">
          <h2 className="text-lg font-semibold mb-4">推薦獎勵規則</h2>
          <ul className="space-y-3 text-gray-400 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-accent">•</span>
              <span>每位新用戶透過你的連結註冊 → 你獲得 <strong className="text-white">10 次</strong> 額外分析</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent">•</span>
              <span>對方也獲得 <strong className="text-white">10 次</strong> 額外分析</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent">•</span>
              <span>額外次數<strong className="text-white">永不過期</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent">•</span>
              <span>未來推薦用戶升級付費，你可獲得 <strong className="text-white">每月訂閱費 20%</strong> 佣金</span>
            </li>
          </ul>
        </div>

        {/* Referral History */}
        <div className="bg-surface rounded-xl p-6 border border-gray-800">
          <h2 className="text-lg font-semibold mb-4">推薦紀錄</h2>
          {affiliateData.referralList.length === 0 ? (
            <p className="text-gray-500 text-center py-4">尚無推薦紀錄</p>
          ) : (
            <div className="space-y-3">
              {affiliateData.referralList.map((ref, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium">{ref.displayName}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(ref.joinedAt).toLocaleDateString('zh-TW')}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    {ref.isPaid ? '付費用戶' : '免費用戶'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
