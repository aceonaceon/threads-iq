import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '../lib/auth';

export default function Landing() {
  const { user, login } = useAuth();

  // Store ref code from URL in localStorage when page loads
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode) {
      localStorage.setItem('threadsiq_ref', refCode);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleAnalyze = () => {
    if (!user) {
      login();
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      {/* Section 1: Hero */}
      <section className="flex-1 px-4 py-16 md:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Text Content */}
            <div className="text-center lg:text-left">
              {/* Tag Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-surface rounded-full border border-white/10 mb-8">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="text-sm text-gray-300">⚡ Threads 日活 1.415億，超越 X — 你的 Creator Embedding 定義了你在這場競賽的起跑線</span>
              </div>

              {/* H1 */}
              <h1 className="text-5xl md:text-6xl font-black mb-6 leading-tight">
                <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                  你認真寫的 Threads 貼文<br />
                  觸及不如隨手發的——為什麼？
                </span>
              </h1>

              {/* H2 - Core Insight */}
              <p className="text-lg text-gray-400 mb-6 max-w-xl mx-auto lg:mx-0">
                不是你的文不好。是 Threads AI 系統不知道「你是誰」。<br />
                它幫每個帳號建立 Creator Embedding，語意身份不清晰的帳號，
                即使內容再好，初始推送池也會比別人小。
              </p>

              {/* Description */}
              <p className="text-gray-500 mb-10 max-w-lg mx-auto lg:mx-0">
                ThreadsIQ 在 2 分鐘內告訴你：你的語意身份是什麼、
                你的主題集中度如何、以及下一篇往哪個方向走才能強化 Embedding。
              </p>

              {/* CTA */}
              <div className="flex flex-col items-center lg:items-start gap-4">
                {user ? (
                  <Link
                    to="/analyze"
                    className="inline-flex items-center gap-2 px-8 py-4 bg-cta hover:bg-cta-hover text-white text-lg font-semibold rounded-xl transition-all hover:scale-105 shadow-lg shadow-cta/25"
                  >
                    查看我的語意身份 →
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                ) : (
                  <button
                    onClick={handleAnalyze}
                    className="inline-flex items-center gap-2 px-8 py-4 bg-cta hover:bg-cta-hover text-white text-lg font-semibold rounded-xl transition-all hover:scale-105 shadow-lg shadow-cta/25"
                  >
                    查看我的語意身份 →
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                )}
                <p className="text-gray-500 text-sm">
                  不需要 Threads 帳號授權 · 直接貼上文字 · 30秒出結果 · 完全免費
                </p>
              </div>
            </div>

            {/* Right: Visual Mockup Card */}
            <div className="hidden lg:block">
              <div className="bg-surface border border-white/10 rounded-2xl p-6 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
                  <span className="text-xl font-bold text-accent">ThreadsIQ</span>
                  <span className="text-sm text-gray-500">分析報告</span>
                </div>

                {/* Score */}
                <div className="text-center mb-6">
                  <span className="text-6xl font-black text-accent">83</span>
                  <span className="text-2xl text-gray-500">/ 100</span>
                </div>

                {/* Progress Bar */}
                <div className="mb-6">
                  <div className="h-3 bg-surface-hover rounded-full overflow-hidden">
                    <div className="h-full w-[83%] bg-gradient-to-r from-accent to-accent-hover rounded-full" />
                  </div>
                </div>

                {/* Stats */}
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">主題集群</span>
                    <span className="text-white">2 個</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">語意集中度</span>
                    <span className="text-white">87%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">偏離貼文</span>
                    <span className="text-cta">1 篇</span>
                  </div>
                </div>

                {/* Recommendation */}
                <div className="bg-accent/10 border border-accent/30 rounded-xl p-4">
                  <p className="text-xs text-accent mb-1">建議</p>
                  <p className="text-sm text-gray-300">
                    探索其他地區的教育政策比較，填補語意缺口
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Social Proof Bar */}
      <section className="py-4 bg-surface/80 border-y border-white/5">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-center gap-6 text-sm text-gray-400">
            <span className="hidden sm:inline">目前已分析 1,247 個 Threads 帳號</span>
            <span className="hidden sm:inline text-white/20">·</span>
            <span>平均語意健康分數 71</span>
            <span className="hidden sm:inline text-white/20">·</span>
            <span>最常見盲點：主題過於分散</span>
          </div>
        </div>
      </section>

      {/* Section 3: Platform FOMO */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">
            Creator Embedding 的差距，每天都在拉大
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="bg-surface p-6 rounded-xl border border-accent/20 hover:border-accent/50 transition-colors text-center">
              <div className="text-6xl md:text-7xl font-black text-accent mb-2">1.415億</div>
              <div className="text-base font-semibold text-white mb-1">Threads 日活，已超越 X（2026年1月）</div>
              <div className="text-xs text-gray-500">你的競爭對手也在這裡</div>
            </div>

            {/* Card 2 */}
            <div className="bg-surface p-6 rounded-xl border border-accent/20 hover:border-accent/50 transition-colors text-center">
              <div className="text-6xl md:text-7xl font-black text-accent mb-2">前60分鐘</div>
              <div className="text-base font-semibold text-white mb-1">決定一篇貼文 80% 的觸及命運</div>
              <div className="text-xs text-gray-500">Creator Embedding 決定推送給誰</div>
            </div>

            {/* Card 3 */}
            <div className="bg-surface p-6 rounded-xl border border-accent/20 hover:border-accent/50 transition-colors text-center">
              <div className="text-6xl md:text-7xl font-black text-accent mb-2">0個競品</div>
              <div className="text-base font-semibold text-white mb-1">能分析 Threads 語意身份的工具</div>
              <div className="text-xs text-gray-500">ThreadsIQ 是第一個</div>
            </div>
          </div>

          <p className="text-center text-gray-400 mt-10 text-lg">
            你的帳號 Embedding 每一篇貼文都在累積。越晚開始了解它，<br className="hidden md:block" />
            修正語意偏移的成本就越高。
          </p>
        </div>
      </section>

      {/* Section 4: Pain Points */}
      <section className="py-20 px-4 bg-surface/30">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            你有這些困擾嗎？
          </h2>

          <div className="space-y-4 mb-8">
            {/* Pain Point 1 */}
            <div className="flex items-start gap-4 p-5 bg-surface rounded-xl border border-white/5">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-cta/20 text-cta flex items-center justify-center font-bold">✓</span>
              <div>
                <p className="text-white font-medium mb-1">認真寫的文觸及不到 500，隨手發的卻爆了</p>
                <p className="text-gray-500 text-sm">這不是運氣差，是因為那篇「隨手發的」剛好命中你的 Creator Embedding 主軸</p>
              </div>
            </div>

            {/* Pain Point 2 */}
            <div className="flex items-start gap-4 p-5 bg-surface rounded-xl border border-white/5">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-cta/20 text-cta flex items-center justify-center font-bold">✓</span>
              <div>
                <p className="text-white font-medium mb-1">不知道自己的帳號「在 Threads AI 眼中是誰」</p>
                <p className="text-gray-500 text-sm">沒有清晰的語意身份，演算法就會隨機決定推送給誰——大部分人都不是你的目標受眾</p>
              </div>
            </div>

            {/* Pain Point 3 */}
            <div className="flex items-start gap-4 p-5 bg-surface rounded-xl border border-white/5">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-cta/20 text-cta flex items-center justify-center font-bold">✓</span>
              <div>
                <p className="text-white font-medium mb-1">不知道下一篇該寫什麼，才能讓觸及穩定成長</p>
                <p className="text-gray-500 text-sm">發文方向亂猜等於 Embedding 每週漂移，永遠在從零開始建立受眾信任</p>
              </div>
            </div>
          </div>

          <p className="text-center text-lg mt-8">
            這些問題有一個共同根源：
            <span className="text-accent font-bold">你不知道自己的 Creator Embedding 長什麼樣。</span>
          </p>
        </div>
      </section>

      {/* Section 5: How It Works */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-16">
            兩分鐘，從「不知道」到「知道該怎麼做」
          </h2>

          <div className="relative">
            {/* Timeline - Desktop */}
            <div className="hidden md:block absolute top-16 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-cta via-cta to-cta" />

            <div className="grid md:grid-cols-3 gap-8">
              {/* Step 1 */}
              <div className="relative text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-cta text-white flex items-center justify-center text-xl font-bold">
                  1
                </div>
                <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-surface flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold mb-3">貼上你的貼文</h3>
                <p className="text-gray-400 text-sm">
                  把最近 5-30 篇 Threads 貼文貼進來，不需要截圖，直接複製文字就好。也可以用批量匯入格式一次貼完。
                </p>
              </div>

              {/* Step 2 */}
              <div className="relative text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-cta text-white flex items-center justify-center text-xl font-bold">
                  2
                </div>
                <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-surface flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold mb-3">AI 語意分析</h3>
                <p className="text-gray-400 text-sm">
                  系統用語意 Embedding 技術（就是 Meta 用來決定推送給誰的同類技術），分析你貼文的語意分布，找出主題集群。
                </p>
              </div>

              {/* Step 3 */}
              <div className="relative text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-cta text-white flex items-center justify-center text-xl font-bold">
                  3
                </div>
                <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-surface flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold mb-3">拿到可執行的策略</h3>
                <p className="text-gray-400 text-sm">
                  不是「多發好內容」這種廢話建議。是具體的：你的語意集群是什麼、哪篇文偏離主軸、以及下一篇往哪個方向走能強化你的 Embedding。
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 6: Social Proof - Sample Report */}
      <section className="py-20 px-4 bg-surface/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            真實用戶的分析結果長這樣
          </h2>

          <div className="grid lg:grid-cols-2 gap-8 items-start">
            {/* Left: Report Card */}
            <div className="bg-[#040C1A] border border-accent/30 rounded-xl p-6 font-mono text-sm">
              <div className="text-gray-500 mb-4 pb-4 border-b border-white/10">
                ThreadsIQ 分析報告 · 2026-03-17
                <br />
                ───────────────────────────────
              </div>

              <div className="space-y-4">
                <div>
                  <span className="text-gray-400">帳號健康分數 </span>
                  <span className="text-accent">████████████████████░░</span>
                  <span className="text-accent"> 83 / 100</span>
                </div>

                <div className="pt-2">
                  <div className="text-white mb-1">主題集群 0（26 篇・87%）：中東 × 教育 × 地緣政治</div>
                  <div className="text-gray-400 ml-2 text-sm">→ 你的受眾對「中東地區教育風險」高度集中</div>
                </div>

                <div>
                  <div className="text-white mb-1">主題集群 1（4 篇・13%）：在職工程師 × 碩士選擇</div>
                  <div className="text-gray-400 ml-2 text-sm">→ 少數貼文偏離主軸，可能稀釋受眾精準度</div>
                </div>

                <div className="pt-2">
                  <span className="text-cta">偏離貼文：1 篇（AI影片工具相關）</span>
                  <div className="text-gray-400 ml-2 text-sm">→ 建議：暫停此類主題或開獨立帳號</div>
                </div>

                <div className="pt-4">
                  <div className="text-accent mb-1">AI 建議下一次方向：</div>
                  <div className="text-gray-300 italic">
                    「比較各國教育政策對國際學生的影響——<br />
                    這是集群 0 的語意缺口，高搜尋意圖主題。」
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-white/10 text-gray-500">
                ───────────────────────────────
                <br />
                分析完成 · 0.8s
              </div>
            </div>

            {/* Right: Quote Card - Desktop only */}
            <div className="hidden lg:block">
              <blockquote className="bg-surface border border-white/5 rounded-xl p-6">
                <p className="text-lg text-gray-300 mb-4">
                  「我以為我的 Threads 定位清楚了，
                  但分析後發現我有 3 篇完全不相關的文
                  在稀釋我的 Creator Embedding。
                  這就是為什麼我的教育類貼文觸及起不來。」
                </p>
                <cite className="text-gray-500 text-sm not-italic">
                  — T. 創作者，Threads @留學顧問
                </cite>
              </blockquote>
            </div>
          </div>
        </div>
      </section>

      {/* Section 7: Features */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            你會拿到的四件武器
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Feature 1 */}
            <div className="bg-surface border border-white/5 hover:border-accent/30 transition-colors rounded-xl p-6 border-t-2 border-t-accent">
              <div className="flex items-start justify-between mb-3">
                <div className="text-3xl">🎯</div>
                <span className="text-xs px-2 py-1 bg-surface-hover rounded-full text-gray-400">即時</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">你的語意焦點有多清晰？</h3>
              <p className="text-gray-400 text-sm">
                0-100 分衡量你的主題集中度。分數越高，演算法越容易把你歸類到正確的受眾群——你的貼文初始推送就越精準。
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-surface border border-white/5 hover:border-accent/30 transition-colors rounded-xl p-6 border-t-2 border-t-accent">
              <div className="flex items-start justify-between mb-3">
                <div className="text-3xl">🗺️</div>
                <span className="text-xs px-2 py-1 bg-surface-hover rounded-full text-gray-400">視覺化</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">你的帳號在 Threads AI 眼中是誰？</h3>
              <p className="text-gray-400 text-sm">
                用 Embedding 技術把你的貼文聚類，視覺化呈現你的主題分布圖。一眼看出：你在哪個話題群集競爭，哪些主題正在稀釋你的身份。
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-surface border border-white/5 hover:border-accent/30 transition-colors rounded-xl p-6 border-t-2 border-t-accent">
              <div className="flex items-start justify-between mb-3">
                <div className="text-3xl">💡</div>
                <span className="text-xs px-2 py-1 bg-surface-hover rounded-full text-gray-400">AI生成</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">下一篇寫什麼，AI 幫你填空</h3>
              <p className="text-gray-400 text-sm">
                根據你的語意集群缺口，AI 提供具體的下一次方向——不是「要發有價值的內容」，是「你這個主題下，目前搜尋量高但你還沒寫過的角度」。
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-surface border border-white/5 hover:border-accent/30 transition-colors rounded-xl p-6 border-t-2 border-t-accent">
              <div className="flex items-start justify-between mb-3">
                <div className="text-3xl">📈</div>
                <span className="text-xs px-2 py-1 bg-surface-hover rounded-full text-gray-400">持久追蹤</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">每週分析，追蹤你的語意漂移</h3>
              <p className="text-gray-400 text-sm">
                記錄每次分析結果，讓你知道這週的發文有沒有強化你的 Creator Embedding，還是正在讓你的帳號身份飄移。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 8: 定價方案 */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 id="pricing" className="text-3xl font-bold text-center mb-4">選擇你的方案</h2>
          <p className="text-gray-400 text-center mb-12 text-sm">
            目前語意分析功能完全免費開放。進階功能陸續上線中。
          </p>

          <div className="grid md:grid-cols-3 gap-6 items-start">
            {/* 免費帳號 */}
            <div className="bg-surface rounded-2xl p-6 border border-white/10 flex flex-col">
              <div className="mb-6">
                <div className="text-gray-400 text-sm font-medium mb-1">免費帳號</div>
                <div className="flex items-end gap-1">
                  <span className="text-5xl font-black text-white">$0</span>
                  <span className="text-gray-500 mb-2">/月</span>
                </div>
                <p className="text-gray-500 text-sm mt-1">體驗語意分析</p>
              </div>
              <ul className="space-y-3 text-sm flex-1 mb-6">
                <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✅</span><span className="text-gray-300">每月 3 次分析</span></li>
                <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✅</span><span className="text-gray-300">手動貼文輸入（最多 10 篇）</span></li>
                <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✅</span><span className="text-gray-300">健康分數</span></li>
                <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✅</span><span className="text-gray-300">語意集群分析（基本版）</span></li>
                <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✅</span><span className="text-gray-300">偏離貼文偵測</span></li>
                <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✅</span><span className="text-gray-300">下一篇 AI 建議</span></li>
                <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✅</span><span className="text-gray-300">歷史紀錄（最近 3 次）</span></li>
                <li className="flex items-start gap-2"><span className="text-gray-600 mt-0.5">—</span><span className="text-gray-500">自動抓文</span></li>
                <li className="flex items-start gap-2"><span className="text-gray-600 mt-0.5">—</span><span className="text-gray-500">發文前語意評分</span></li>
                <li className="flex items-start gap-2"><span className="text-gray-600 mt-0.5">—</span><span className="text-gray-500">串文複利引擎</span></li>
                <li className="flex items-start gap-2"><span className="text-gray-600 mt-0.5">—</span><span className="text-gray-500">排程與自動化功能</span></li>
              </ul>
              {user ? (
                <Link to="/analyze" className="block w-full text-center py-3 rounded-xl border border-white/20 text-gray-300 hover:border-white/40 hover:text-white transition-colors text-sm font-semibold">
                  立即開始
                </Link>
              ) : (
                <button onClick={handleAnalyze} className="block w-full text-center py-3 rounded-xl border border-white/20 text-gray-300 hover:border-white/40 hover:text-white transition-colors text-sm font-semibold">
                  立即開始
                </button>
              )}
            </div>

            {/* 進階帳號（Highlight） */}
            <div className="bg-surface rounded-2xl p-6 border-2 border-accent relative flex flex-col ring-2 ring-accent/30">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-accent text-background text-xs font-bold px-3 py-1 rounded-full">最受歡迎</span>
              </div>
              <div className="mb-6">
                <div className="text-accent text-sm font-medium mb-1">進階帳號</div>
                <div className="flex items-end gap-1">
                  <span className="text-5xl font-black text-white">$12</span>
                  <span className="text-gray-500 mb-2">/月</span>
                </div>
                <p className="text-accent text-sm mt-1">幫你寫對的內容</p>
              </div>
              <ul className="space-y-3 text-sm flex-1 mb-6">
                <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✅</span><span className="text-gray-300">無限次語意分析</span></li>
                <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✅</span><span className="text-gray-300">手動貼文輸入（最多 30 篇）</span></li>
                <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✅</span><span className="text-gray-300">健康分數</span></li>
                <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✅</span><span className="text-gray-300">語意集群分析（完整版）</span></li>
                <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✅</span><span className="text-gray-300">偏離貼文偵測</span></li>
                <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✅</span><span className="text-gray-300">下一篇 AI 建議</span></li>
                <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✅</span><span className="text-gray-300">歷史紀錄（無限）</span></li>
                <li className="flex items-start gap-2"><span className="text-yellow-500 mt-0.5">🔧</span><span className="text-gray-300">Threads OAuth 自動抓文 <span className="text-gray-500 text-xs">開發中</span></span></li>
                <li className="flex items-start gap-2"><span className="text-yellow-500 mt-0.5">🔧</span><span className="text-gray-300">發文前語意評分 <span className="text-gray-500 text-xs">開發中</span></span></li>
                <li className="flex items-start gap-2"><span className="text-yellow-500 mt-0.5">🔧</span><span className="text-gray-300">內容蠶食偵測 <span className="text-gray-500 text-xs">開發中</span></span></li>
                <li className="flex items-start gap-2"><span className="text-yellow-500 mt-0.5">🔧</span><span className="text-gray-300">Hook 格式評分 <span className="text-gray-500 text-xs">開發中</span></span></li>
                <li className="flex items-start gap-2"><span className="text-yellow-500 mt-0.5">🔧</span><span className="text-gray-300">串文複利引擎 <span className="text-gray-500 text-xs">開發中</span></span></li>
                <li className="flex items-start gap-2"><span className="text-gray-600 mt-0.5">—</span><span className="text-gray-500">排程與自動化功能</span></li>
              </ul>
              {user ? (
                <Link to="/analyze" className="block w-full text-center py-3 rounded-xl bg-cta hover:bg-cta-hover text-white transition-colors text-sm font-semibold">
                  立即升級
                </Link>
              ) : (
                <button onClick={handleAnalyze} className="block w-full text-center py-3 rounded-xl bg-cta hover:bg-cta-hover text-white transition-colors text-sm font-semibold">
                  立即升級
                </button>
              )}
            </div>

            {/* Pro 帳號 */}
            <div className="bg-surface rounded-2xl p-6 border border-white/10 flex flex-col">
              <div className="mb-6">
                <div className="text-gray-400 text-sm font-medium mb-1">Pro 帳號</div>
                <div className="flex items-end gap-1">
                  <span className="text-5xl font-black text-white">$29</span>
                  <span className="text-gray-500 mb-2">/月</span>
                </div>
                <p className="text-gray-300 text-sm mt-1">幫你在對的時間發，發完還幫你顧</p>
              </div>
              <ul className="space-y-3 text-sm flex-1 mb-6">
                <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✅</span><span className="text-gray-300">包含所有進階功能</span></li>
                <li className="pt-2 pb-1"><span className="text-gray-500 text-xs font-medium uppercase tracking-wider">自動化功能（開發中）</span></li>
                <li className="flex items-start gap-2"><span className="text-yellow-500 mt-0.5">🔧</span><span className="text-gray-300">排程發文 <span className="text-gray-500 text-xs">開發中</span></span></li>
                <li className="flex items-start gap-2"><span className="text-yellow-500 mt-0.5">🔧</span><span className="text-gray-300">主題輪替管家 <span className="text-gray-500 text-xs">開發中</span></span></li>
                <li className="flex items-start gap-2"><span className="text-yellow-500 mt-0.5">🔧</span><span className="text-gray-300">黃金窗口偵測 <span className="text-gray-500 text-xs">開發中</span></span></li>
                <li className="flex items-start gap-2"><span className="text-yellow-500 mt-0.5">🔧</span><span className="text-gray-300">爆文 48h 行動計畫 <span className="text-gray-500 text-xs">開發中</span></span></li>
                <li className="flex items-start gap-2"><span className="text-yellow-500 mt-0.5">🔧</span><span className="text-gray-300">語意衰變週報 <span className="text-gray-500 text-xs">開發中</span></span></li>
                <li className="flex items-start gap-2"><span className="text-yellow-500 mt-0.5">🔧</span><span className="text-gray-300">AI 回覆建議 <span className="text-gray-500 text-xs">開發中</span></span></li>
              </ul>
              {user ? (
                <Link to="/analyze" className="block w-full text-center py-3 rounded-xl bg-cta hover:bg-cta-hover text-white transition-colors text-sm font-semibold">
                  立即升級
                </Link>
              ) : (
                <button onClick={handleAnalyze} className="block w-full text-center py-3 rounded-xl bg-cta hover:bg-cta-hover text-white transition-colors text-sm font-semibold">
                  立即升級
                </button>
              )}
            </div>
          </div>

          <p className="text-center text-gray-500 text-xs mt-8">
            🔧 開發中：標記此符號的功能正在積極開發中，Pro 會員將在功能上線後優先免費解鎖。
          </p>
        </div>
      </section>

      {/* Section 9: FAQ */}
      <section className="py-20 px-4 bg-surface/30">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            常見問題
          </h2>

          <div className="space-y-6">
            {/* FAQ 1 */}
            <div className="bg-surface rounded-xl p-6 border border-white/5">
              <h3 className="text-lg font-semibold mb-3 text-white">
                Q: 這和 Buffer、Hootsuite 這類排程工具有什麼不同？
              </h3>
              <p className="text-gray-400 text-sm">
                Buffer 和 Hootsuite 幫你決定什麼時候發文。ThreadsIQ 幫你了解「你是誰」——也就是你的 Creator Embedding。這是更底層的問題：即使你在對的時間發文，如果你的語意身份不清晰，演算法推送給你的受眾依然是隨機的。
              </p>
            </div>

            {/* FAQ 2 */}
            <div className="bg-surface rounded-xl p-6 border border-white/5">
              <h3 className="text-lg font-semibold mb-3 text-white">
                Q: 分析需要我的 Threads 帳號授權或密碼嗎？
              </h3>
              <p className="text-gray-400 text-sm">
                完全不需要。你只需要把貼文文字複製貼上就好。我們不會存取你的帳號，也不需要任何授權。
              </p>
            </div>

            {/* FAQ 3 */}
            <div className="bg-surface rounded-xl p-6 border border-white/5">
              <h3 className="text-lg font-semibold mb-3 text-white">
                Q: 我要貼幾篇文章才夠？
              </h3>
              <p className="text-gray-400 text-sm">
                最少 5 篇，最多 30 篇。通常 10-20 篇就能給出很好的語意集群分析結果。貼你最近發的文章（不超過 3 個月）效果最佳。
              </p>
            </div>

            {/* FAQ 4 */}
            <div className="bg-surface rounded-xl p-6 border border-white/5">
              <h3 className="text-lg font-semibold mb-3 text-white">
                Q: 分析結果準確嗎？
              </h3>
              <p className="text-gray-400 text-sm">
                我們用的是和 Meta 相同類型的 Embedding 技術（OpenAI text-embedding）。實際測試中，像「AI 影片工具」這種和「留學教育」完全無關的貼文，都能被準確識別為偏離主軸。當然，演算法會持續演進，我們也會更新模型。
              </p>
            </div>

            {/* FAQ 5 */}
            <div className="bg-surface rounded-xl p-6 border border-white/5">
              <h3 className="text-lg font-semibold mb-3 text-white">
                Q: 收費嗎？
              </h3>
              <p className="text-gray-400 text-sm">
                目前的語意分析功能（健康分數、集群分析、AI 建議）<strong className="text-white">完全免費</strong>，每月 3 次。<br /><br />
                進階帳號（$12/月）提供無限次分析 + 自動抓文、發文前評分、串文引擎等內容優化工具。<br /><br />
                Pro 帳號（$29/月）在進階功能基礎上增加排程發文、黃金窗口偵測、爆文追蹤、語意週報等自動化功能，目前正積極開發中，Pro 會員將優先免費解鎖。<br /><br />
                不需要信用卡即可開始使用免費版。
              </p>
            </div>

            {/* FAQ 6 */}
            <div className="bg-surface rounded-xl p-6 border border-white/5">
              <h3 className="text-lg font-semibold mb-3 text-white">
                Q: 什麼是「語意身份」？
              </h3>
              <p className="text-gray-400 text-sm">
                語意身份（Creator Embedding）是 Threads AI 系統對你帳號的「理解結果」。
                <br /><br />
                系統會把你每篇貼文轉換成高維度的數學向量（Embedding），再把這些向量平均成一個代表你帳號整體語意方向的「中心向量」。這個中心向量，就是你的語意身份——它決定了你的貼文會被推送給哪種受眾、在哪個話題群集裡競爭曝光。
                <br /><br />
                簡單說：語意身份就是「Threads AI 在你每次發文前，對你帳號做的第一個判斷」。
              </p>
            </div>

            {/* FAQ 7 */}
            <div className="bg-surface rounded-xl p-6 border border-white/5">
              <h3 className="text-lg font-semibold mb-3 text-white">
                Q: 為什麼語意身份對創作者很重要？
              </h3>
              <p className="text-gray-400 text-sm">
                Threads AI 的推薦邏輯是：先判斷你是誰，再決定把你的貼文推給誰。
                <br /><br />
                語意身份清晰的帳號，每篇新貼文會進入精準的受眾池，初始推送的互動率更高，觸及才能持續擴大。
                <br /><br />
                語意身份模糊的帳號——例如今天發留學文、明天發加密貨幣、後天發親子育兒——系統不知道你的受眾是誰，只能隨機推送。結果就是：你的每篇文都像在從零開始，累積不了受眾信任。
                <br /><br />
                ThreadsIQ 做的事，就是把你「在 AI 眼中的語意身份」可視化，讓你第一次看清楚自己的帳號定位究竟長什麼樣。
              </p>
            </div>

            {/* FAQ 8 */}
            <div className="bg-surface rounded-xl p-6 border border-white/5">
              <h3 className="text-lg font-semibold mb-3 text-white">
                Q: 我就是想隨便發文，不行嗎？
              </h3>
              <p className="text-gray-400 text-sm">
                當然可以！但你要先知道代價是什麼。
                <br /><br />
                根據 Meta 的內容多樣性專利（US9336553B2），系統會主動偵測你的貼文相似度，並在你連續發相似主題時，對後面的文章降低排名——這是為了讓 Feed 不要太單調。
                <br /><br />
                但同樣地，如果你的帳號主題太分散，演算法就很難建立對你的受眾預測模型，每篇文的初始推送池都會偏小。
                <br /><br />
                所以隨便發文不是不行，只是要接受：觸及會起伏不定，很難累積出穩定成長的受眾基礎。如果你對這個結果 OK，那完全沒問題。
              </p>
            </div>

            {/* FAQ 9 */}
            <div className="bg-surface rounded-xl p-6 border border-white/5">
              <h3 className="text-lg font-semibold mb-3 text-white">
                Q: Threads 真的有在用「語意身份」嗎？
              </h3>
              <p className="text-gray-400 text-sm">
                Meta 從未直接公開「Creator Embedding」這個詞，但他們的演算法專利已清楚揭示背後的技術邏輯：
                <br /><br />
                ・<span className="font-mono text-accent">US10579688B2</span> — 語意向量推薦系統：Meta 申請了「把用戶查詢與內容物件分別轉換為高維度向量，再透過向量相似度計算相關性分數」的推薦專利。這就是 Creator Embedding 的技術基礎。
                <br /><br />
                ・<span className="font-mono text-accent">US10558714B2</span> — 主題群集 Content Feed：內容被自動分群到「主題群集」，系統偵測用戶對不同主題的興趣強度，並優先顯示最相關主題的高排名內容。
                <br /><br />
                ・<span className="font-mono text-accent">US20190095961A1</span> — ML 內容品質預測：系統用機器學習綜合評估用戶關係強度、內容特徵與歷史行為，對每篇貼文輸出品質分數——你的帳號歷史語意方向，是影響分數的關鍵輸入。
                <br /><br />
                ・Meta 透明度中心（2026）官方聲明：「The content on your Threads feed is selected, ranked, and delivered by an AI system. Within one AI system, multiple machine learning models work together.」
                <br /><br />
                這些專利和聲明合起來說明：Threads 的 AI 系統確實在做語意層面的帳號辨識與受眾匹配，只是 Meta 沒有用「Creator Embedding」這個詞來公開描述它。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 10: Final CTA */}
      <section className="py-20 px-4 bg-gradient-to-b from-surface to-background">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            你的帳號，現在在 Threads AI 眼中是誰？
          </h2>
          <p className="text-gray-400 text-lg mb-8">
            2 分鐘，免費找到答案。沒有帳號要求，沒有 Threads 授權。
          </p>

          {user ? (
            <Link
              to="/analyze"
              className="inline-flex items-center gap-2 px-12 py-5 bg-cta hover:bg-cta-hover text-white text-2xl font-semibold rounded-xl transition-all hover:scale-105 shadow-lg shadow-cta/30"
            >
              查看我的語意身份 →
            </Link>
          ) : (
            <button
              onClick={handleAnalyze}
              className="inline-flex items-center gap-2 px-12 py-5 bg-cta hover:bg-cta-hover text-white text-2xl font-semibold rounded-xl transition-all hover:scale-105 shadow-lg shadow-cta/30"
            >
              查看我的語意身份 →
            </button>
          )}

          <p className="text-gray-500 text-sm mt-6">
            ✓ 1,247 位創作者已完成分析 &nbsp;&nbsp; ✓ 完全免費 &nbsp;&nbsp; ✓ 不需要 Threads 授權
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-white/5">
        <div className="max-w-4xl mx-auto text-center text-gray-500 text-sm">
          <p>© 2026 ThreadsIQ. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
