import { useState, useMemo } from "react";
import { DataPoint } from "../types";

interface DataTableProps {
  data: DataPoint[];
}

function DataTable({ data }: DataTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string[]>([
    "A",
    "B",
    "C",
  ]);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof DataPoint;
    direction: "asc" | "desc";
  }>({ key: "date", direction: "desc" });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const filteredData = useMemo(() => {
    return data
      .filter((item) => {
        const matchesCategory = categoryFilter.includes(item.category);
        const matchesSearch = searchTerm
          ? Object.values(item).some((value) =>
              value.toString().toLowerCase().includes(searchTerm.toLowerCase())
            )
          : true;
        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === "asc" ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === "asc" ? 1 : -1;
        }
        return 0;
      });
  }, [data, searchTerm, categoryFilter, sortConfig]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = (key: keyof DataPoint) => {
    setSortConfig({
      key,
      direction:
        sortConfig.key === key && sortConfig.direction === "asc"
          ? "desc"
          : "asc",
    });
    setCurrentPage(1); // Reset to first page when sorting
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pageNumbers: (number | string)[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    // Always show first page
    pageNumbers.push(1);

    // Calculate start and end of visible pages
    let start = Math.max(2, currentPage - 1);
    let end = Math.min(totalPages - 1, currentPage + 1);

    // Adjust if at the start or end
    if (currentPage <= 2) {
      end = 4;
    }
    if (currentPage >= totalPages - 1) {
      start = totalPages - 3;
    }

    // Add ellipsis if needed
    if (start > 2) {
      pageNumbers.push("...");
    }

    // Add visible page numbers
    for (let i = start; i <= end; i++) {
      pageNumbers.push(i);
    }

    // Add ellipsis if needed
    if (end < totalPages - 1) {
      pageNumbers.push("...");
    }

    // Always show last page
    pageNumbers.push(totalPages);

    return pageNumbers;
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b">
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            placeholder="Search..."
            className="border rounded px-3 py-2"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1); // Reset to first page when searching
            }}
          />
          <div className="space-x-2">
            {["A", "B", "C"].map((category) => (
              <label key={category} className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={categoryFilter.includes(category)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setCategoryFilter([...categoryFilter, category]);
                    } else {
                      setCategoryFilter(
                        categoryFilter.filter((c) => c !== category)
                      );
                    }
                    setCurrentPage(1); // Reset to first page when filtering
                  }}
                  className="mr-1"
                />
                Category {category}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort("date")}
              >
                Date
                {sortConfig.key === "date" && (
                  <span>{sortConfig.direction === "asc" ? " ↑" : " ↓"}</span>
                )}
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort("category")}
              >
                Category
                {sortConfig.key === "category" && (
                  <span>{sortConfig.direction === "asc" ? " ↑" : " ↓"}</span>
                )}
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort("value")}
              >
                Value
                {sortConfig.key === "value" && (
                  <span>{sortConfig.direction === "asc" ? " ↑" : " ↓"}</span>
                )}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedData.map((item, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  {item.date.toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">{item.category}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {item.value.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-6 py-4 border-t">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
            {Math.min(currentPage * itemsPerPage, filteredData.length)} of{" "}
            {filteredData.length} results
          </div>
          <div className="flex space-x-1">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={`px-3 py-1 rounded ${
                currentPage === 1
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-white text-gray-700 hover:bg-gray-50 border"
              }`}
            >
              Previous
            </button>
            {getPageNumbers().map((pageNum, index) => (
              <button
                key={index}
                onClick={() =>
                  typeof pageNum === "number" && handlePageChange(pageNum)
                }
                disabled={typeof pageNum === "string"}
                className={`px-3 py-1 rounded ${
                  pageNum === currentPage
                    ? "bg-blue-500 text-white"
                    : typeof pageNum === "string"
                    ? "bg-white text-gray-400"
                    : "bg-white text-gray-700 hover:bg-gray-50 border"
                }`}
              >
                {pageNum}
              </button>
            ))}
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`px-3 py-1 rounded ${
                currentPage === totalPages
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

export default DataTable;
