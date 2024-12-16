import * as d3 from "d3";
import { DataPoint } from "../types";

interface TreeNode {
  feature?: "category" | "date" | "value";
  threshold?: Date | string | number;
  value?: {
    category: string;
    categoryFrequencies: Map<string, number>;
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

// Add these optimizations at the top of the file
function findQuantiles(values: number[]): { q1: number; q3: number } {
  const sorted = values.slice().sort((a, b) => a - b);
  const q1Index = Math.floor(values.length * 0.25);
  const q3Index = Math.floor(values.length * 0.75);
  return { q1: sorted[q1Index], q3: sorted[q3Index] };
}

// Optimize numerical split finding
function findBestNumericalSplit(
  data: DataPoint[],
  feature: "date" | "value"
): {
  threshold: number;
  score: number;
} {
  // Extract and sort values once
  const values = data.map((d) =>
    feature === "date" ? d.date.getTime() : d.value
  );
  const { q1, q3 } = findQuantiles(values);
  const iqr = q3 - q1;

  // Use quantile-based candidate thresholds instead of all unique values
  const candidateThresholds = [
    q1 - 1.5 * iqr,
    q1,
    q1 + (q3 - q1) / 3,
    q1 + (2 * (q3 - q1)) / 3,
    q3,
    q3 + 1.5 * iqr,
  ];

  let bestThreshold = candidateThresholds[0];
  let bestScore = Infinity;
  const total = data.length;

  // Pre-calculate sums for efficiency
  const totalSum = d3.sum(data, (d) => d.value);
  const totalSqSum = d3.sum(data, (d) => d.value * d.value);

  for (const threshold of candidateThresholds) {
    let leftSum = 0;
    let leftSqSum = 0;
    let leftCount = 0;

    // Single pass through data
    for (const d of data) {
      const val = feature === "date" ? d.date.getTime() : d.value;
      if (val <= threshold) {
        leftCount++;
        leftSum += d.value;
        leftSqSum += d.value * d.value;
      }
    }

    const rightCount = total - leftCount;
    if (leftCount === 0 || rightCount === 0) continue;

    const rightSum = totalSum - leftSum;
    const rightSqSum = totalSqSum - leftSqSum;

    // Calculate MSE efficiently
    const leftMean = leftSum / leftCount;
    const rightMean = rightSum / rightCount;
    const leftMSE = leftSqSum / leftCount - leftMean * leftMean;
    const rightMSE = rightSqSum / rightCount - rightMean * rightMean;

    const score = (leftCount * leftMSE + rightCount * rightMSE) / total;

    if (score < bestScore) {
      bestScore = score;
      bestThreshold = threshold;
    }
  }

  return { threshold: bestThreshold, score: bestScore };
}

// Optimize categorical split finding
function findBestCategoricalSplit(data: DataPoint[]): {
  threshold: string;
  score: number;
} {
  // Use Map for frequency counting
  const categoryFreq = new Map<string, number>();
  const categoryValues = new Map<string, number>();
  const categorySquares = new Map<string, number>();

  // Single pass through data
  for (const d of data) {
    categoryFreq.set(d.category, (categoryFreq.get(d.category) || 0) + 1);
    categoryValues.set(
      d.category,
      (categoryValues.get(d.category) || 0) + d.value
    );
    categorySquares.set(
      d.category,
      (categorySquares.get(d.category) || 0) + d.value * d.value
    );
  }

  const categories = Array.from(categoryFreq.keys()).sort();
  let bestThreshold = categories[0];
  let bestScore = Infinity;
  const total = data.length;

  for (const category of categories) {
    const leftCount = categoryFreq.get(category) || 0;
    const rightCount = total - leftCount;
    if (leftCount === 0 || rightCount === 0) continue;

    const leftSum = categoryValues.get(category) || 0;
    const leftSqSum = categorySquares.get(category) || 0;
    const rightSum = d3.sum(Array.from(categoryValues.values())) - leftSum;
    const rightSqSum = d3.sum(Array.from(categorySquares.values())) - leftSqSum;

    const leftMean = leftSum / leftCount;
    const rightMean = rightSum / rightCount;
    const leftMSE = leftSqSum / leftCount - leftMean * leftMean;
    const rightMSE = rightSqSum / rightCount - rightMean * rightMean;

    const score = (leftCount * leftMSE + rightCount * rightMSE) / total;

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
  maxDepth = 5,
  minSamplesSplit = 5,
  alpha = 0.01,
  targetFeature: "all" | "date" | "value" | "category"
): TreeNode {
  const leafNode = createLeafNode(data);

  if (depth === maxDepth || data.length < minSamplesSplit) {
    return leafNode;
  }

  // Find the best split across all features if targetFeature is "all"
  let bestSplit;
  if (targetFeature === "all" || targetFeature === "date") {
    const dateSplit = findBestNumericalSplit(data, "date");
    bestSplit = { feature: "date", ...dateSplit };
  }
  if (targetFeature === "all" || targetFeature === "value") {
    const valueSplit = findBestNumericalSplit(data, "value");
    if (!bestSplit || valueSplit.score < bestSplit.score) {
      bestSplit = { feature: "value", ...valueSplit };
    }
  }
  if (targetFeature === "all" || targetFeature === "category") {
    const categorySplit = findBestCategoricalSplit(data);
    if (!bestSplit || categorySplit.score < bestSplit.score) {
      bestSplit = { feature: "category", ...categorySplit };
    }
  }

  // Create split based on feature
  let leftData: DataPoint[];
  let rightData: DataPoint[];

  if (bestSplit?.feature === "category") {
    const threshold = bestSplit.threshold as string;
    leftData = data.filter((d) => d.category === threshold);
    rightData = data.filter((d) => d.category !== threshold);
  } else {
    const threshold = (bestSplit?.threshold as number) ?? 0;
    if (bestSplit?.feature === "date") {
      leftData = data.filter((d) => d.date.getTime() <= threshold);
      rightData = data.filter((d) => d.date.getTime() > threshold);
    } else {
      leftData = data.filter((d) => d.value <= threshold);
      rightData = data.filter((d) => d.value > threshold);
    }
  }

  if (
    leftData.length === 0 ||
    rightData.length === 0 ||
    (bestSplit?.score ?? 0) >= leafNode.impurity!
  ) {
    return leafNode;
  }

  const node: TreeNode = {
    feature: bestSplit?.feature as "category" | "date" | "value",
    threshold: bestSplit?.threshold,
    impurity: bestSplit?.score,
    samples: data.length,
    value: leafNode.value,
    left: buildDecisionTree(
      leftData,
      depth + 1,
      maxDepth,
      minSamplesSplit,
      alpha,
      targetFeature
    ),
    right: buildDecisionTree(
      rightData,
      depth + 1,
      maxDepth,
      minSamplesSplit,
      alpha,
      targetFeature
    ),
  };

  return pruneTree(node, alpha);
}

function createLeafNode(data: DataPoint[]): TreeNode {
  const categories = Array.from(new Set(data.map((d) => d.category)));
  const dates = data.map((d) => d.date);
  const values = data.map((d) => d.value);

  // Calculate actual category frequencies
  const categoryFrequencies = new Map<string, number>();
  categories.forEach((cat) => {
    const count = data.filter((d) => d.category === cat).length;
    const frequency = count / data.length;
    categoryFrequencies.set(cat, frequency);
  });

  return {
    value: {
      category: categories.join(","),
      categoryFrequencies,
      meanValue: d3.mean(values) || 0,
      stdValue: Math.max(
        d3.deviation(values) || 1,
        values.length > 1
          ? d3.quantile(values, 0.75)! - d3.quantile(values, 0.25)!
          : 1
      ),
      dateRange: [d3.min(dates) || new Date(), d3.max(dates) || new Date()],
    },
    impurity: calculateMSE(data),
    samples: data.length,
  };
}

function generateFeatureValue(node: TreeNode): DataPoint {
  if (!node.value) {
    throw new Error("Node missing value statistics");
  }

  if (
    !node.left ||
    !node.right ||
    !node.feature ||
    node.threshold === undefined
  ) {
    // For leaf nodes, generate values that better match the distribution
    const date = new Date(
      node.value.dateRange[0].getTime() +
        Math.random() *
          (node.value.dateRange[1].getTime() -
            node.value.dateRange[0].getTime())
    );

    // Improved numeric value generation using Box-Muller transform
    let value;
    do {
      let u1 = Math.random();
      let u2 = Math.random();
      while (u1 === 0) u1 = Math.random(); // u1 must not be zero

      const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      value = node.value.meanValue + z * node.value.stdValue;
    } while (value < 0); // Ensure non-negative values

    // Use stored category frequencies for weighted selection
    const rand = Math.random();
    let cumProb = 0;
    let selectedCategory = node.value.category.split(",")[0];

    for (const [cat, freq] of node.value.categoryFrequencies) {
      cumProb += freq;
      if (rand <= cumProb) {
        selectedCategory = cat;
        break;
      }
    }

    return { date, value, category: selectedCategory };
  }

  // For non-leaf nodes, make decision based on threshold
  let goLeft: boolean;
  if (node.feature === "date") {
    const currentTime =
      node.value.dateRange[0].getTime() +
      Math.random() *
        (node.value.dateRange[1].getTime() - node.value.dateRange[0].getTime());
    goLeft = currentTime <= (node.threshold as number);
  } else if (node.feature === "value") {
    const currentValue = d3.randomNormal(
      node.value.meanValue,
      node.value.stdValue
    )();
    goLeft = currentValue <= (node.threshold as number);
  } else {
    const categories = node.value.category.split(",");
    const currentCategory =
      categories[Math.floor(Math.random() * categories.length)];
    goLeft = currentCategory === (node.threshold as string);
  }

  return generateFeatureValue(goLeft ? node.left : node.right);
}

export function generateSyntheticData(
  realData: DataPoint[],
  targetSize: number
): DataPoint[] {
  // Build a single tree considering all features
  const tree = buildDecisionTree(realData, 0, 6, 3, 0.005, "all");

  const syntheticData: DataPoint[] = [];

  for (let i = 0; i < targetSize; i++) {
    // Generate a synthetic data point by traversing the tree
    syntheticData.push(generateFeatureValue(tree));
  }

  return syntheticData;
}
