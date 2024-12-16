/// <reference lib="webworker" />

import { generateSyntheticData as generateCartData } from "../utils/cart";
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
  if (e.data.type === "generate") {
    try {
      const { columnDataPoints, numRecords } = e.data;
      const result: { [key: string]: DataPoint[] } = {};
      const totalColumns = Object.keys(columnDataPoints).length;
      let totalProgress = 0;

      for (const [colName, dataPoints] of Object.entries(columnDataPoints)) {
        // Use CART to generate synthetic data
        const syntheticData = generateCartData(dataPoints, numRecords);
        result[colName] = syntheticData;

        // Update progress
        totalProgress++;
        self.postMessage({
          type: "progress",
          progress: Math.round((totalProgress / totalColumns) * 100),
        } as WorkerResponse);

        // Allow UI updates
        await new Promise((resolve) => setTimeout(resolve, 0));
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
