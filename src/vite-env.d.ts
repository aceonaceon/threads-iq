/// <reference types="vite/client" />

declare module 'plotly.js-dist-min' {
  const Plotly: {
    newPlot: (element: HTMLElement, data: any[], layout?: any, config?: any) => void;
    purge: (element: HTMLElement) => void;
    react: (element: HTMLElement, data: any[], layout?: any, config?: any) => void;
  };
  export default Plotly;
  export const Data: any;
  export const Layout: any;
  export const Config: any;
}

declare module 'density-clustering' {
  export class DBSCAN {
    run(points: number[][], epsilon: number, minPts: number): number[][];
  }
}

declare module 'umap-js' {
  export default class UMAP {
    constructor(options?: {
      nComponents?: number;
      nNeighbors?: number;
      minDist?: number;
      spread?: number;
    });
    fit(data: number[][]): number[][];
  }
}
