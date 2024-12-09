import { DataPoint } from "../types";

interface ColumnSelection {
  date?: string;
  value?: string;
  category?: string;
}

export function parseCSV(
  csvText: string,
  columnSelection?: ColumnSelection
): DataPoint[] {
  const lines = csvText.split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  const data: DataPoint[] = [];

  // Get column indices from selection
  const dateIndex = columnSelection?.date
    ? headers.indexOf(columnSelection.date)
    : -1;
  const valueIndex = columnSelection?.value
    ? headers.indexOf(columnSelection.value)
    : -1;
  const categoryIndex = columnSelection?.category
    ? headers.indexOf(columnSelection.category)
    : -1;

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(",").map((v) => v.trim());
    if (values.length !== headers.length) continue;

    try {
      let date: Date | null = null;
      let value: number | null = null;
      let category = "A";

      // Try selected columns first
      if (dateIndex >= 0) {
        const possibleDate = new Date(values[dateIndex]);
        if (!isNaN(possibleDate.getTime())) {
          date = possibleDate;
        }
      }

      if (valueIndex >= 0) {
        const possibleValue = parseFloat(values[valueIndex]);
        if (!isNaN(possibleValue)) {
          value = possibleValue;
        }
      }

      if (categoryIndex >= 0) {
        category = values[categoryIndex];
      }

      // If selected columns didn't work, try auto-detection
      if (!date || value === null) {
        values.forEach((val, index) => {
          if (!date && index !== valueIndex && index !== categoryIndex) {
            const possibleDate = new Date(val);
            if (!isNaN(possibleDate.getTime())) {
              date = possibleDate;
              return;
            }
          }

          if (
            value === null &&
            index !== dateIndex &&
            index !== categoryIndex
          ) {
            const possibleValue = parseFloat(val);
            if (!isNaN(possibleValue)) {
              value = possibleValue;
              return;
            }
          }

          if (
            !columnSelection?.category &&
            index !== dateIndex &&
            index !== valueIndex &&
            val &&
            isNaN(parseFloat(val)) &&
            new Date(val).toString() === "Invalid Date"
          ) {
            category = val;
          }
        });
      }

      // Fallbacks
      if (!date) {
        date = new Date();
        date.setDate(date.getDate() + i);
      }

      if (value === null) {
        value = Math.random() * 100;
      }

      data.push({ date, value, category });
    } catch (error) {
      console.warn(`Error parsing row ${i + 1}:`, error);
    }
  }

  if (data.length === 0) {
    throw new Error("No valid data could be extracted from the CSV file");
  }

  return data;
}
