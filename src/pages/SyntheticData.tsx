import { useRef, useEffect, useState } from "react";
import * as d3 from "d3";
import { DataPoint } from "../types";
import { ArrowPathIcon } from "@heroicons/react/24/solid";
import Worker from "../workers/syntheticWorker?worker";

interface SyntheticDataProps {
  data: DataPoint[];
}

interface ColumnData {
  name: string;
  type: "numeric" | "date" | "categorical";
  values: (number | Date | string)[];
}

interface CorrelationResult {
  column: string;
  correlation: number;
}

interface SelectedColumns {
  [key: string]: boolean;
}

interface MatrixCorrelation {
  originalColumn: string;
  syntheticColumn: string;
  correlation: number;
}

interface TableState {
  page: number;
  pageSize: number;
  sortColumn: string | null;
  sortDirection: "asc" | "desc";
}

const worker = new Worker();

console.log("Worker initialized:", worker);

worker.onerror = (error) => {
  console.error("Worker error:", error);
};

function parseColumns(csvText: string): ColumnData[] {
  const lines = csvText.split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  const columns: ColumnData[] = headers.map((h) => ({
    name: h,
    type: "categorical", // Default type, will be updated
    values: [],
  }));

  // Parse values for each column
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    if (values.length !== headers.length) continue;

    values.forEach((value, colIndex) => {
      columns[colIndex].values.push(value);
    });
  }

  // Detect column types
  columns.forEach((column) => {
    const sampleValues = column.values.slice(0, 100);

    // Try to detect if it's a numeric column
    const numericCount = sampleValues.filter(
      (v) => !isNaN(parseFloat(v as string))
    ).length;
    if (numericCount / sampleValues.length > 0.8) {
      column.type = "numeric";
      column.values = column.values.map((v) => parseFloat(v as string) || 0);
      return;
    }

    // Try to detect if it's a date column
    const dateCount = sampleValues.filter(
      (v) => !isNaN(new Date(v as string).getTime())
    ).length;
    if (dateCount / sampleValues.length > 0.8) {
      column.type = "date";
      column.values = column.values.map((v) => new Date(v as string));
      return;
    }

    // Keep as categorical if not numeric or date
    column.type = "categorical";
  });

  return columns;
}

