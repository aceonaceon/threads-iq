import { useEffect, useState } from 'react';

interface HealthScoreProps {
  score: number;
  assessment: string;
}

export default function HealthScore({ score, assessment }: HealthScoreProps) {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const duration = 1500;
    const steps = 60;
    const increment = score / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= score) {
        setAnimatedScore(score);
        clearInterval(timer);
      } else {
        setAnimatedScore(Math.round(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [score]);

  const getColor = () => {
    if (score >= 80) return '#22C55E'; // Green
    if (score >= 60) return '#84CC16'; // Lime
    if (score >= 40) return '#EAB308'; // Yellow
    if (score >= 20) return '#F97316'; // Orange
    return '#EF4444'; // Red
  };

  const getEmoji = () => {
    if (score >= 80) return '✅';
    if (score >= 60) return '🟢';
    if (score >= 40) return '⚠️';
    return '🔴';
  };

  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (animatedScore / 100) * circumference;

  return (
    <div className="flex flex-col items-center animate-fade-in">
      {/* Circular gauge */}
      <div className="relative w-48 h-48">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#262626"
            strokeWidth="8"
          />
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={getColor()}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        
        {/* Score in center */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-bold" style={{ color: getColor() }}>
            {animatedScore}
          </span>
          <span className="text-gray-500 text-sm">健康分數</span>
        </div>
      </div>

      {/* Assessment */}
      <div className="mt-4 flex items-center gap-2">
        <span className="text-2xl">{getEmoji()}</span>
        <span className="text-lg font-medium" style={{ color: getColor() }}>
          {assessment}
        </span>
      </div>

      {/* Score Interpretation Guide */}
      <div className="mt-6 text-left w-full max-w-md">
        <h4 className="text-sm font-semibold text-gray-400 mb-2">分數怎麼看？</h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-green-500 font-bold">80-100</span>
            <span className="text-gray-500">：頂尖表現，內容高度聚焦且多元</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-lime-500 font-bold">60-79</span>
            <span className="text-gray-500">：良好，內容有一定主題性</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-yellow-500 font-bold">40-59</span>
            <span className="text-gray-500">：普通，需增加內容聚焦度</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-orange-500 font-bold">20-39</span>
            <span className="text-gray-500">：分散，內容太過多元需整合</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-red-500 font-bold">0-19</span>
            <span className="text-gray-500">：混亂，主題過於發散，建議重新定位</span>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-white/10 text-xs text-gray-600">
          💡 提升方向：增加主題聚焦、善用圖片/影片格式、提高互動率
        </div>
      </div>
    </div>
  );
}
