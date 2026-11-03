import { ChevronLeft, ChevronRight } from "lucide-react";
import "./pagination.css";

export function Pagination({
  page,
  lastPage,
  total,
  from,
  to,
  onChange,
  disabled = false,
}) {
  return (
    <nav className="workspace-pagination" aria-label="Pagination">
      <span>{total ? `Showing ${from}–${to} of ${total}` : "No results"}</span>
      <div>
        <button
          type="button"
          disabled={disabled || page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Previous
        </button>
        <strong>
          Page {page} of {Math.max(1, lastPage)}
        </strong>
        <button
          type="button"
          disabled={disabled || page >= lastPage}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          Next
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