function SyntheticDataTable({ data }: { data: ColumnData[] }) {
  const [tableState, setTableState] = useState<TableState>({
    page: 1,
    pageSize: 10,
    sortColumn: null,
    sortDirection: "asc",
  });

  // Calculate total rows based on the length of any column's values
  const totalRows = data[0]?.values.length || 0;
  const totalPages = Math.ceil(totalRows / tableState.pageSize);

  // Get the current page's data
  const getCurrentPageData = () => {
    const start = (tableState.page - 1) * tableState.pageSize;
    const end = start + tableState.pageSize;

    // Create array of row indices
    const rowIndices = Array.from({ length: totalRows }, (_, i) => i);

    // Sort if needed
    if (tableState.sortColumn) {
      const columnIndex = data.findIndex(
        (col) => col.name === tableState.sortColumn
      );
      if (columnIndex !== -1) {
        rowIndices.sort((a, b) => {
          const aVal = data[columnIndex].values[a];
          const bVal = data[columnIndex].values[b];
          const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          return tableState.sortDirection === "asc" ? comparison : -comparison;
        });
      }
    }

    // Get the slice for current page
    return rowIndices.slice(start, end);
  };

  const handleSort = (columnName: string) => {
    setTableState((prev) => ({
      ...prev,
      sortColumn: columnName,
      sortDirection:
        prev.sortColumn === columnName && prev.sortDirection === "asc"
          ? "desc"
          : "asc",
    }));
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {data.map((column) => (
                <th
                  key={column.name}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort(column.name)}
                >
                  <div className="flex items-center space-x-1">
                    <span>{column.name}</span>
                    {tableState.sortColumn === column.name && (
                      <span>
                        {tableState.sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {getCurrentPageData().map((rowIndex) => (
              <tr key={rowIndex} className="hover:bg-gray-50">
                {data.map((column) => (
                  <td key={column.name} className="px-6 py-4 whitespace-nowrap">
                    {column.type === "date"
                      ? (column.values[rowIndex] as Date).toLocaleDateString()
                      : column.type === "numeric"
                      ? (column.values[rowIndex] as number).toFixed(2)
                      : String(column.values[rowIndex])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="bg-white px-4 py-3 flex items-center justify-between border-t">
        <div className="flex-1 flex justify-between items-center">
          <div className="text-sm text-gray-700">
            Showing {(tableState.page - 1) * tableState.pageSize + 1} to{" "}
            {Math.min(tableState.page * tableState.pageSize, totalRows)} of{" "}
            {totalRows} results
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() =>
                setTableState((prev) => ({ ...prev, page: prev.page - 1 }))
              }
              disabled={tableState.page === 1}
              className={`px-3 py-1 rounded ${
                tableState.page === 1
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-white text-gray-700 hover:bg-gray-50 border"
              }`}
            >
              Previous
            </button>
            <button
              onClick={() =>
                setTableState((prev) => ({ ...prev, page: prev.page + 1 }))
              }
              disabled={tableState.page === totalPages}
              className={`px-3 py-1 rounded ${
                tableState.page === totalPages
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-white text-gray-700 hover:bg-gray-50 border"
              }`}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function calculateColumnCorrelation(
  original: ColumnData,
  synthetic: ColumnData
): number {
  if (original.type !== synthetic.type) return 0;

  switch (original.type) {
    case "numeric": {
      const origValues = original.values as number[];
      const synthValues = synthetic.values as number[];

      // Handle edge cases
      if (origValues.length === 0 || synthValues.length === 0) return 0;

      const origRange = Math.max(...origValues) - Math.min(...origValues);
      const synthRange = Math.max(...synthValues) - Math.min(...synthValues);

      // If either dataset has no variation, correlation is undefined
      if (origRange === 0 || synthRange === 0) return 1;

      // Normalize values
      const origMin = Math.min(...origValues);
      const synthMin = Math.min(...synthValues);

      const normalizedOrig = origValues.map((v) => (v - origMin) / origRange);
      const normalizedSynth = synthValues.map(
        (v) => (v - synthMin) / synthRange
      );

      const correlation = calculatePearsonCorrelation(
        normalizedOrig,
        normalizedSynth
      );

      // Handle NaN case (can happen with constant values)
      return isNaN(correlation) ? 1 : correlation;
    }
    case "date": {
      const origTimestamps = (original.values as Date[]).map((d) =>
        d.getTime()
      );
      const synthTimestamps = (synthetic.values as Date[]).map((d) =>
        d.getTime()
      );

      // Normalize timestamps
      const minTime = Math.min(...origTimestamps, ...synthTimestamps);
      const maxTime = Math.max(...origTimestamps, ...synthTimestamps);
      const range = maxTime - minTime;

      const normalizedOrig = origTimestamps.map((t) => (t - minTime) / range);
      const normalizedSynth = synthTimestamps.map((t) => (t - minTime) / range);

      return calculatePearsonCorrelation(normalizedOrig, normalizedSynth);
    }
    case "categorical": {
      const allCategories = Array.from(
        new Set([...original.values, ...synthetic.values] as string[])
      ).sort();

      // Create frequency vectors
      const origFreq = new Array(allCategories.length).fill(0);
      const synthFreq = new Array(allCategories.length).fill(0);

      (original.values as string[]).forEach((val) => {
        const idx = allCategories.indexOf(val);
        origFreq[idx]++;
      });

      (synthetic.values as string[]).forEach((val) => {
        const idx = allCategories.indexOf(val);
        synthFreq[idx]++;
      });

      // Normalize frequencies
      const origTotal = origFreq.reduce((a, b) => a + b, 0);
      const synthTotal = synthFreq.reduce((a, b) => a + b, 0);

      const origNorm = origFreq.map((v) => v / origTotal);
      const synthNorm = synthFreq.map((v) => v / synthTotal);

      return calculatePearsonCorrelation(origNorm, synthNorm);
    }
    default:
      return 0;
  }
}

function calculatePearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n === 0) return 0;

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;

  for (let i = 0; i < n; i++) {
    const diffX = x[i] - meanX;
    const diffY = y[i] - meanY;
    numerator += diffX * diffY;
    denominatorX += diffX * diffX;
    denominatorY += diffY * diffY;
  }

  // Handle edge cases that could result in NaN
  if (denominatorX === 0 && denominatorY === 0) return 1; // Perfect correlation for identical constant values
  if (denominatorX === 0 || denominatorY === 0) return 0; // No correlation if one set is constant

  const correlation = numerator / Math.sqrt(denominatorX * denominatorY);
  return Math.max(-1, Math.min(1, correlation));
}

function SyntheticData({ data: initialData }: SyntheticDataProps) {
  const [uploadedColumns, setUploadedColumns] = useState<ColumnData[]>([]);
  const [syntheticColumns, setSyntheticColumns] = useState<ColumnData[]>([]);
  const [correlations, setCorrelations] = useState<CorrelationResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<SelectedColumns>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [matrixCorrelations, setMatrixCorrelations] = useState<
    MatrixCorrelation[]
  >([]);
  const [numRecords, setNumRecords] = useState<number>(1000);
  const [progress, setProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const heatmapRef = useRef<SVGSVGElement>(null);

  // Add worker cleanup
  useEffect(() => {
    return () => {
      //worker.terminate();
    };
  }, []);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      const text = await file.text();
      const columns = parseColumns(text);
      setUploadedColumns(columns);

      // Initialize all columns as unselected
      const initialSelection = columns.reduce((acc, col) => {
        acc[col.name] = false;
        return acc;
      }, {} as SelectedColumns);
      setSelectedColumns(initialSelection);

      // Clear previous results
      setSyntheticColumns([]);
      setCorrelations([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error processing file");
    }
  };

  const handleColumnToggle = (columnName: string) => {
    setSelectedColumns((prev) => ({
      ...prev,
      [columnName]: !prev[columnName],
    }));
  };

  const handleGenerateSynthetic = async () => {
    if (uploadedColumns.length === 0) {
      setError("Please upload a CSV file first");
      return;
    }

    const selectedCols = uploadedColumns.filter(
      (col) => selectedColumns[col.name]
    );
    if (selectedCols.length === 0) {
      setError("Please select at least one column");
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setError(null);

    try {
      // Add debug logging
      console.log("Starting synthetic data generation");

      const columnDataPoints: { [key: string]: DataPoint[] } = {};

      for (const col of selectedCols) {
        columnDataPoints[col.name] = Array.from(
          { length: col.values.length },
          (_, i) => {
            if (col.type === "date") {
              return {
                date: col.values[i] as Date,
                value: i,
                category: "A",
              };
            } else if (col.type === "numeric") {
              return {
                date: new Date(Date.now() + i * 86400000),
                value: col.values[i] as number,
                category: "A",
              };
            } else {
              return {
                date: new Date(Date.now() + i * 86400000),
                value: i,
                category: col.values[i] as string,
              };
            }
          }
        );
      }

      // Set up worker message handling with debug
      const workerPromise = new Promise<{ [key: string]: DataPoint[] }>(
        (resolve, reject) => {
          const messageHandler = (e: MessageEvent) => {
            console.log("Worker message received:", e.data);
            if (e.data.type === "progress") {
              setProgress(e.data.progress);
            } else if (e.data.type === "complete") {
              worker.removeEventListener("message", messageHandler);
              resolve(e.data.data);
            } else if (e.data.type === "error") {
              worker.removeEventListener("message", messageHandler);
              reject(new Error(e.data.error));
            }
          };

          worker.addEventListener("message", messageHandler);

          // Add error handler
          worker.addEventListener("error", (error) => {
            console.error("Worker error:", error);
            reject(error);
          });
        }
      );

      // Log the message being sent to worker
      console.log("Sending message to worker:", {
        type: "generate",
        columnDataPoints,
        numRecords,
      });

      // Start the worker
      worker.postMessage({
        type: "generate",
        columnDataPoints,
        numRecords,
      });

      // Wait for worker to complete
      const syntheticDataPoints = await workerPromise;
      console.log("Worker completed:", syntheticDataPoints);

      // Convert back to ColumnData format
      const synthetic: ColumnData[] = selectedCols.map((col) => ({
        name: col.name,
        type: col.type,
        values: syntheticDataPoints[col.name].map((dp) => {
          if (col.type === "date") return dp.date;
          if (col.type === "numeric") return dp.value;
          return dp.category;
        }),
      }));

      setSyntheticColumns(synthetic);

      // Calculate correlations
      const newCorrelations = selectedCols.map((col, i) => ({
        column: col.name,
        correlation: calculateColumnCorrelation(col, synthetic[i]),
      }));
      setCorrelations(newCorrelations);

      // Calculate matrix correlations
      const matrixCorrelations: MatrixCorrelation[] = [];
      const allColumns = [...selectedCols, ...synthetic];

      for (let i = 0; i < allColumns.length; i++) {
        for (let j = 0; j < allColumns.length; j++) {
          const col1 = allColumns[i];
          const col2 = allColumns[j];
          const correlation = calculateColumnCorrelation(col1, col2);

          matrixCorrelations.push({
            originalColumn: col1.name,
            syntheticColumn: col2.name,
            correlation: correlation,
          });
        }
      }
      setMatrixCorrelations(matrixCorrelations);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error generating synthetic data"
      );
    } finally {
      setIsGenerating(false);
      setProgress(0);
    }
  };

  useEffect(() => {
    if (!heatmapRef.current || matrixCorrelations.length === 0) return;

    // Clear the entire SVG content first
    const svg = d3.select(heatmapRef.current);
    svg.selectAll("*").remove();

    // Get container width
    const containerWidth = heatmapRef.current.parentElement?.clientWidth || 800;

    // Calculate responsive dimensions
    const margin = { top: 50, right: 100, bottom: 80, left: 150 };
    const width = containerWidth - margin.left - margin.right;
    const cellSize = Math.min(40, (width / matrixCorrelations.length) * 2);
    const height = cellSize * (matrixCorrelations.length / 2);

    // Create new SVG group
    const g = svg
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Create color scale
    const colorScale = d3
      .scaleSequential()
      .domain([-1, 1])
      .interpolator(d3.interpolateRdYlBu);

    // Get unique column names
    const originalColumns = Array.from(
      new Set(matrixCorrelations.map((d) => d.originalColumn))
    );
    const syntheticColumns = Array.from(
      new Set(matrixCorrelations.map((d) => d.syntheticColumn))
    );

    // Create scales
    const xScale = d3
      .scaleBand()
      .range([0, width])
      .domain(syntheticColumns)
      .padding(0.05);

    const yScale = d3
      .scaleBand()
      .range([0, height])
      .domain(originalColumns)
      .padding(0.05);

    // Create cell groups
    const cellGroups = g
      .selectAll(".cell")
      .data(matrixCorrelations)
      .join("g")
      .attr("class", "cell")
      .attr(
        "transform",
        (d) =>
          `translate(${xScale(d.syntheticColumn)},${yScale(d.originalColumn)})`
      );

    // Add rectangles to cells
    cellGroups
      .append("rect")
      .attr("width", xScale.bandwidth())
      .attr("height", yScale.bandwidth())
      .attr("fill", (d) => colorScale(d.correlation))
      .attr("stroke", "white")
      .attr("stroke-width", 1);

    // Add text to cells
    cellGroups
      .append("text")
      .attr("x", xScale.bandwidth() / 2)
      .attr("y", yScale.bandwidth() / 2)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("fill", (d) => {
        const color = d3.color(colorScale(d.correlation));
        if (!color) return "black";
        // Calculate perceived brightness (using relative luminance formula)
        const luminance =
          (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255;
        return luminance < 0.5 ? "white" : "black";
      })
      .style("font-size", "10px")
      .text((d) => d.correlation.toFixed(2));

    // Update x-axis text
    g.append("g")
      .style("font-size", "10px")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(xScale))
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .attr("y", 10)
      .attr("x", -5)
      .style("text-anchor", "end");

    // Add y axis
    g.append("g").style("font-size", "10px").call(d3.axisLeft(yScale));

    // Add title
    g.append("text")
      .attr("x", width / 2)
      .attr("y", -20)
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .text("Correlation Matrix: Original vs Synthetic Data");

    // Update legend dimensions
    const legendWidth = 20;
    const legendHeight = height;

    const legendScale = d3
      .scaleLinear()
      .domain([-1, 1])
      .range([legendHeight, 0]);

    const legendAxis = d3.axisRight(legendScale).tickSize(legendWidth).ticks(5);

    // Update legend position
    const legend = g
      .append("g")
      .attr("transform", `translate(${width + 20},0)`);

    // Create gradient for vertical legend
    const defs = g.append("defs");
    const gradient = defs
      .append("linearGradient")
      .attr("id", "correlation-gradient")
      .attr("x1", "0%")
      .attr("x2", "0%")
      .attr("y1", "100%")
      .attr("y2", "0%");

    gradient
      .selectAll("stop")
      .data(d3.range(-1, 1.1, 0.1))
      .enter()
      .append("stop")
      .attr("offset", (d) => ((d + 1) / 2) * 100 + "%")
      .attr("stop-color", (d) => colorScale(d));

    // Add vertical gradient rect
    legend
      .append("rect")
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .style("fill", "url(#correlation-gradient)");

    // Add legend axis
    legend
      .append("g")
      .attr("transform", `translate(${legendWidth},0)`)
      .call(legendAxis)
      .select(".domain")
      .remove();

    // Add legend title
    legend
      .append("text")
      .attr("transform", "rotate(90)")
      .attr("x", legendHeight / 2)
      .attr("y", -legendWidth - 45)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .text("Correlation");
  }, [matrixCorrelations]);

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Synthetic Data Analysis</h2>

      {/* Upload Section */}
      <div className="mb-6">
        <div className="flex items-center gap-4">
          <label className="relative cursor-pointer">
            <span className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors">
              Upload CSV
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
        {error && <div className="mt-2 text-red-500 text-sm">{error}</div>}
      </div>

      {/* Column Selection and Results */}
      {uploadedColumns.length > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Column Selection */}
            <div className="border p-4 rounded">
              <h3 className="text-lg font-bold mb-3">
                Select Columns for Synthesis
              </h3>
              <div className="space-y-2">
                {uploadedColumns.map((col) => (
                  <div
                    key={col.name}
                    className="flex items-center justify-between"
                  >
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={selectedColumns[col.name] || false}
                        onChange={() => handleColumnToggle(col.name)}
                        className="rounded text-blue-500"
                      />
                      <span>{col.name}</span>
                    </label>
                    <span className="text-sm text-gray-600 px-2 py-1 bg-gray-100 rounded">
                      {col.type}
                    </span>
                  </div>
                ))}
              </div>

              {/* Add Record Count Slider */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Synthetic Records: {numRecords}
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="10"
                    max="5000"
                    step="10"
                    value={numRecords}
                    onChange={(e) => setNumRecords(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <input
                    type="number"
                    min="10"
                    max="5000"
                    step="10"
                    value={numRecords}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      if (value >= 10 && value <= 5000) {
                        setNumRecords(value);
                      }
                    }}
                    className="w-24 px-2 py-1 border rounded"
                  />
                </div>
              </div>

              <div className="mt-4">
                <button
                  onClick={handleGenerateSynthetic}
                  disabled={isGenerating}
                  className={`w-full py-2 px-4 rounded font-medium flex items-center justify-center gap-2 ${
                    isGenerating
                      ? "bg-gray-300 cursor-not-allowed"
                      : "bg-green-500 hover:bg-green-600 text-white"
                  }`}
                >
                  {isGenerating && (
                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                  )}
                  <span>
                    {isGenerating
                      ? `Generating... ${progress}%`
                      : `Generate ${numRecords} Records`}
                  </span>
                </button>
              </div>
            </div>

            {/* Correlation Heatmap */}
            {syntheticColumns.length > 0 && (
              <div className="border p-4 rounded">
                <h3 className="text-lg font-bold mb-2">Correlation Heatmap</h3>
                <div className="overflow-x-auto">
                  <svg ref={heatmapRef}></svg>
                </div>
              </div>
            )}
          </div>

          {/* Statistics and Table in full width */}
          {syntheticColumns.length > 0 && (
            <>
              <div className="border p-4 rounded">
                <h3 className="text-lg font-bold mb-3">Column Statistics</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {syntheticColumns.map((col) => (
                    <div key={col.name} className="p-3 bg-gray-50 rounded">
                      <h4 className="font-semibold">{col.name}</h4>
                      <div className="text-sm space-y-1 mt-2">
                        <p>Type: {col.type}</p>
                        {col.type === "numeric" && (
                          <>
                            <p>
                              Mean:{" "}
                              {d3.mean(col.values as number[])?.toFixed(2)}
                            </p>
                            <p>
                              Std:{" "}
                              {d3.deviation(col.values as number[])?.toFixed(2)}
                            </p>
                          </>
                        )}
                        {col.type === "categorical" && (
                          <p>Categories: {new Set(col.values).size}</p>
                        )}
                        <p>Sample Size: {col.values.length}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border p-4 rounded">
                <h3 className="text-lg font-bold mb-3">
                  Synthetic Data Preview
                </h3>
                <SyntheticDataTable data={syntheticColumns} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default SyntheticData;
