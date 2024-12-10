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

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  console.log("Worker received:", e.data);

  if (e.data.type === "generate") {
    try {
      const { columnDataPoints, numRecords } = e.data;
      const result: { [key: string]: DataPoint[] } = {};
      const totalColumns = Object.keys(columnDataPoints).length;
      let totalProgress = 0;

      for (const [colName, dataPoints] of Object.entries(columnDataPoints)) {
        const syntheticData: DataPoint[] = [];
        const batchSize = 1000;

        for (let i = 0; i < numRecords; i += batchSize) {
          const batchCount = Math.min(batchSize, numRecords - i);

          // Generate synthetic data for this batch
          const batch = Array.from({ length: batchCount }, () => ({
            date: new Date(
              Date.now() + Math.random() * 365 * 24 * 60 * 60 * 1000
            ),
            value: Math.random() * 100,
            category: String.fromCharCode(65 + Math.floor(Math.random() * 26)),
          }));

          syntheticData.push(...batch);

          // Update progress
          const columnProgress = (i + batchCount) / numRecords;
          const overallProgress =
            (totalProgress + columnProgress) / totalColumns;

          self.postMessage({
            type: "progress",
            progress: Math.round(overallProgress * 100),
          } as WorkerResponse);

          // Allow UI updates
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
