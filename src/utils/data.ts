import { DataPoint } from "../types";

export function generateData(): DataPoint[] {
  const categories = ["A", "B", "C"];
  const data: DataPoint[] = [];

  // Generate data for 2 years
  for (let i = 0; i < 730; i++) {
    categories.forEach((category) => {
      const baseValue = Math.sin(i / 30) * 20 + Math.cos(i / 90) * 15;
      data.push({
        date: new Date(2023, 0, i + 1),
        value: Math.max(
          0,
          baseValue +
            Math.random() * 30 +
            (category === "A" ? 80 : category === "B" ? 60 : 40)
        ),
        category,
      });
    });
  }
  return data;
}
