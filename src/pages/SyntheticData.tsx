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

function SyntheticData({ data: initialData }: SyntheticDataProps) {
  const [data, setData] = useState<DataPoint[]>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnSelection, setColumnSelection] = useState<ColumnSelection>({});
  const [csvText, setCsvText] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const heatmapRef = useRef<SVGSVGElement>(null);

  const syntheticData = useMemo(() => generateSyntheticData(data), [data]);
  const correlations = useMemo(
    () => calculateCorrelations(data, syntheticData),
    [data, syntheticData]
  );

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      const text = await file.text();
      setCsvText(text);

      // Extract headers
      const headers = text
        .split("\n")[0]
        .split(",")
        .map((h) => h.trim());
      setCsvHeaders(headers);
      setColumnSelection({});

      // Try to auto-detect columns
      headers.forEach((header) => {
        const lowerHeader = header.toLowerCase();
        if (lowerHeader.includes("date") || lowerHeader.includes("time")) {
          setColumnSelection((prev) => ({ ...prev, date: header }));
        } else if (
          lowerHeader.includes("value") ||
          lowerHeader.includes("amount")
        ) {
          setColumnSelection((prev) => ({ ...prev, value: header }));
        } else if (
          lowerHeader.includes("category") ||
          lowerHeader.includes("type")
        ) {
          setColumnSelection((prev) => ({ ...prev, category: header }));
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error reading CSV file");
    }
  };

  const handleColumnSelect = (type: keyof ColumnSelection, column: string) => {
    setColumnSelection((prev) => ({ ...prev, [type]: column }));
  };

  const handleGenerateData = () => {
    try {
      const parsedData = parseCSV(csvText, columnSelection);
      if (parsedData.length === 0) {
        throw new Error("No valid data found in CSV file");
      }
      setData(parsedData);

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error parsing CSV file");
    }
  };

  // Heatmap effect
  useEffect(() => {
    if (!heatmapRef.current) return;

    d3.select(heatmapRef.current).selectAll("*").remove();

    const margin = { top: 30, right: 30, bottom: 30, left: 100 };
    const width = 400 - margin.left - margin.right;
    const height = 200 - margin.top - margin.bottom;

    const svg = d3
      .select(heatmapRef.current)
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Create color scale
    const colorScale = d3
      .scaleSequential()
      .domain([0, 1])
      .interpolator(d3.interpolateViridis);

    // Create scales
    const xScale = d3.scaleBand().range([0, width]).domain(["Correlation"]);
    const yScale = d3
      .scaleBand()
      .range([height, 0])
      .domain(correlations.map((d) => d.label));

    // Add rectangles
    svg
      .selectAll("rect")
      .data(correlations)
      .enter()
      .append("rect")
      .attr("x", xScale("Correlation"))
      .attr("y", (d) => yScale(d.label) || 0)
      .attr("width", xScale.bandwidth())
      .attr("height", yScale.bandwidth())
      .attr("fill", (d) => colorScale(d.correlation))
      .attr("stroke", "white");

    // Add labels
    svg
      .selectAll(".correlation-text")
      .data(correlations)
      .enter()
      .append("text")
      .attr("class", "correlation-text")
      .attr("x", xScale("Correlation")! + xScale.bandwidth() / 2)
      .attr("y", (d) => (yScale(d.label) || 0) + yScale.bandwidth() / 2)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("fill", "white")
      .text((d) => d.correlation.toFixed(3));

    // Add y axis
    svg
      .append("g")
      .call(d3.axisLeft(yScale))
      .call((g) => g.select(".domain").remove());

    // Add title
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .text("Real vs Synthetic Data Correlation");
  }, [correlations]);

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
          <button
            onClick={() => setData(initialData)}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            Reset to Default Data
          </button>
        </div>

        {/* Column Selection */}
        {csvHeaders.length > 0 && (
          <div className="mt-4 p-4 border rounded bg-gray-50">
            <h3 className="font-semibold mb-3">Select Columns</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date Column
                </label>
                <select
                  value={columnSelection.date || ""}
                  onChange={(e) => handleColumnSelect("date", e.target.value)}
                  className="w-full border rounded p-2"
                >
                  <option value="">Auto-detect</option>
                  {csvHeaders.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Value Column
                </label>
                <select
                  value={columnSelection.value || ""}
                  onChange={(e) => handleColumnSelect("value", e.target.value)}
                  className="w-full border rounded p-2"
                >
                  <option value="">Auto-detect</option>
                  {csvHeaders.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category Column
                </label>
                <select
                  value={columnSelection.category || ""}
                  onChange={(e) =>
                    handleColumnSelect("category", e.target.value)
                  }
                  className="w-full border rounded p-2"
                >
                  <option value="">Auto-detect</option>
                  {csvHeaders.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={handleGenerateData}
              className="mt-4 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors"
            >
              Generate Synthetic Data
            </button>
          </div>
        )}

        {error && <div className="mt-2 text-red-500 text-sm">{error}</div>}
        <div className="mt-2 text-sm text-gray-600">
          Upload any CSV file - select columns or let the system auto-detect:
          <ul className="list-disc ml-5 mt-1">
            <li>Date/time columns for temporal data</li>
            <li>Numeric columns for values</li>
            <li>Text columns for categories</li>
            <li>Missing values will be automatically generated</li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border p-4 rounded">
          <h3 className="text-lg font-bold mb-2">Correlation Heatmap</h3>
          <svg ref={heatmapRef}></svg>
        </div>

        <div className="border p-4 rounded">
          <h3 className="text-lg font-bold mb-2">Statistics</h3>
          <div className="space-y-4">
            {["A", "B", "C"].map((category) => {
              const realStats = data.filter((d) => d.category === category);
              const synthStats = syntheticData.filter(
                (d) => d.category === category
              );

              return (
                <div key={category} className="space-y-2">
                  <h4 className="font-semibold">Category {category}</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="font-medium">Real Data:</p>
                      <p>
                        Mean: {d3.mean(realStats, (d) => d.value)?.toFixed(2)}
                      </p>
                      <p>
                        Std:{" "}
                        {d3.deviation(realStats, (d) => d.value)?.toFixed(2)}
                      </p>
                      <p>Count: {realStats.length}</p>
                    </div>
                    <div>
                      <p className="font-medium">Synthetic Data:</p>
                      <p>
                        Mean: {d3.mean(synthStats, (d) => d.value)?.toFixed(2)}
                      </p>
                      <p>
                        Std:{" "}
                        {d3.deviation(synthStats, (d) => d.value)?.toFixed(2)}
                      </p>
                      <p>Count: {synthStats.length}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SyntheticData;
