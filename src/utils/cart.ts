import * as d3 from "d3";
import { DataPoint } from "../types";

interface TreeNode {
  feature?: "category" | "date" | "value";
  threshold?: Date | string | number;
  value?: {
    category: string;
    meanValue: number;
    stdValue: number;
    dateRange: [Date, Date];
  };
  left?: TreeNode;
  right?: TreeNode;
  impurity?: number;
  samples?: number;
}

// Calculate Gini impurity for categorical splits
function calculateGiniImpurity(data: DataPoint[]): number {
  const categories = new Map<string, number>();
  data.forEach((d) => {
    categories.set(d.category, (categories.get(d.category) || 0) + 1);
  });

  const total = data.length;
  let gini = 1;
  for (const count of categories.values()) {
    const p = count / total;
    gini -= p * p;
  }
  return gini;
}

// Calculate MSE for numerical splits (value)
function calculateMSE(data: DataPoint[]): number {
  const mean = d3.mean(data, (d) => d.value) || 0;
  return d3.sum(data, (d) => Math.pow(d.value - mean, 2)) / data.length;
}

// Find best split for numerical features
function findBestNumericalSplit(
  data: DataPoint[],
  feature: "date" | "value"
): {
  threshold: number;
  score: number;
} {
  const values = data
    .map((d) => (feature === "date" ? d.date.getTime() : d.value))
    .sort((a, b) => a - b);
  const uniqueValues = Array.from(new Set(values));

  let bestThreshold = uniqueValues[0];
  let bestScore = Infinity;

  // Try all possible splits
  for (let i = 0; i < uniqueValues.length - 1; i++) {
    const threshold = (uniqueValues[i] + uniqueValues[i + 1]) / 2;
    const leftData = data.filter((d) =>
      feature === "date" ? d.date.getTime() <= threshold : d.value <= threshold
    );
    const rightData = data.filter((d) =>
      feature === "date" ? d.date.getTime() > threshold : d.value > threshold
    );

    // Calculate weighted MSE
    const score =
      (leftData.length * calculateMSE(leftData) +
        rightData.length * calculateMSE(rightData)) /
      data.length;

    if (score < bestScore) {
      bestScore = score;
      bestThreshold = threshold;
    }
  }

  return { threshold: bestThreshold, score: bestScore };
}

// Find best categorical split
function findBestCategoricalSplit(data: DataPoint[]): {
  threshold: string;
  score: number;
} {
  const categories = Array.from(new Set(data.map((d) => d.category))).sort();
  let bestThreshold = categories[0];
  let bestScore = Infinity;

  for (const category of categories) {
    const leftData = data.filter((d) => d.category <= category);
    const rightData = data.filter((d) => d.category > category);

    const score =
      (leftData.length * calculateGiniImpurity(leftData) +
        rightData.length * calculateGiniImpurity(rightData)) /
      data.length;

    if (score < bestScore) {
      bestScore = score;
      bestThreshold = category;
    }
  }

  return { threshold: bestThreshold, score: bestScore };
}

// Cost complexity pruning
function pruneTree(node: TreeNode, alpha: number): TreeNode {
  if (!node.left || !node.right) return node;

  // Recursively prune children
  node.left = pruneTree(node.left, alpha);
  node.right = pruneTree(node.right, alpha);

  // Calculate cost of keeping vs. pruning this node
  const leafCost = (node.impurity || 0) * (node.samples || 0);
  const subtreeCost =
    (node.left.impurity || 0) * (node.left.samples || 0) +
    (node.right.impurity || 0) * (node.right.samples || 0) +
    alpha * 2; // Cost for two additional nodes

  if (leafCost <= subtreeCost) {
    // Prune by removing children
    delete node.left;
    delete node.right;
  }

  return node;
}

