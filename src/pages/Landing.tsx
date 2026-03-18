import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Landing() {
  const { user, loginAsGuest } = useAuth();

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-20">
        <div className="max-w-4xl mx-auto text-center">
          {/* Animated gradient background */}
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-gradient-to-r from-accent/20 via-orange-500/20 to-accent/20 blur-3xl rounded-full" />
            <h1 className="relative text-5xl md:text-7xl font-bold bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              ThreadsIQ
            </h1>
          </div>

          <p className="text-xl md:text-2xl text-gray-400 mb-4">
            你的 Threads 帳號，AI 怎麼看你？
          </p>
          <p className="text-gray-500 mb-12 max-w-2xl mx-auto">
            透過語意分析，了解你的內容主題分布、粉絲興趣聚焦程度，
            以及如何優化你的發文策略。
          </p>

          {user ? (
            <Link
              to="/analyze"
              className="inline-flex items-center gap-2 px-8 py-4 bg-accent hover:bg-accent-hover text-white text-lg font-semibold rounded-xl transition-all hover:scale-105"
            >
              開始分析
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          ) : (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={loginAsGuest}
                className="inline-flex items-center gap-2 px-8 py-4 bg-accent hover:bg-accent-hover text-white text-lg font-semibold rounded-xl transition-all hover:scale-105"
              >
                免費分析
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-surface/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            如何運作
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="text-center p-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/20 flex items-center justify-center">
                <span className="text-2xl font-bold text-accent">1</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">輸入貼文</h3>
              <p className="text-gray-500 text-sm">
                貼上你最近發布的 Threads 貼文（至少 5 篇，最多 30 篇）
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center p-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/20 flex items-center justify-center">
                <span className="text-2xl font-bold text-accent">2</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">AI 分析</h3>
              <p className="text-gray-500 text-sm">
                我們會用 Embedding 技術分析你的內容語意，自動分組
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center p-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/20 flex items-center justify-center">
                <span className="text-2xl font-bold text-accent">3</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">獲得洞察</h3>
              <p className="text-gray-500 text-sm">
                查看健康分數、主題集群分佈，與 AI 提供的優化建議
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Preview Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-8">
            了解你的內容方向
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-surface p-6 rounded-xl text-left">
              <div className="text-4xl font-bold text-accent mb-2">健康分數</div>
              <p className="text-gray-400 text-sm">
                評估你的內容聚焦程度，從 0 到 100 分，了解你是否有多元但相關的主題
              </p>
            </div>
            <div className="bg-surface p-6 rounded-xl text-left">
              <div className="text-4xl font-bold text-accent mb-2">語意集群</div>
              <p className="text-gray-400 text-sm">
                AI 自動將相似內容分組，讓你一眼看出粉絲最感興趣的主題領域
              </p>
            </div>
            <div className="bg-surface p-6 rounded-xl text-left">
              <div className="text-4xl font-bold text-accent mb-2">下一po建議</div>
              <p className="text-gray-400 text-sm">
                根據你的內容缺口，AI 提供具體的發文方向建議
              </p>
            </div>
            <div className="bg-surface p-6 rounded-xl text-left">
              <div className="text-4xl font-bold text-accent mb-2">歷史追蹤</div>
              <p className="text-gray-400 text-sm">
                記錄每次分析的結果，追蹤你的帳號成長與內容演變
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-white/5">
        <div className="max-w-4xl mx-auto text-center text-gray-500 text-sm">
          <p>© 2024 ThreadsIQ. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
