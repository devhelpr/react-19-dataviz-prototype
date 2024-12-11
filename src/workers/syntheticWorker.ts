/// <reference lib="webworker" />

import type { DataPoint } from "../types";

declare const self: DedicatedWorkerGlobalScope;

interface WorkerMessage {
  type: "generate";
  columnDataPoints: { [key: string]: DataPoint[] };
  numRecords: number;
}

interface WorkerResponse {
  type: "progress" | "complete" | "error";
  data?: { [key: string]: DataPoint[] };
  progress?: number;
  error?: string;
}

function calculateStats(data: DataPoint[]) {
  const values = data.map((d) => d.value);
  const dates = data.map((d) => d.date.getTime());
  const categories = Array.from(new Set(data.map((d) => d.category)));

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;

  return {
    meanValue: mean,
    stdValue: Math.sqrt(variance),
    minDate: Math.min(...dates),
    maxDate: Math.max(...dates),
    categories,
    // Store category frequencies
    categoryFreq: categories.map((cat) => ({
      value: cat,
      freq: data.filter((d) => d.category === cat).length / data.length,
    })),
  };
}

// Add Box-Muller transform for better normal distribution
function generateNormal(mean: number, std: number): number {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + z * std;
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type === "generate") {
    try {
      const { columnDataPoints, numRecords } = e.data;
      const result: { [key: string]: DataPoint[] } = {};
      const totalColumns = Object.keys(columnDataPoints).length;
      let totalProgress = 0;

      for (const [colName, dataPoints] of Object.entries(columnDataPoints)) {
        const stats = calculateStats(dataPoints);
        const syntheticData: DataPoint[] = [];
        const batchSize = 1000;

        for (let i = 0; i < numRecords; i += batchSize) {
          const batchCount = Math.min(batchSize, numRecords - i);

          // Generate synthetic data based on original distribution
          const batch = Array.from({ length: batchCount }, () => {
            // Generate value using Box-Muller transform
            const value = generateNormal(stats.meanValue, stats.stdValue);

            // Generate date with slight clustering around original dates
            const dateNoise = stats.stdValue * 86400000; // Convert to milliseconds
            const dateBase =
              stats.minDate + Math.random() * (stats.maxDate - stats.minDate);
            const date = new Date(dateBase + generateNormal(0, dateNoise));

            // Use category frequencies for more realistic category distribution
            const rand = Math.random();
            let cumProb = 0;
            let category = stats.categories[0];
            for (const cat of stats.categoryFreq) {
              cumProb += cat.freq;
              if (rand <= cumProb) {
                category = cat.value;
                break;
              }
            }

            return {
              date,
              value: Math.max(0, value), // Ensure non-negative values
              category,
            };
          });

          syntheticData.push(...batch);

          const columnProgress = (i + batchCount) / numRecords;
          const overallProgress =
            (totalProgress + columnProgress) / totalColumns;

          self.postMessage({
            type: "progress",
            progress: Math.round(overallProgress * 100),
          } as WorkerResponse);

          await new Promise((resolve) => setTimeout(resolve, 0));
        }

        result[colName] = syntheticData;
        totalProgress++;
      }

      self.postMessage({
        type: "complete",
        data: result,
      } as WorkerResponse);
    } catch (error) {
      self.postMessage({
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      } as WorkerResponse);
    }
  }
};
