import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { DataPoint } from "../types";

interface ChartsProps {
  data: DataPoint[];
}

// Helper function to get initial date range
function getInitialDateRange(data: DataPoint[]): [Date, Date] {
  const dates = data.map((d) => d.date);
  return [d3.min(dates) || new Date(), d3.max(dates) || new Date()];
}

function calculateStats(
  data: DataPoint[],
  dateRange: [Date, Date],
  categories: string[]
) {
  const filteredData = data.filter(
    (d) =>
      categories.includes(d.category) &&
      d.date >= dateRange[0] &&
      d.date <= dateRange[1]
  );

  const stats = {
    total: d3.sum(filteredData, (d) => d.value),
    average: d3.mean(filteredData, (d) => d.value) || 0,
    median: d3.median(filteredData, (d) => d.value) || 0,
    min: d3.min(filteredData, (d) => d.value) || 0,
    max: d3.max(filteredData, (d) => d.value) || 0,
    byCategory: new Map<
      string,
      {
        total: number;
        average: number;
        trend: "up" | "down" | "stable";
      }
    >(),
  };

  // Calculate per-category statistics
  categories.forEach((category) => {
    const categoryData = filteredData.filter((d) => d.category === category);
    if (categoryData.length === 0) return;

    // Sort by date for trend calculation
    const sorted = [...categoryData].sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );
    const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
    const secondHalf = sorted.slice(Math.floor(sorted.length / 2));

    const firstHalfAvg = d3.mean(firstHalf, (d) => d.value) || 0;
    const secondHalfAvg = d3.mean(secondHalf, (d) => d.value) || 0;

    const trend =
      secondHalfAvg > firstHalfAvg * 1.05
        ? "up"
        : secondHalfAvg < firstHalfAvg * 0.95
        ? "down"
        : "stable";

    stats.byCategory.set(category, {
      total: d3.sum(categoryData, (d) => d.value) || 0,
      average: d3.mean(categoryData, (d) => d.value) || 0,
      trend,
    });
  });

  return stats;
}

