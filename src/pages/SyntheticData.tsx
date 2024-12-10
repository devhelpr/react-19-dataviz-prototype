import { useMemo, useRef, useEffect, useState } from "react";
import * as d3 from "d3";
import { DataPoint } from "../types";
import { parseCSV } from "../utils/csvParser";

interface SyntheticDataProps {
  data: DataPoint[];
}

interface CorrelationData {
  variable: string;
  type: "real" | "synthetic";
  values: number[];
}

interface TreeNode {
  feature?: "category" | "date";
  threshold?: Date | string;
  value?: {
    category: string;
    meanValue: number;
    stdValue: number;
    dateRange: [Date, Date];
  };
  left?: TreeNode;
  right?: TreeNode;
}

function buildDecisionTree(
  data: DataPoint[],
  depth = 0,
  maxDepth = 3
): TreeNode {
  if (depth === maxDepth || data.length < 10) {
    // Leaf node: Calculate statistics for this subset
    const categories = Array.from(new Set(data.map((d) => d.category)));
    const dates = data.map((d) => d.date);
    const values = data.map((d) => d.value);

    return {
      value: {
        category: categories[0], // Most common category
        meanValue: d3.mean(values) || 0,
        stdValue: d3.deviation(values) || 1,
        dateRange: [d3.min(dates) || new Date(), d3.max(dates) || new Date()],
      },
    };
  }

  // Calculate potential splits
  const dateVariance = calculateDateVariance(data);
  const categoryVariance = calculateCategoryVariance(data);

  // Choose best feature to split on
  if (dateVariance > categoryVariance) {
    // Split on date
    const dates = data.map((d) => d.date);
    const medianDate = new Date(d3.median(dates.map((d) => d.getTime())) || 0);

    const leftData = data.filter((d) => d.date < medianDate);
    const rightData = data.filter((d) => d.date >= medianDate);

    if (leftData.length === 0 || rightData.length === 0) {
      return buildDecisionTree(data, maxDepth, maxDepth); // Force leaf node
    }

    return {
      feature: "date",
      threshold: medianDate,
      left: buildDecisionTree(leftData, depth + 1, maxDepth),
      right: buildDecisionTree(rightData, depth + 1, maxDepth),
    };
  } else {
    // Split on category
    const categories = Array.from(new Set(data.map((d) => d.category)));
    const medianCategory = categories[Math.floor(categories.length / 2)];

    const leftData = data.filter((d) => d.category < medianCategory);
    const rightData = data.filter((d) => d.category >= medianCategory);

    if (leftData.length === 0 || rightData.length === 0) {
      return buildDecisionTree(data, maxDepth, maxDepth); // Force leaf node
    }

    return {
      feature: "category",
      threshold: medianCategory,
      left: buildDecisionTree(leftData, depth + 1, maxDepth),
      right: buildDecisionTree(rightData, depth + 1, maxDepth),
    };
  }
}

function calculateDateVariance(data: DataPoint[]): number {
  const dates = data.map((d) => d.date.getTime());
  const mean = d3.mean(dates) || 0;
  return d3.sum(dates.map((d) => Math.pow(d - mean, 2))) / dates.length;
}

function calculateCategoryVariance(data: DataPoint[]): number {
  const categories = Array.from(new Set(data.map((d) => d.category)));
  const categoryCounts = new Map<string, number>();

  categories.forEach((cat) => {
    categoryCounts.set(cat, data.filter((d) => d.category === cat).length);
  });

  const mean = data.length / categories.length;
  return (
    Array.from(categoryCounts.values()).reduce(
      (acc, count) => acc + Math.pow(count - mean, 2),
      0
    ) / categories.length
  );
}

function generateSyntheticDataFromTree(
  tree: TreeNode,
  targetSize: number
): DataPoint[] {
  const syntheticData: DataPoint[] = [];

  function traverse(node: TreeNode, remainingPoints: number): number {
    if (node.value) {
      // Leaf node: generate synthetic points
      const pointsToGenerate = Math.min(
        remainingPoints,
        Math.ceil(targetSize / 4)
      );

      for (let i = 0; i < pointsToGenerate; i++) {
        // Generate value using normal distribution
        const value = Math.max(
          0,
          d3.randomNormal(node.value.meanValue, node.value.stdValue)()
        );

        // Generate date within the node's date range
        const startTime = node.value.dateRange[0].getTime();
        const timeRange = node.value.dateRange[1].getTime() - startTime;
        const date = new Date(startTime + Math.random() * timeRange);

        syntheticData.push({
          category: node.value.category,
          value,
          date,
        });
      }
      return pointsToGenerate;
    }

    if (!node.left || !node.right) return 0;

    // Non-leaf node: recursively generate data
    const leftPoints = traverse(node.left, Math.floor(remainingPoints / 2));
    const rightPoints = traverse(node.right, remainingPoints - leftPoints);

    return leftPoints + rightPoints;
  }

  while (syntheticData.length < targetSize) {
    const remaining = targetSize - syntheticData.length;
    traverse(tree, remaining);
  }

  return syntheticData;
}

