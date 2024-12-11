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
  const sortedValues = [...values].sort((a, b) => a - b);
  const q1 = sortedValues[Math.floor(values.length * 0.25)];
  const q3 = sortedValues[Math.floor(values.length * 0.75)];
  const iqr = q3 - q1;

  const stdDev = iqr / 1.349;

  return {
    meanValue: mean,
    stdValue: stdDev,
    minValue: Math.min(...values),
    maxValue: Math.max(...values),
    q1,
    q3,
    minDate: Math.min(...dates),
    maxDate: Math.max(...dates),
    categories,
    categoryFreq: categories.map((cat) => ({
      value: cat,
      freq: data.filter((d) => d.category === cat).length / data.length,
    })),
  };
}

function generateNormal(
  mean: number,
  std: number,
  min?: number,
  max?: number
): number {
  let value;
  do {
    let u = 0,
      v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    value = mean + z * std;
  } while (
    (min !== undefined && value < min) ||
    (max !== undefined && value > max)
  );
  return value;
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

          const batch = Array.from({ length: batchCount }, () => {
            const value = generateNormal(
              stats.meanValue,
              stats.stdValue,
              stats.minValue * 0.9,
              stats.maxValue * 1.1
            );

            const dateNoise = stats.stdValue * 86400000;
            const dateBase =
              stats.minDate + Math.random() * (stats.maxDate - stats.minDate);
            const date = new Date(dateBase + generateNormal(0, dateNoise));

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
              value: Math.max(0, value),
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
