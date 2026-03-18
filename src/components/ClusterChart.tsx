import { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';

interface ClusterChartProps {
  points2D: number[][];
  labels: number[];
  posts: string[];
  clusterTopics?: string[];
}

// Cluster colors palette
const CLUSTER_COLORS = [
  '#E85D04', // Orange (accent)
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#F59E0B', // Amber
  '#06B6D4', // Cyan
  '#EF4444', // Red
  '#6366F1', // Indigo
  '#84CC16', // Lime
];

export default function ClusterChart({ points2D, labels, posts, clusterTopics = [] }: ClusterChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || points2D.length === 0) return;

    const uniqueLabels = [...new Set(labels)];
    const traces: any[] = [];

    uniqueLabels.forEach((label, idx) => {
      const indices = labels.map((l, i) => l === label ? i : -1).filter(i => i >= 0);
      const x = indices.map(i => points2D[i][0]);
      const y = indices.map(i => points2D[i][1]);
      const text = indices.map(i => posts[i].slice(0, 100) + (posts[i].length > 100 ? '...' : ''));

      traces.push({
        x,
        y,
        mode: 'markers',
        type: 'scatter',
        name: label === -1 ? '離群點' : (clusterTopics[label] || `主題 ${label + 1}`),
        text,
        marker: {
          size: 12,
          color: label === -1 ? '#666666' : CLUSTER_COLORS[idx % CLUSTER_COLORS.length],
          opacity: 0.85,
          line: {
            color: label === -1 ? '#444444' : CLUSTER_COLORS[idx % CLUSTER_COLORS.length],
            width: 1,
          },
        },
        hovertemplate: '%{text}<extra></extra>',
      });
    });

    const layout: any = {
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: {
        color: '#A3A3A3',
        family: 'Inter, Noto Sans TC, sans-serif',
      },
      showlegend: true,
      legend: {
        x: 1,
        y: 1,
        bgcolor: 'rgba(0,0,0,0.5)',
        bordercolor: '#333',
        borderwidth: 1,
      },
      margin: { l: 20, r: 20, t: 20, b: 20 },
      xaxis: {
        showgrid: false,
        zeroline: false,
        showticklabels: false,
        title: '',
      },
      yaxis: {
        showgrid: false,
        zeroline: false,
        showticklabels: false,
        title: '',
      },
    };

    const config: any = {
      responsive: true,
      displayModeBar: false,
    };

    Plotly.newPlot(containerRef.current, traces, layout, config);

    return () => {
      if (containerRef.current) {
        Plotly.purge(containerRef.current);
      }
    };
  }, [points2D, labels, posts, clusterTopics]);

  return (
    <div className="w-full">
      <div ref={containerRef} className="w-full h-80 rounded-xl" />
    </div>
  );
}
