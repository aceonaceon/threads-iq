import { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';

interface HeatmapChartProps {
  points2D: number[][];
  labels: number[];
}

export default function HeatmapChart({ points2D, labels }: HeatmapChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || points2D.length === 0) return;

    // Calculate density using a simple grid approach
    const x = points2D.map(p => p[0]);
    const y = points2D.map(p => p[1]);

    // Create bins for density calculation
    const xMin = Math.min(...x);
    const xMax = Math.max(...x);
    const yMin = Math.min(...y);
    const yMax = Math.max(...y);
    const bins = 20;

    const xStep = (xMax - xMin) / bins;
    const yStep = (yMax - yMin) / bins;

    // Calculate density
    const z: number[][] = Array(bins).fill(null).map(() => Array(bins).fill(0));

    for (let i = 0; i < points2D.length; i++) {
      const xi = Math.min(Math.floor((x[i] - xMin) / xStep), bins - 1);
      const yi = Math.min(Math.floor((y[i] - yMin) / yStep), bins - 1);
      if (xi >= 0 && yi >= 0) {
        z[yi][xi]++;
      }
    }

    // Normalize
    const maxZ = Math.max(...z.flat());
    if (maxZ > 0) {
      for (let i = 0; i < z.length; i++) {
        for (let j = 0; j < z[i].length; j++) {
          z[i][j] = z[i][j] / maxZ;
        }
      }
    }

    const layout: any = {
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: {
        color: '#A3A3A3',
        family: 'Inter, Noto Sans TC, sans-serif',
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

    const data: any[] = [{
      z,
      type: 'heatmap',
      colorscale: [
        [0, 'rgba(232, 93, 4, 0.1)'],
        [0.5, 'rgba(232, 93, 4, 0.4)'],
        [1, 'rgba(232, 93, 4, 0.8)'],
      ],
      showscale: false,
    }];

    Plotly.newPlot(containerRef.current, data, layout, config);

    return () => {
      if (containerRef.current) {
        Plotly.purge(containerRef.current);
      }
    };
  }, [points2D, labels]);

  return (
    <div className="w-full">
      <div ref={containerRef} className="w-full h-64 rounded-xl" />
    </div>
  );
}
