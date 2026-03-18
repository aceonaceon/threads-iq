import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Landing() {
  const { user, loginAsGuest } = useAuth();

  const handleAnalyze = () => {
    if (!user) {
      loginAsGuest();
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      {/* Section 1: Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-gradient-to-r from-accent/20 via-orange-500/20 to-accent/20 blur-3xl rounded-full" />
            <h1 className="relative text-4xl md:text-6xl font-bold bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              你的 Threads 貼文，有時爆、有時沉——這不是玄學
            </h1>
          </div>

          <p className="text-lg md:text-xl text-gray-300 mb-6 max-w-2xl mx-auto">
            Threads 背後是一套 AI 系統，它幫每個帳號建立「語意身份」。<br className="hidden md:block" />
            你不知道自己的身份，就不知道為什麼觸及起不來。
          </p>

          <p className="text-gray-400 mb-10 max-w-xl mx-auto">
            ThreadsIQ 分析你最近的 Threads 貼文，<br className="hidden md:block" />
            2 分鐘告訴你：你在 Threads AI 眼中是誰、主題是否集中、下一篇該往哪裡走。
          </p>

          {user ? (
            <Link
              to="/analyze"
              className="inline-flex items-center gap-2 px-8 py-4 bg-accent hover:bg-accent-hover text-white text-lg font-semibold rounded-xl transition-all hover:scale-105 shadow-lg shadow-accent/25"
            >
              免費分析我的帳號 →
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          ) : (
            <button
              onClick={handleAnalyze}
              className="inline-flex items-center gap-2 px-8 py-4 bg-accent hover:bg-accent-hover text-white text-lg font-semibold rounded-xl transition-all hover:scale-105 shadow-lg shadow-accent/25"
            >
              免費分析我的帳號 →
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          )}

          <p className="text-gray-500 text-sm mt-4">
            不需要帳號 · 不需要連接 Threads · 直接貼上貼文，30秒出結果
          </p>
        </div>
      </section>

      {/* Section 2: Platform FOMO */}
      <section className="py-16 px-4 bg-surface/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10">
            現在加入，還不晚——但視窗正在關閉
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-surface p-6 rounded-xl text-center border border-white/5">
              <div className="text-4xl md:text-5xl font-bold text-accent mb-2">1.415億</div>
              <div className="text-gray-400 text-sm mb-2">Threads 日活躍用戶</div>
              <div className="text-xs text-gray-500">2026年1月，已超越 X</div>
            </div>
            <div className="bg-surface p-6 rounded-xl text-center border border-white/5">
              <div className="text-4xl md:text-5xl font-bold text-accent mb-2">前 60 分鐘</div>
              <div className="text-gray-400 text-sm mb-2">決定 80% 的觸及命運</div>
              <div className="text-xs text-gray-500">Meta AI 系統特性</div>
            </div>
            <div className="bg-surface p-6 rounded-xl text-center border border-white/5">
              <div className="text-4xl md:text-5xl font-bold text-accent mb-2">0</div>
              <div className="text-gray-400 text-sm mb-2">目前沒有任何工具</div>
              <div className="text-xs text-gray-500">能分析你的 Threads 語意身份</div>
            </div>
          </div>

          <p className="text-gray-500 text-center text-sm mt-8">
            越早建立清晰的 Creator Embedding，演算法越能把你的內容推給對的人。
          </p>
        </div>
      </section>

      {/* Section 3: 痛點共鳴 */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-10">
            你有沒有這些困擾？
          </h2>

          <div className="space-y-4 mb-8">
            <div className="flex items-start gap-4 p-4 bg-surface rounded-xl border border-white/5">
              <span className="text-accent text-xl">☑</span>
              <p className="text-gray-300">認真寫的文觸及不到 500，隨手發的卻爆了</p>
            </div>
            <div className="flex items-start gap-4 p-4 bg-surface rounded-xl border border-white/5">
              <span className="text-accent text-xl">☑</span>
              <p className="text-gray-300">不知道自己的帳號「在演算法眼中是誰」</p>
            </div>
            <div className="flex items-start gap-4 p-4 bg-surface rounded-xl border border-white/5">
              <span className="text-accent text-xl">☑</span>
              <p className="text-gray-300">不知道下一篇該寫什麼，才能讓觸及穩定成長</p>
            </div>
          </div>

          <p className="text-center text-gray-400 text-lg">
            這些問題的根源，是你不知道自己的 <span className="text-accent font-semibold">Creator Embedding</span> 長什麼樣。
          </p>
        </div>
      </section>

      {/* Section 4: 如何運作 */}
      <section className="py-20 px-4 bg-surface/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            兩分鐘，看懂你的 Threads 語意身份
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-accent/20 flex items-center justify-center">
                <svg className="w-10 h-10 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">貼上你的貼文</h3>
              <p className="text-gray-400 text-sm">
                把最近的 5-30 篇 Threads 貼文貼進來。不需要截圖，直接複製文字。
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-accent/20 flex items-center justify-center">
                <svg className="w-10 h-10 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">AI 幫你做語意分析</h3>
              <p className="text-gray-400 text-sm">
                系統用 Meta 專利裡的 Embedding 技術，分析你的內容語意，找出主題集群，計算帳號健康度。
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-accent/20 flex items-center justify-center">
                <svg className="w-10 h-10 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">拿到可以馬上執行的建議</h3>
              <p className="text-gray-400 text-sm">
                不是模糊的「要發更多好內容」，是具體的：你的集群在哪、缺口在哪、下一篇往哪個方向走。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 5: 社會證明 */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-8">
            真實用戶的分析結果長這樣
          </h2>

          <div className="bg-[#0d0d0d] border border-white/10 rounded-xl p-6 text-left font-mono text-sm md:text-base">
            <div className="text-accent mb-4">帳號健康分數：83 / 100</div>
            <div className="text-gray-300 space-y-2">
              <div className="flex gap-2">
                <span className="text-gray-500">├──</span>
                <span>主題集群 0（26 篇・87%）：中東 × 教育 × 地緣政治</span>
              </div>
              <div className="flex gap-2 ml-4 text-gray-400">
                <span>│</span>
                <span>→ 你的受眾對「中東地區教育風險」主題高度集中</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500">├──</span>
                <span>主題集群 1（4 篇・13%）：在職工程師 × 碩士選擇</span>
              </div>
              <div className="flex gap-2 ml-4 text-gray-400">
                <span>│</span>
                <span>→ 少數貼文偏離主軸，可能稀釋受眾精準度</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500">└──</span>
                <span>AI 建議下一篇方向：</span>
              </div>
              <div className="ml-4 text-accent/80 italic">
                「比較各國教育政策對國際學生的影響——<br className="md:hidden" />
                這是你集群 0 目前的語意缺口，也是高搜尋意圖主題。」
              </div>
            </div>
          </div>

          <p className="text-gray-500 text-sm mt-4">
            這是真實用戶的分析結果（已獲授權展示）
          </p>
        </div>
      </section>

      {/* Section 6: 功能介紹 */}
      <section className="py-20 px-4 bg-surface/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            你會拿到的四件武器
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {/* 健康分數 */}
            <div className="bg-surface p-6 rounded-xl border border-white/5 hover:border-accent/30 transition-colors">
              <div className="text-3xl mb-3">🎯</div>
              <h3 className="text-xl font-semibold mb-2">你的語意焦點有多清晰？</h3>
              <p className="text-gray-400 text-sm">
                0-100 分衡量你的主題集中度。分數越高，演算法越容易把你歸類到正確的受眾群——你的貼文初始推送就越精準。
              </p>
            </div>

            {/* 語意集群 */}
            <div className="bg-surface p-6 rounded-xl border border-white/5 hover:border-accent/30 transition-colors">
              <div className="text-3xl mb-3">🗺️</div>
              <h3 className="text-xl font-semibold mb-2">你的帳號在 Threads AI 眼中是誰？</h3>
              <p className="text-gray-400 text-sm">
                用 Embedding 技術把你的貼文聚類，視覺化呈現你的主題分布圖。一眼看出：你在哪個話題群集競爭，哪些主題正在稀釋你的身份。
              </p>
            </div>

            {/* 下一 po 建議 */}
            <div className="bg-surface p-6 rounded-xl border border-white/5 hover:border-accent/30 transition-colors">
              <div className="text-3xl mb-3">💡</div>
              <h3 className="text-xl font-semibold mb-2">下一篇寫什麼，AI 幫你填空</h3>
              <p className="text-gray-400 text-sm">
                根據你的語意集群缺口，AI 提供具體的下一篇方向——不是「要發有價值的內容」，是「你這個主題下，目前搜尋量高但你還沒寫過的角度」。
              </p>
            </div>

            {/* 歷史追蹤 */}
            <div className="bg-surface p-6 rounded-xl border border-white/5 hover:border-accent/30 transition-colors">
              <div className="text-3xl mb-3">📈</div>
              <h3 className="text-xl font-semibold mb-2">每週分析，追蹤你的語意漂移</h3>
              <p className="text-gray-400 text-sm">
                記錄每次分析結果，讓你知道這週的發文有沒有強化你的 Creator Embedding，還是正在讓你的帳號身份飄移。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 7: 最終 CTA */}
      <section className="py-20 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            你的帳號，現在在 Threads AI 眼中是誰？
          </h2>
          <p className="text-gray-400 text-lg mb-8">
            2 分鐘找到答案。免費。不需要連接任何帳號。
          </p>

          {user ? (
            <Link
              to="/analyze"
              className="inline-flex items-center gap-2 px-10 py-5 bg-accent hover:bg-accent-hover text-white text-xl font-semibold rounded-xl transition-all hover:scale-105 shadow-lg shadow-accent/30"
            >
              立即免費分析 →
            </Link>
          ) : (
            <button
              onClick={handleAnalyze}
              className="inline-flex items-center gap-2 px-10 py-5 bg-accent hover:bg-accent-hover text-white text-xl font-semibold rounded-xl transition-all hover:scale-105 shadow-lg shadow-accent/30"
            >
              立即免費分析 →
            </button>
          )}

          <p className="text-gray-500 text-sm mt-4">
            已有創作者用 ThreadsIQ 找到自己的語意定位 ✓
          </p>
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
