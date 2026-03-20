import { useState } from 'react';
import HealthScore from './HealthScore';
import ClusterChart from './ClusterChart';
import TopicSuggestions from './TopicSuggestions';
import type { AnalysisResult } from '../lib/api';

interface AnalysisReportProps {
  result: AnalysisResult;
  posts: string[];
}

const CLUSTER_COLORS = [
  '#E85D04',
  '#3B82F6',
  '#10B981',
  '#8B5CF6',
  '#EC4899',
  '#F59E0B',
  '#06B6D4',
  '#EF4444',
];

// CTA Component for free users
function EngagementCTACard() {
  return (
    <div className="bg-surface rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '0.15s' }}>
      <div className="text-center py-8">
        <div className="text-4xl mb-4">📊</div>
        <h2 className="text-xl font-bold mb-2">互動數據</h2>
        <p className="text-gray-400 mb-6 max-w-md mx-auto">
          連結 Threads 帳號，解鎖完整互動分析
        </p>
        <ul className="text-left text-gray-500 text-sm max-w-xs mx-auto mb-6 space-y-2">
          <li className="flex items-center gap-2">
            <span className="text-accent">✓</span> 觀看次數、互動率
          </li>
          <li className="flex items-center gap-2">
            <span className="text-accent">✓</span> 按格式/叢集分析
          </li>
          <li className="flex items-center gap-2">
            <span className="text-accent">✓</span> AI 生成的精準優化建議
          </li>
        </ul>
        <div className="flex gap-3 justify-center">
          <a
            href="/analyze"
            className="px-6 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl transition-colors"
          >
            立即連結帳號
          </a>
          <a
            href="/#pricing"
            className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition-colors"
          >
            升級 Pro
          </a>
        </div>
      </div>
    </div>
  );
}

