import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { DataPoint } from "../types";

interface ChartsProps {
  data: DataPoint[];
}

function Charts({ data }: ChartsProps) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    "A",
    "B",
    "C",
  ]);
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const [dateRange, setDateRange] = useState<[Date, Date]>(() => {
    const dates = data.map((d) => d.date);
    return [d3.min(dates) || new Date(), d3.max(dates) || new Date()];
  });

  const svgRef = useRef<SVGSVGElement>(null);
  const pieRef = useRef<SVGSVGElement>(null);
  const sliderRef = useRef<SVGSVGElement>(null);

  // Slider effect
  useEffect(() => {
    if (!sliderRef.current) return;

    d3.select(sliderRef.current).selectAll("*").remove();

    // Get the container width
    const containerWidth = sliderRef.current.parentElement?.clientWidth || 800;

    const margin = { top: 10, right: 20, bottom: 20, left: 20 };
    const width = containerWidth - margin.left - margin.right;
    const height = 100 - margin.top - margin.bottom;

    // Create responsive SVG
    const svg = d3
      .select(sliderRef.current)
      .attr("width", "100%") // Make SVG responsive
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
        setDateRange(newDates);
      });

    svg
      .append("rect")
      .attr("class", "slider-background")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "#f0f0f0")
      .attr("rx", 4);

    const brushGroup = svg.append("g").attr("class", "brush").call(brush);

    const axis = d3
      .axisBottom(x)
      .tickFormat(d3.timeFormat("%b %Y") as any)
      .ticks(width > 800 ? 10 : 6);

    svg
      .append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${height})`)
      .call(axis);

    const initialSelection: [number, number] = [
      x(dateRange[0]),
      x(dateRange[1]),
    ];
    brushGroup.call(brush.move, initialSelection);

    brushGroup
      .selectAll(".handle")
      .attr("fill", "#4ecdc4")
      .attr("stroke", "#2c8c85")
      .attr("stroke-width", 1)
      .style("pointer-events", "all");

    brushGroup
      .selectAll(".selection")
      .attr("fill", "#4ecdc4")
      .attr("fill-opacity", 0.2)
      .attr("stroke", "#4ecdc4")
      .attr("stroke-width", 1)
      .style("pointer-events", "all");

    brushGroup
      .select(".overlay")
      .style("pointer-events", "all");
  }, [data]);

  // Main chart effect
  useEffect(() => {
    if (!svgRef.current) return;

    d3.select(svgRef.current).selectAll("*").remove();

    const margin = { top: 20, right: 100, bottom: 50, left: 60 };
    const width = 800 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const svg = d3
      .select(svgRef.current)
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
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

  // Pie chart effect
  useEffect(() => {
    if (!pieRef.current) return;

    d3.select(pieRef.current).selectAll("*").remove();

    const width = 300;
    const height = 300;
    const radius = Math.min(width, height) / 2;

    const svg = d3
      .select(pieRef.current)
      .attr("width", width)
      .attr("height", height)
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

    const colorScale = d3
      .scaleOrdinal<string>()
      .domain(["A", "B", "C"])
      .range(["#ff6b6b", "#4ecdc4", "#45b7d1"]);

    svg
      .selectAll("path")
      .data(pieData)
      .enter()
      .append("path")
      .attr("d", arc)
      .attr("fill", (d) => colorScale(d.data[0]));
  }, [data, selectedCategories, dateRange]);

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-xl font-bold mb-2">Chart Controls</h2>
        <div className="mb-4">
          <h3 className="text-md font-semibold mb-2">Time Range</h3>
          <div className="border p-2 rounded w-full">
            <div className="w-full overflow-hidden">
              <svg ref={sliderRef}></svg>
            </div>
            <div className="text-sm text-gray-600 mt-1 flex justify-between">
              <span>{dateRange[0].toLocaleDateString()}</span>
              <span>{dateRange[1].toLocaleDateString()}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="space-x-2">
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
              className="border p-1"
            >
              <option value="line">Line Chart</option>
              <option value="bar">Area Chart</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="border p-4">
          <h3 className="text-lg font-bold mb-2">Time Series Chart</h3>
          <svg ref={svgRef}></svg>
        </div>
        <div className="border p-4">
          <h3 className="text-lg font-bold mb-2">Distribution Pie Chart</h3>
          <svg ref={pieRef}></svg>
        </div>
      </div>
    </div>
  );
}

export default Charts;
