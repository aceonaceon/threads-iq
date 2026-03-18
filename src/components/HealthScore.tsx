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
    </div>
  );
}