function generateSyntheticData(realData: DataPoint[]): DataPoint[] {
  // Build decision tree from real data
  const tree = buildDecisionTree(realData);

  // Generate synthetic data using the tree
  const syntheticData = generateSyntheticDataFromTree(tree, realData.length);

  // Sort by date to maintain temporal order
  return syntheticData.sort((a, b) => a.date.getTime() - b.date.getTime());
}

interface ColumnCorrelation {
  column: "date" | "value" | "category";
  label: string;
  correlation: number;
}

function calculateCorrelations(
  realData: DataPoint[],
  syntheticData: DataPoint[]
): ColumnCorrelation[] {
  const correlations: ColumnCorrelation[] = [];

  // Value correlation
  const realValues = realData.map((d) => d.value);
  const syntheticValues = syntheticData.map((d) => d.value);
  correlations.push({
    column: "value",
    label: "Values",
    correlation: calculatePearsonCorrelation(realValues, syntheticValues),
  });

  // Date correlation (using timestamps)
  const realDates = realData.map((d) => d.date.getTime());
  const syntheticDates = syntheticData.map((d) => d.date.getTime());
  correlations.push({
    column: "date",
    label: "Dates",
    correlation: calculatePearsonCorrelation(realDates, syntheticDates),
  });

  // Category correlation (using category distribution similarity)
  const categories = Array.from(
    new Set([...realData, ...syntheticData].map((d) => d.category))
  );
  const realDist = calculateCategoryDistribution(realData, categories);
  const syntheticDist = calculateCategoryDistribution(
    syntheticData,
    categories
  );
  correlations.push({
    column: "category",
    label: "Categories",
    correlation: calculatePearsonCorrelation(realDist, syntheticDist),
  });

  return correlations;
}

function calculatePearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n === 0) return 0;

  const meanX = d3.mean(x) || 0;
  const meanY = d3.mean(y) || 0;

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

  return numerator / Math.sqrt(denominatorX * denominatorY);
}

function calculateCategoryDistribution(
  data: DataPoint[],
  categories: string[]
): number[] {
  const total = data.length;
  return categories.map(
    (cat) => data.filter((d) => d.category === cat).length / total
  );
}

