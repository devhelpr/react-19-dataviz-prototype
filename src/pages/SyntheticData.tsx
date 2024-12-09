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
    column.type = detectColumnType(sampleValues);

    // Convert values based on type
    column.values = column.values.map((value) => {
      if (column.type === "numeric") {
        return parseFloat(value) || 0;
      } else if (column.type === "date") {
        return new Date(value);
      }
      return value;
    });
  });

  return columns;
}

function generateSyntheticColumns(columns: ColumnData[]): ColumnData[] {
  return columns.map((column) => {
    const syntheticValues = [];
    const length = column.values.length;

    if (column.type === "numeric") {
      const values = column.values as number[];
      const mean = d3.mean(values) || 0;
      const std = d3.deviation(values) || 1;

      for (let i = 0; i < length; i++) {
        syntheticValues.push(d3.randomNormal(mean, std)());
      }
    } else if (column.type === "date") {
      const dates = column.values as Date[];
      const minTime = Math.min(...dates.map((d) => d.getTime()));
      const maxTime = Math.max(...dates.map((d) => d.getTime()));

      for (let i = 0; i < length; i++) {
        syntheticValues.push(
          new Date(minTime + Math.random() * (maxTime - minTime))
        );
      }
    } else {
      const categories = Array.from(new Set(column.values));
      const distribution = categories.map(
        (cat) => column.values.filter((v) => v === cat).length / length
      );

      for (let i = 0; i < length; i++) {
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
      original.values as string[],
      categories
    );
    const synthDist = calculateCategoryDistribution(
      synthetic.values as string[],
      categories
    );
    return calculatePearsonCorrelation(origDist, synthDist);
  }
}

interface SelectedColumns {
  [key: string]: boolean;
}

function SyntheticData({ data: initialData }: SyntheticDataProps) {
  const [uploadedColumns, setUploadedColumns] = useState<ColumnData[]>([]);
  const [syntheticColumns, setSyntheticColumns] = useState<ColumnData[]>([]);
  const [correlations, setCorrelations] = useState<CorrelationResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<SelectedColumns>({});

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

      // Initialize all columns as selected
      const initialSelection = columns.reduce((acc, col) => {
        acc[col.name] = true;
        return acc;
      }, {} as SelectedColumns);
      setSelectedColumns(initialSelection);

      // Generate initial synthetic data for all columns
      generateSyntheticData(columns);
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

  const generateSyntheticData = (columns: ColumnData[]) => {
    // Filter selected columns
    const selectedCols = columns.filter((col) => selectedColumns[col.name]);

    // Generate synthetic data
    const synthetic = generateSyntheticColumns(selectedCols);
    setSyntheticColumns(synthetic);

    // Calculate correlations
    const newCorrelations = selectedCols.map((col, i) => ({
      column: col.name,
      correlation: calculateColumnCorrelation(col, synthetic[i]),
    }));
    setCorrelations(newCorrelations);
  };

  // Update synthetic data when column selection changes
  useEffect(() => {
    if (uploadedColumns.length > 0) {
      generateSyntheticData(uploadedColumns);
    }
  }, [selectedColumns, uploadedColumns]);

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
          </div>

          {/* Correlation Heatmap */}
          <div className="border p-4 rounded">
            <h3 className="text-lg font-bold mb-2">Correlation Heatmap</h3>
            <svg ref={heatmapRef}></svg>
          </div>

          {/* Statistics */}
          <div className="border p-4 rounded md:col-span-2">
            <h3 className="text-lg font-bold mb-3">Column Statistics</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {uploadedColumns
                .filter((col) => selectedColumns[col.name])
                .map((col) => (
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
        </div>
      )}
    </div>
  );
}

export default SyntheticData;
