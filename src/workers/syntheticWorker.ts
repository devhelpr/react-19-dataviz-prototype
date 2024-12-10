import { generateSyntheticData } from "../utils/cart";
import type { DataPoint } from "../types";

// Define message types
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
      let processed = 0;
      const totalColumns = Object.keys(columnDataPoints).length;

      for (const [colName, dataPoints] of Object.entries(columnDataPoints)) {
        // Generate synthetic data for this column
        result[colName] = generateSyntheticData(dataPoints, numRecords);

        // Report progress
        processed++;
        self.postMessage({
          type: "progress",
          progress: Math.round((processed / totalColumns) * 100),
        } as WorkerResponse);

        // Allow other operations to proceed
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