function buildDecisionTree(
  data: DataPoint[],
  depth = 0,
  maxDepth = 3,
  minSamplesSplit = 10,
  alpha = 0.01
): TreeNode {
  if (depth === maxDepth || data.length < minSamplesSplit) {
    return createLeafNode(data);
  }

  // Find best split across all features
  const dateSplit = findBestNumericalSplit(data, "date");
  const valueSplit = findBestNumericalSplit(data, "value");
  const categorySplit = findBestCategoricalSplit(data);

  // Choose best feature to split on
  const splits = [
    { feature: "date" as const, ...dateSplit },
    { feature: "value" as const, ...valueSplit },
    { feature: "category" as const, ...categorySplit },
  ];

  const bestSplit = splits.reduce((best, current) =>
    current.score < best.score ? current : best
  );

  // Create split based on best feature
  let leftData: DataPoint[];
  let rightData: DataPoint[];

  if (bestSplit.feature === "category") {
    leftData = data.filter(
      (d) => (d.category <= bestSplit.threshold) as string
    );
    rightData = data.filter(
      (d) => (d.category > bestSplit.threshold) as string
    );
  } else {
    const threshold = bestSplit.threshold as number;
    if (bestSplit.feature === "date") {
      leftData = data.filter((d) => d.date.getTime() <= threshold);
      rightData = data.filter((d) => d.date.getTime() > threshold);
    } else {
      leftData = data.filter((d) => d.value <= threshold);
      rightData = data.filter((d) => d.value > threshold);
    }
  }

  // Check if split is worthwhile
  if (leftData.length === 0 || rightData.length === 0) {
    return createLeafNode(data);
  }

  const node: TreeNode = {
    feature: bestSplit.feature,
    threshold: bestSplit.threshold,
    impurity: bestSplit.score,
    samples: data.length,
    left: buildDecisionTree(
      leftData,
      depth + 1,
      maxDepth,
      minSamplesSplit,
      alpha
    ),
    right: buildDecisionTree(
      rightData,
      depth + 1,
      maxDepth,
      minSamplesSplit,
      alpha
    ),
  };

  return pruneTree(node, alpha);
}

function createLeafNode(data: DataPoint[]): TreeNode {
  const categories = Array.from(new Set(data.map((d) => d.category)));
  const dates = data.map((d) => d.date);
  const values = data.map((d) => d.value);

  return {
    value: {
      category: d3.mode(data, (d) => d.category) || categories[0],
      meanValue: d3.mean(values) || 0,
      stdValue: d3.deviation(values) || 1,
      dateRange: [d3.min(dates) || new Date(), d3.max(dates) || new Date()],
    },
    impurity: calculateMSE(data),
    samples: data.length,
  };
}

function generateSyntheticDataFromTree(
  tree: TreeNode,
  targetSize: number
): DataPoint[] {
  const syntheticData: DataPoint[] = [];
  const batchSize = 1000; // Process in smaller batches

  function generateDataPoint(node: TreeNode): DataPoint {
    // If we hit a leaf node or a node without valid children, use its value
    if (node.value || !node.left || !node.right) {
      if (!node.value) {
        // Fallback values if we somehow get a non-leaf node without children
        return {
          category: "A",
          value: 0,
          date: new Date(),
        };
      }

      // Generate synthetic point from leaf node statistics
      const value = Math.max(
        0,
        d3.randomNormal(node.value.meanValue, node.value.stdValue)()
      );

      const startTime = node.value.dateRange[0].getTime();
      const timeRange = node.value.dateRange[1].getTime() - startTime;
      const date = new Date(startTime + Math.random() * timeRange);

      return {
        category: node.value.category,
        value,
        date,
      };
    }

    // If not a leaf node, randomly choose left or right branch
    const nextNode = Math.random() < 0.5 ? node.left : node.right;
    return generateDataPoint(nextNode);
  }

  // Generate data in batches
  while (syntheticData.length < targetSize) {
    const remaining = Math.min(batchSize, targetSize - syntheticData.length);
    const batch = Array.from({ length: remaining }, () =>
      generateDataPoint(tree)
    );
    syntheticData.push(...batch);
  }

  return syntheticData;
}

export function generateSyntheticData(
  realData: DataPoint[],
  targetSize: number
): DataPoint[] {
  const tree = buildDecisionTree(realData);
  return generateSyntheticDataFromTree(tree, targetSize);
}