interface ColumnSelection {
  date?: string;
  value?: string;
  category?: string;
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

function detectColumnType(
  values: string[]
): "numeric" | "date" | "categorical" {
  // Try to detect if it's a numeric column
  const numericCount = values.filter((v) => !isNaN(parseFloat(v))).length;
  if (numericCount / values.length > 0.8) return "numeric";

  // Try to detect if it's a date column
  const dateCount = values.filter((v) => !isNaN(new Date(v).getTime())).length;
  if (dateCount / values.length > 0.8) return "date";

  // Default to categorical
  return "categorical";
}

function parseColumns(csvText: string): ColumnData[] {
  const lines = csvText.split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  const columns: ColumnData[] = headers.map((h) => ({
    name: h,
    type: "categorical",
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

  // Detect column types and convert values
  columns.forEach((column) => {
    const sampleValues = column.values.slice(0, 100);
    column.type = detectColumnType(sampleValues as string[]);

    // Convert values based on type
    column.values = column.values.map((value) => {
      if (column.type === "numeric") {
        return parseFloat(value as unknown as string) || 0;
      } else if (column.type === "date") {
        return new Date(value);
      }
      return value;
    });
  });

  return columns;
}

function generateSyntheticColumns(
  columns: ColumnData[],
  targetSize: number
): ColumnData[] {
  return columns.map((column) => {
    const syntheticValues = [];

    if (column.type === "numeric") {
      const values = column.values as number[];
      const mean = d3.mean(values) || 0;
      const std = d3.deviation(values) || 1;

      for (let i = 0; i < targetSize; i++) {
        syntheticValues.push(d3.randomNormal(mean, std)());
      }
    } else if (column.type === "date") {
      const dates = column.values as Date[];
      const minTime = Math.min(...dates.map((d) => d.getTime()));
      const maxTime = Math.max(...dates.map((d) => d.getTime()));

      for (let i = 0; i < targetSize; i++) {
        syntheticValues.push(
          new Date(minTime + Math.random() * (maxTime - minTime))
        );
      }
    } else {
      const categories = Array.from(new Set(column.values));
      const distribution = categories.map(
        (cat) =>
          column.values.filter((v) => v === cat).length / column.values.length
      );

      for (let i = 0; i < targetSize; i++) {
        const rand = Math.random();
        let cumSum = 0;
        for (let j = 0; j < categories.length; j++) {
          cumSum += distribution[j];
          if (rand <= cumSum) {
            syntheticValues.push(categories[j]);
            break;
          }
        }
      }
    }

    return {
      name: column.name,
      type: column.type,
      values: syntheticValues,
    };
  });
}

function calculateColumnCorrelation(
  original: ColumnData,
  synthetic: ColumnData
): number {
  if (original.type === "numeric") {
    return calculatePearsonCorrelation(
      original.values as number[],
      synthetic.values as number[]
    );
  } else if (original.type === "date") {
    const origTimes = (original.values as Date[]).map((d) => d.getTime());
    const synthTimes = (synthetic.values as Date[]).map((d) => d.getTime());
    return calculatePearsonCorrelation(origTimes, synthTimes);
  } else {
    const categories = Array.from(
      new Set([...original.values, ...synthetic.values])
    );
    const origDist = calculateCategoryDistribution(
      original.values as unknown as DataPoint[],
      categories as string[]
    );
    const synthDist = calculateCategoryDistribution(
      synthetic.values as unknown as DataPoint[],
      categories as string[]
    );
    return calculatePearsonCorrelation(origDist, synthDist);
  }
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const heatmapRef = useRef<SVGSVGElement>(null);

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

  const handleGenerateSynthetic = () => {
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
    setError(null);

    try {
      // Generate synthetic data with specified number of records
      const synthetic = generateSyntheticColumns(selectedCols, numRecords);
      setSyntheticColumns(synthetic);

      // Calculate correlations
      const newCorrelations = selectedCols.map((col, i) => ({
        column: col.name,
        correlation: calculateColumnCorrelation(col, synthetic[i]),
      }));
      setCorrelations(newCorrelations);

      // Calculate matrix correlations
      const matrixCorrelations: MatrixCorrelation[] = [];
      selectedCols.forEach((origCol) => {
        synthetic.forEach((synthCol) => {
          matrixCorrelations.push({
            originalColumn: `${origCol.name} (Original)`,
            syntheticColumn: `${synthCol.name} (Synthetic)`,
            correlation: calculateColumnCorrelation(origCol, synthCol),
          });
        });
      });
      setMatrixCorrelations(matrixCorrelations);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error generating synthetic data"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (!heatmapRef.current || matrixCorrelations.length === 0) return;

    // Get container width
    const containerWidth = heatmapRef.current.parentElement?.clientWidth || 800;

    // Calculate responsive dimensions
    const margin = { top: 50, right: 100, bottom: 80, left: 150 };
    const width = containerWidth - margin.left - margin.right;
    const cellSize = Math.min(40, (width / matrixCorrelations.length) * 2);
    const height = cellSize * (matrixCorrelations.length / 2); // Divide by 2 since we have original/synthetic pairs

    const svg = d3
      .select(heatmapRef.current)
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

    // Add cells
    svg
      .selectAll("rect")
      .data(matrixCorrelations)
      .enter()
      .append("rect")
      .attr("x", (d) => xScale(d.syntheticColumn)!)
      .attr("y", (d) => yScale(d.originalColumn)!)
      .attr("width", xScale.bandwidth())
      .attr("height", yScale.bandwidth())
      .attr("fill", (d) => colorScale(d.correlation))
      .attr("stroke", "white")
      .attr("stroke-width", 1);

    // Add correlation values
    svg
      .selectAll(".correlation-text")
      .data(matrixCorrelations)
      .enter()
      .append("text")
      .attr("class", "correlation-text")
      .attr("x", (d) => xScale(d.syntheticColumn)! + xScale.bandwidth() / 2)
      .attr("y", (d) => yScale(d.originalColumn)! + yScale.bandwidth() / 2)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("fill", (d) => (Math.abs(d.correlation) > 0.5 ? "white" : "black"))
      .style("font-size", "10px")
      .text((d) => d.correlation.toFixed(2));

    // Update x-axis text
    svg
      .append("g")
      .style("font-size", "10px")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(xScale))
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .attr("y", 10)
      .attr("x", -5)
      .style("text-anchor", "end");

    // Add y axis
    svg.append("g").style("font-size", "10px").call(d3.axisLeft(yScale));

    // Add title
    svg
      .append("text")
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
    const legend = svg
      .append("g")
      .attr("transform", `translate(${width + 20},0)`);

    // Create gradient for vertical legend
    const defs = svg.append("defs");
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
                className={`w-full py-2 px-4 rounded font-medium ${
                  isGenerating
                    ? "bg-gray-300 cursor-not-allowed"
                    : "bg-green-500 hover:bg-green-600 text-white"
                }`}
              >
                {isGenerating
                  ? "Generating..."
                  : `Generate ${numRecords} Records`}
              </button>
            </div>
          </div>

          {/* Correlation Heatmap */}
          {syntheticColumns.length > 0 && (
            <div className="border p-4 rounded overflow-x-auto">
              <h3 className="text-lg font-bold mb-2">Correlation Heatmap</h3>
              <div className="min-w-[500px]">
                <svg ref={heatmapRef}></svg>
              </div>
            </div>
          )}

          {/* Statistics */}
          {syntheticColumns.length > 0 && (
            <div className="border p-4 rounded md:col-span-2">
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
                            Mean: {d3.mean(col.values as number[])?.toFixed(2)}
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
          )}

          {/* Add the table after the statistics section */}
          {syntheticColumns.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-bold mb-3">Synthetic Data Preview</h3>
              <SyntheticDataTable data={syntheticColumns} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SyntheticData;