export default function AnalysisReport({ result, posts }: AnalysisReportProps) {
  const [expandedClusters, setExpandedClusters] = useState<Set<number>>(new Set());

  const { points2D, labels, topicAnalysis, engagementStats } = result;
  const { clusters, healthScore, healthAssessment, nextPostSuggestions, recommendations } = topicAnalysis;
  
  const hasEngagementData = !!engagementStats;

  const toggleCluster = (idx: number) => {
    const newExpanded = new Set(expandedClusters);
    if (newExpanded.has(idx)) {
      newExpanded.delete(idx);
    } else {
      newExpanded.add(idx);
    }
    setExpandedClusters(newExpanded);
  };

  // Get cluster indices
  const clusterIndices = [...new Set(labels)].filter(c => c >= 0);
  const noiseIndices = labels.map((l, i) => l === -1 ? i : -1).filter(i => i >= 0);

  // Group posts by cluster
  const postsByCluster = clusterIndices.map(clusterIdx => 
    labels.map((l, i) => l === clusterIdx ? i : -1).filter(i => i >= 0)
  );

  const getAssessmentText = (score: number): string => {
    if (score >= 80) return '極佳';
    if (score >= 60) return '良好';
    if (score >= 40) return '中等';
    return '需改善';
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Health Score Hero */}
      <div className="bg-surface rounded-2xl p-8 text-center">
        <HealthScore 
          score={healthScore} 
          assessment={healthAssessment || getAssessmentText(healthScore)} 
          hasEngagementData={hasEngagementData}
        />
        <p className="text-gray-500 mt-4 max-w-md mx-auto">
          這個分數反映了你的內容聚焦程度。高分表示你的主題明確且一致，
          低分表示內容過於分散。
        </p>
      </div>

      {/* Engagement Stats - Show CTA for free users, actual data for connected users */}
      {hasEngagementData ? (
        <div className="bg-surface rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '0.15s' }}>
          <h2 className="text-xl font-bold mb-4">📊 貼文表現數據</h2>
          
          {/* Account Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-accent">{engagementStats.account.totalViews.toLocaleString()}</div>
              <div className="text-sm text-gray-500">總瀏覽</div>
            </div>
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-accent">{engagementStats.account.engagementRate}</div>
              <div className="text-sm text-gray-500">互動率</div>
            </div>
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-accent">{engagementStats.account.totalLikes.toLocaleString()}</div>
              <div className="text-sm text-gray-500">總愛心</div>
            </div>
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-accent">{engagementStats.account.totalReplies.toLocaleString()}</div>
              <div className="text-sm text-gray-500">總回覆</div>
            </div>
          </div>

          {/* By Cluster */}
          {engagementStats.byCluster.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold mb-2">叢集表現</h3>
              <div className="space-y-2">
                {engagementStats.byCluster.map((c, i) => (
                  <div key={i} className="flex justify-between items-center bg-white/5 rounded-lg px-4 py-2">
                    <span>{c.name}</span>
                    <span className="text-accent font-medium">{c.avgEngagementRate} 互動率</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* By Format */}
          {engagementStats.byFormat.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">格式表現</h3>
              <div className="flex gap-4">
                {engagementStats.byFormat.map((f, i) => (
                  <div key={i} className="flex-1 bg-white/5 rounded-lg px-4 py-2 text-center">
                    <div className="font-medium">{f.type || '未知'}</div>
                    <div className="text-accent">{f.avgEngagementRate}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <EngagementCTACard />
      )}

      {/* Semantic Cluster Map */}
      <div className="bg-surface rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <h2 className="text-xl font-bold mb-4">語意集群分佈</h2>
        <ClusterChart 
          points2D={points2D} 
          labels={labels} 
          posts={posts}
          clusterTopics={clusters.map(c => c.keywords)}
        />
      </div>

      {/* Cluster Breakdown */}
      <div className="bg-surface rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '0.2s' }}>
        <h2 className="text-xl font-bold mb-4">主題集群分析</h2>
        <div className="space-y-4">
          {clusterIndices.map((clusterIdx, idx) => {
            const cluster = clusters[clusterIdx];
            const clusterPosts = postsByCluster[idx];
            const isExpanded = expandedClusters.has(idx);
            
            return (
              <div 
                key={clusterIdx}
                className="border border-white/10 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => toggleCluster(idx)}
                  className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: CLUSTER_COLORS[idx % CLUSTER_COLORS.length] }}
                    />
                    <span className="font-medium">{cluster?.name || cluster?.keywords || `主題 ${idx + 1}`}</span>
                    <span className="text-gray-500 text-sm">
                      ({clusterPosts.length} 篇，{Math.round(clusterPosts.length / posts.length * 100)}%)
                    </span>
                  </div>
                  <svg 
                    className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-2">
                    {clusterPosts.map((postIdx, i) => (
                      <div 
                        key={i}
                        className="text-sm text-gray-400 bg-background p-3 rounded-lg line-clamp-2"
                      >
                        {posts[postIdx]}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Outlier Analysis */}
      {noiseIndices.length > 0 && (
        <div className="bg-surface rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <h2 className="text-xl font-bold mb-4">離群貼文</h2>
          <p className="text-gray-500 mb-4">
            這些貼文與其他貼文語意差異較大，可能是偏離主題或內容太過獨特。
          </p>
          <div className="space-y-2">
            {noiseIndices.slice(0, 5).map((postIdx, i) => (
              <div 
                key={i}
                className="text-sm text-gray-400 bg-background p-3 rounded-lg line-clamp-2"
              >
                {posts[postIdx]}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Topic Suggestions */}
      <TopicSuggestions suggestions={nextPostSuggestions} />

      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
        <div className="bg-surface rounded-xl p-6 animate-fade-in">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="text-xl">📊</span>
            策略建議
          </h3>
          <ul className="space-y-2">
            {recommendations.map((rec, idx) => (
              <li key={idx} className="text-gray-300 flex items-start gap-2">
                <span className="text-gray-500">•</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-4 justify-center">
        <a
          href="/analyze"
          className="px-6 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl transition-colors"
        >
          再次分析
        </a>
        <a
          href="/history"
          className="px-6 py-3 bg-surface hover:bg-surface-hover text-white font-medium rounded-xl transition-colors"
        >
          查看歷史
        </a>
      </div>
    </div>
  );
}