function Charts({ data }: ChartsProps) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    "A",
    "B",
    "C",
  ]);
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const [dateRange, setDateRange] = useState<[Date, Date]>(() =>
    getInitialDateRange(data)
  );

  // Store the last brush selection to prevent unnecessary updates
  const lastBrushRef = useRef<[Date, Date]>(dateRange);

  const svgRef = useRef<SVGSVGElement>(null);
  const pieRef = useRef<SVGSVGElement>(null);
  const sliderRef = useRef<SVGSVGElement>(null);

  // Update slider effect
  useEffect(() => {
    if (!sliderRef.current) return;

    d3.select(sliderRef.current).selectAll("*").remove();

    // Get the container width and determine if we're on a small screen
    const containerWidth = sliderRef.current.parentElement?.clientWidth || 800;
    const isSmallScreen = containerWidth < 640;

    const margin = {
      top: 10,
      right: isSmallScreen ? 10 : 20,
      bottom: isSmallScreen ? 25 : 20,
      left: isSmallScreen ? 10 : 20,
    };
    const width = containerWidth - margin.left - margin.right;
    const height = isSmallScreen ? 60 : 100 - margin.top - margin.bottom;

    // Create responsive SVG
    const svg = d3
      .select(sliderRef.current)
      .attr("width", "100%")
      .attr("height", height + margin.top + margin.bottom)
      .attr(
        "viewBox",
        `0 0 ${containerWidth} ${height + margin.top + margin.bottom}`
      )
      .attr("preserveAspectRatio", "xMidYMid meet")
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const dates = data.map((d) => d.date);
    const minDate = d3.min(dates) || new Date();
    const maxDate = d3.max(dates) || new Date();

    const x = d3.scaleTime().domain([minDate, maxDate]).range([0, width]);

    // Create axis with proper typing
    const axis = d3
      .axisBottom(x)
      .tickFormat(d3.timeFormat(isSmallScreen ? "%b" : "%b %Y"))
      .ticks(isSmallScreen ? 4 : width > 800 ? 10 : 6);

    // Add axis to SVG
    svg
      .append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${height})`)
      .call(axis as any)
      .style("font-size", isSmallScreen ? "10px" : "12px");

    // Background with rounded corners
    svg
      .append("rect")
      .attr("class", "slider-background")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "#f0f0f0")
      .attr("rx", 6);

    // Enhanced brush with touch support
    const brush = d3
      .brushX()
      .extent([
        [0, 0],
        [width, height],
      ])
      .on("end", (event) => {
        if (!event.selection) return;
        const [x0, x1] = event.selection;
        const newDates: [Date, Date] = [x.invert(x0), x.invert(x1)];

        // Only update if the dates have actually changed
        if (
          newDates[0].getTime() !== lastBrushRef.current[0].getTime() ||
          newDates[1].getTime() !== lastBrushRef.current[1].getTime()
        ) {
          lastBrushRef.current = newDates;
          setDateRange(newDates);
        }
      });

    const brushGroup = svg.append("g").attr("class", "brush").call(brush);

    // Set initial selection
    const initialSelection: [number, number] = [
      x(dateRange[0]),
      x(dateRange[1]),
    ];
    brushGroup.call(brush.move, initialSelection);

    // Enhanced handle styling
    brushGroup
      .selectAll(".handle")
      .attr("fill", "#4ecdc4")
      .attr("stroke", "#2c8c85")
      .attr("stroke-width", 1.5)
      .attr("rx", 3)
      .style("pointer-events", "all")
      .style("touch-action", "none");

    // Enhanced selection styling
    brushGroup
      .selectAll(".selection")
      .attr("fill", "#4ecdc4")
      .attr("fill-opacity", 0.2)
      .attr("stroke", "#4ecdc4")
      .attr("stroke-width", 1.5)
      .attr("rx", 3)
      .style("pointer-events", "all")
      .style("touch-action", "none");

    // Make overlay more touch-friendly
    brushGroup
      .select(".overlay")
      .style("pointer-events", "all")
      .style("touch-action", "none");

    // Add resize observer
    const resizeObserver = new ResizeObserver(() => {
      const newWidth = sliderRef.current?.parentElement?.clientWidth || 800;
      const isSmall = newWidth < 640;

      d3.select(sliderRef.current)
        .attr("width", "100%")
        .attr(
          "viewBox",
          `0 0 ${newWidth} ${height + margin.top + margin.bottom}`
        );

      // Update axis
      axis
        .ticks(isSmall ? 4 : newWidth > 800 ? 10 : 6)
        .tickFormat(d3.timeFormat(isSmall ? "%b" : "%b %Y"));

      svg
        .select(".axis")
        .style("font-size", isSmall ? "10px" : "12px")
        .call(axis as any);
    });

    resizeObserver.observe(sliderRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [data]);

  // Main chart effect
  useEffect(() => {
    if (!svgRef.current) return;

    const container = svgRef.current.parentElement;
    if (!container) return;

    d3.select(svgRef.current).selectAll("*").remove();

    const margin = { top: 20, right: 100, bottom: 50, left: 60 };
    const width =
      Math.max(800, container.clientWidth) - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const svg = d3
      .select(svgRef.current)
      .attr("width", "100%")
      .attr("height", height + margin.top + margin.bottom)
      .attr(
        "viewBox",
        `0 0 ${width + margin.left + margin.right} ${
          height + margin.top + margin.bottom
        }`
      )
      .attr("preserveAspectRatio", "xMidYMid meet")
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const filteredData = data.filter(
      (d) =>
        selectedCategories.includes(d.category) &&
        d.date >= dateRange[0] &&
        d.date <= dateRange[1]
    );

    const xScale = d3.scaleTime().domain(dateRange).range([0, width]);

    const yScale = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.value) as number])
      .range([height, 0]);

    const colorScale = d3
      .scaleOrdinal<string>()
      .domain(["A", "B", "C"])
      .range(["#ff6b6b", "#4ecdc4", "#45b7d1"]);

    svg
      .append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(xScale));

    svg.append("g").call(d3.axisLeft(yScale));

    if (chartType === "line") {
      selectedCategories.forEach((category) => {
        const categoryData = filteredData.filter(
          (d) => d.category === category
        );

        const line = d3
          .line<DataPoint>()
          .x((d) => xScale(d.date))
          .y((d) => yScale(d.value));

        svg
          .append("path")
          .datum(categoryData)
          .attr("fill", "none")
          .attr("stroke", colorScale(category))
          .attr("stroke-width", 2)
          .attr("d", line);
      });
    } else {
      selectedCategories.forEach((category) => {
        const categoryData = filteredData.filter(
          (d) => d.category === category
        );

        const area = d3
          .area<DataPoint>()
          .x((d) => xScale(d.date))
          .y0(height)
          .y1((d) => yScale(d.value))
          .curve(d3.curveMonotoneX);

        svg
          .append("path")
          .datum(categoryData)
          .attr("fill", colorScale(category))
          .attr("fill-opacity", 0.5)
          .attr("stroke", colorScale(category))
          .attr("stroke-width", 1.5)
          .attr("stroke-opacity", 0.8)
          .attr("d", area);
      });
    }

    const legend = svg
      .append("g")
      .attr("transform", `translate(${width + 10}, 0)`);

    selectedCategories.forEach((category, i) => {
      const legendItem = legend
        .append("g")
        .attr("transform", `translate(0, ${i * 20})`);

      legendItem
        .append("rect")
        .attr("width", 15)
        .attr("height", 15)
        .attr("fill", colorScale(category));

      legendItem
        .append("text")
        .attr("x", 20)
        .attr("y", 12)
        .text(`Category ${category}`);
    });
  }, [data, selectedCategories, chartType, dateRange]);

  // Update pie chart effect
  useEffect(() => {
    if (!pieRef.current) return;

    const container = pieRef.current.parentElement;
    if (!container) return;

    d3.select(pieRef.current).selectAll("*").remove();

    // Make size responsive to container
    const containerWidth = container.clientWidth;
    const width = Math.min(containerWidth, 400); // Max width of 400px
    const height = width; // Keep it square
    const radius = Math.min(width, height) / 2.5; // Slightly smaller radius for labels

    const svg = d3
      .select(pieRef.current)
      .attr("width", "100%")
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    const categoryTotals = d3.rollup(
      data.filter(
        (d) =>
          selectedCategories.includes(d.category) &&
          d.date >= dateRange[0] &&
          d.date <= dateRange[1]
      ),
      (v) => d3.sum(v, (d) => d.value),
      (d) => d.category
    );

    const pie = d3.pie<[string, number]>().value((d) => d[1]);
    const pieData = pie(Array.from(categoryTotals));

    const arc = d3
      .arc<d3.PieArcDatum<[string, number]>>()
      .innerRadius(0)
      .outerRadius(radius);

    // Add outer arc for labels
    const outerArc = d3
      .arc<d3.PieArcDatum<[string, number]>>()
      .innerRadius(radius * 1.1)
      .outerRadius(radius * 1.1);

    const colorScale = d3
      .scaleOrdinal<string>()
      .domain(["A", "B", "C"])
      .range(["#ff6b6b", "#4ecdc4", "#45b7d1"]);

    // Add slices
    const slices = svg
      .selectAll("path")
      .data(pieData)
      .enter()
      .append("path")
      .attr("d", arc)
      .attr("fill", (d) => colorScale(d.data[0]))
      .attr("stroke", "white")
      .style("stroke-width", "2px");

    // Add labels with lines
    const labels = svg
      .selectAll("text")
      .data(pieData)
      .enter()
      .append("text")
      .attr("dy", ".35em")
      .text((d) => `${d.data[0]}: ${d.data[1].toFixed(1)}`)
      .attr("transform", (d) => {
        const pos = outerArc.centroid(d);
        const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
        pos[0] = radius * 1.2 * (midAngle < Math.PI ? 1 : -1);
        return `translate(${pos})`;
      })
      .style("text-anchor", (d) => {
        const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
        return midAngle < Math.PI ? "start" : "end";
      })
      .style("font-size", "12px");

    // Add lines connecting slices to labels
    svg
      .selectAll("polyline")
      .data(pieData)
      .enter()
      .append("polyline")
      .attr("points", (d) => {
        const pos = outerArc.centroid(d);
        const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
        pos[0] = radius * 1.2 * (midAngle < Math.PI ? 1 : -1);
        return [arc.centroid(d), outerArc.centroid(d), pos].join(",");
      })
      .style("fill", "none")
      .style("stroke", "#999")
      .style("stroke-width", "1px");

    // Add resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const newWidth = Math.min(container.clientWidth, 400);
      svg
        .attr("width", newWidth)
        .attr("height", newWidth)
        .attr("viewBox", `0 0 ${newWidth} ${newWidth}`);
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [data, selectedCategories, dateRange]);

  return (
    <div className="p-4 w-full">
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-4">Chart Controls</h2>

        <div className="mb-4">
          <h3 className="text-md font-semibold mb-2">Time Range</h3>
          <div className="border p-2 rounded w-full touch-pan-x">
            <div className="w-full overflow-hidden">
              <svg ref={sliderRef} className="w-full touch-pan-x"></svg>
            </div>
            <div className="text-sm text-gray-600 mt-1 flex justify-between">
              <span>{dateRange[0].toLocaleDateString()}</span>
              <span>{dateRange[1].toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex flex-wrap gap-2">
            {["A", "B", "C"].map((category) => (
              <label key={category} className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(category)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedCategories([...selectedCategories, category]);
                    } else {
                      setSelectedCategories(
                        selectedCategories.filter((c) => c !== category)
                      );
                    }
                  }}
                  className="mr-1"
                />
                Category {category}
              </label>
            ))}
          </div>
          <div>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value as "line" | "bar")}
              className="border p-1 rounded"
            >
              <option value="line">Line Chart</option>
              <option value="bar">Area Chart</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="lg:col-span-2 border rounded-lg p-4 bg-white">
          <h3 className="text-lg font-bold mb-2">Time Series Chart</h3>
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              <svg ref={svgRef} className="w-full"></svg>
            </div>
          </div>
        </div>

        <div className="border rounded-lg p-4 bg-white">
          <h3 className="text-lg font-bold mb-2">Distribution Pie Chart</h3>
          <div className="flex justify-center">
            <svg ref={pieRef}></svg>
          </div>
        </div>

        <div className="border rounded-lg p-4 bg-white">
          <h3 className="text-lg font-bold mb-4">Statistics</h3>
          {(() => {
            const stats = calculateStats(data, dateRange, selectedCategories);
            return (
              <div className="space-y-4">
                {/* Overall Statistics */}
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">Overall</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-gray-50 p-2 rounded">
                      <span className="text-gray-600">Total:</span>{" "}
                      {stats.total.toFixed(1)}
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                      <span className="text-gray-600">Average:</span>{" "}
                      {stats.average.toFixed(1)}
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                      <span className="text-gray-600">Median:</span>{" "}
                      {stats.median.toFixed(1)}
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                      <span className="text-gray-600">Range:</span>{" "}
                      {stats.min.toFixed(1)} - {stats.max.toFixed(1)}
                    </div>
                  </div>
                </div>

                {/* Category Statistics */}
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">
                    By Category
                  </h4>
                  <div className="space-y-2">
                    {Array.from(stats.byCategory.entries()).map(
                      ([category, catStats]) => (
                        <div key={category} className="bg-gray-50 p-2 rounded">
                          <div className="flex justify-between items-center">
                            <span className="font-medium">
                              Category {category}
                            </span>
                            <span
                              className={`text-sm ${
                                catStats.trend === "up"
                                  ? "text-green-600"
                                  : catStats.trend === "down"
                                  ? "text-red-600"
                                  : "text-gray-600"
                              }`}
                            >
                              {catStats.trend === "up"
                                ? "↑"
                                : catStats.trend === "down"
                                ? "↓"
                                : "→"}
                            </span>
                          </div>
                          <div className="text-sm mt-1">
                            <div>Total: {catStats.total.toFixed(1)}</div>
                            <div>Average: {catStats.average.toFixed(1)}</div>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* Date Range Info */}
                <div className="text-sm text-gray-600 mt-2">
                  <div>
                    Period: {dateRange[0].toLocaleDateString()} -{" "}
                    {dateRange[1].toLocaleDateString()}
                  </div>
                  <div>
                    Duration:{" "}
                    {Math.round(
                      (dateRange[1].getTime() - dateRange[0].getTime()) /
                        (1000 * 60 * 60 * 24)
                    )}{" "}
                    days
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

export default Charts;
