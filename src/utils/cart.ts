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
  maxDepth = 5,
  minSamplesSplit = 5,
  alpha = 0.01,
  targetFeature: "date" | "value" | "category"
): TreeNode {
  const leafNode = createLeafNode(data);

  if (depth === maxDepth || data.length < minSamplesSplit) {
    return leafNode;
  }

  // Only consider splits for the target feature
  let bestSplit;
  if (targetFeature === "date") {
    bestSplit = {
      feature: "date" as const,
      ...findBestNumericalSplit(data, "date"),
    };
  } else if (targetFeature === "value") {
    bestSplit = {
      feature: "value" as const,
      ...findBestNumericalSplit(data, "value"),
    };
  } else {
    bestSplit = {
      feature: "category" as const,
      ...findBestCategoricalSplit(data),
    };
  }

  // Create split based on feature
  let leftData: DataPoint[];
  let rightData: DataPoint[];

  if (targetFeature === "category") {
    leftData = data.filter(
      (d) => d.category <= (bestSplit.threshold as string)
    );
    rightData = data.filter(
      (d) => d.category > (bestSplit.threshold as string)
    );
  } else {
    const threshold = bestSplit.threshold as number;
    if (targetFeature === "date") {
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
    bestSplit.score >= leafNode.impurity!
  ) {
    return leafNode;
  }

  const node: TreeNode = {
    feature: bestSplit.feature,
    threshold: bestSplit.threshold,
    impurity: bestSplit.score,
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
  const categories = Array.from(new Set(data.map((d) => d.category))).join(",");
  const dates = data.map((d) => d.date);
  const values = data.map((d) => d.value);

  return {
    value: {
      category: categories, // Store all unique categories
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

function generateFeatureValue(
  node: TreeNode,
  targetFeature: "date" | "value" | "category"
): DataPoint {
  if (!node.value) {
    throw new Error("Node missing value statistics");
  }

  // If it's a leaf node, generate value based on leaf statistics
  if (
    !node.left ||
    !node.right ||
    !node.feature ||
    node.threshold === undefined
  ) {
    if (targetFeature === "date") {
      const minDate = node.value.dateRange[0].getTime();
      const maxDate = node.value.dateRange[1].getTime();
      return {
        date: new Date(minDate + Math.random() * (maxDate - minDate)),
        value: 0,
        category: "",
      };
    } else if (targetFeature === "value") {
      // Use truncated normal distribution for values
      let value;
      do {
        value = d3.randomNormal(node.value.meanValue, node.value.stdValue)();
      } while (value < 0);
      return {
        date: new Date(),
        value,
        category: "",
      };
    } else {
      const categories = node.value.category.split(",");
      return {
        date: new Date(),
        value: 0,
        category: categories[Math.floor(Math.random() * categories.length)],
      };
    }
  }

  // For non-leaf nodes, make decision based on threshold
  let goLeft: boolean;
  if (targetFeature === "date") {
    const currentTime =
      node.value.dateRange[0].getTime() +
      Math.random() *
        (node.value.dateRange[1].getTime() - node.value.dateRange[0].getTime());
    goLeft = currentTime <= (node.threshold as number);
  } else if (targetFeature === "value") {
    const currentValue = d3.randomNormal(
      node.value.meanValue,
      node.value.stdValue
    )();
    goLeft = currentValue <= (node.threshold as number);
  } else {
    const categories = node.value.category.split(",");
    const currentCategory =
      categories[Math.floor(Math.random() * categories.length)];
    goLeft = currentCategory <= (node.threshold as string);
  }

  return generateFeatureValue(goLeft ? node.left : node.right, targetFeature);
}

export function generateSyntheticData(
  realData: DataPoint[],
  targetSize: number
): DataPoint[] {
  // Build separate trees with different parameters for each feature
  const dateTree = buildDecisionTree(realData, 0, 6, 3, 0.005, "date");
  const valueTree = buildDecisionTree(realData, 0, 8, 4, 0.01, "value");
  const categoryTree = buildDecisionTree(realData, 0, 4, 2, 0.02, "category");

  const syntheticData: DataPoint[] = [];

  for (let i = 0; i < targetSize; i++) {
    // Generate each feature independently
    const datePoint = generateFeatureValue(dateTree, "date");
    const valuePoint = generateFeatureValue(valueTree, "value");
    const categoryPoint = generateFeatureValue(categoryTree, "category");

    syntheticData.push({
      date: datePoint.date,
      value: valuePoint.value,
      category: categoryPoint.category,
    });
  }

  return syntheticData;
}
