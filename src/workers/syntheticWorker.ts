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

  return {
    meanValue: values.reduce((a, b) => a + b, 0) / values.length,
    stdValue: Math.sqrt(
      values.reduce(
        (a, b) =>
          a + (b - values.reduce((a, b) => a + b, 0) / values.length) ** 2,
        0
      ) / values.length
    ),
    minDate: Math.min(...dates),
    maxDate: Math.max(...dates),
    categories,
  };
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
            const value =
              stats.meanValue +
              stats.stdValue *
                (Math.random() + Math.random() + Math.random() - 1.5); // Approximate normal distribution
            const date = new Date(
              stats.minDate + Math.random() * (stats.maxDate - stats.minDate)
            );
            const category =
              stats.categories[
                Math.floor(Math.random() * stats.categories.length)
              ];

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
