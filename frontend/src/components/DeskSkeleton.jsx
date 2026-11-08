import "./deskSkeleton.css";

/**
 * Admin desktop loading placeholder shaped like the page that is coming:
 * stat tiles, a filter bar, then the page's body.
 *
 * layout: {
 *   stats: number of stat tiles (0 for none),
 *   filters: true for a filter / chip bar,
 *   body: "table" | "cards" | "board" | "list" | "charts" | "form" | "split"
 *     | "plan" | "receipt",
 *   toolbar: true for a search and sort row inside the table card,
 *   rail: true for side cards next to the body,
 *   rows: rows in a table or list, cards in a grid (default 6),
 *   columns: cards per row, or board columns (default 3),
 * }
 */
export function DeskSkeleton({ label, layout }) {
  const {
    stats = 0,
    filters = false,
    body = "table",
    rows = 6,
    columns = 3,
    toolbar = false,
    rail = false,
  } = layout || {};
  const many = (count, render) =>
    Array.from({ length: count }, (_, index) => render(index));
  return (
    <div className="desk-skel" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      {stats > 0 && (
        <div
          className="desk-skel-stats"
          style={{ "--desk-skel-stats": stats }}
          aria-hidden="true"
        >
          {many(stats, (index) => (
            <div key={index} className="desk-skel-card desk-skel-stat">
              <i className="desk-skel-bar w40" />
              <i className="desk-skel-bar lg w55" />
              <i className="desk-skel-bar w70" />
            </div>
          ))}
        </div>
      )}
      {filters && (
        <div className="desk-skel-card desk-skel-filters" aria-hidden="true">
          <i className="desk-skel-field" />
          {many(4, (index) => (
            <i key={index} className="desk-skel-pill" />
          ))}
        </div>
      )}
      <div className={rail ? "desk-skel-railed" : "desk-skel-plain"}>
        <div className="desk-skel-main">
          {body === "form" &&
            many(rows, (section) => (
              <div
                key={section}
                className="desk-skel-card desk-skel-form"
                aria-hidden="true"
              >
                <i className="desk-skel-bar w30" />
                <i className="desk-skel-bar sm w45" />
                <div className="desk-skel-form-grid">
                  {many(4, (index) => (
                    <span key={index}>
                      <i className="desk-skel-bar sm w30" />
                      <i className="desk-skel-field" />
                    </span>
                  ))}
                </div>
              </div>
            ))}
          {body === "split" && (
            <div className="desk-skel-split" aria-hidden="true">
              <i className="desk-skel-card desk-skel-thumb" />
              <div className="desk-skel-card desk-skel-table">
                {many(5, (index) => (
                  <div
                    key={index}
                    className="desk-skel-row desk-skel-row--stack"
                  >
                    <i className="desk-skel-bar w60" />
                    <i className="desk-skel-bar sm w80" />
                  </div>
                ))}
              </div>
            </div>
          )}
          {body === "plan" && (
            <div className="desk-skel-card desk-skel-plan" aria-hidden="true">
              {many(12, (index) => (
                <i key={index} className="desk-skel-ring" />
              ))}
            </div>
          )}
          {body === "receipt" && (
            <div
              className="desk-skel-card desk-skel-receipt"
              aria-hidden="true"
            >
              <i className="desk-skel-bar lg w55" />
              {many(7, (index) => (
                <i
                  key={index}
                  className={`desk-skel-bar ${index % 2 ? "w65" : "w80"}`}
                />
              ))}
              <i className="desk-skel-bar lg w40" />
            </div>
          )}
          {body === "table" && (
            <div className="desk-skel-card desk-skel-table" aria-hidden="true">
              {toolbar ? (
                <div className="desk-skel-toolbar">
                  <i className="desk-skel-field" />
                  <i className="desk-skel-field" />
                </div>
              ) : (
                <div className="desk-skel-head" />
              )}
              {many(rows, (index) => (
                <div key={index} className="desk-skel-row">
                  <i className="desk-skel-dot" />
                  <span>
                    <i className="desk-skel-bar w45" />
                    <i className="desk-skel-bar sm w30" />
                  </span>
                  <i className="desk-skel-pill" />
                  <i className="desk-skel-button" />
                </div>
              ))}
            </div>
          )}
          {body === "list" && (
            <div className="desk-skel-card desk-skel-table" aria-hidden="true">
              {many(rows, (index) => (
                <div key={index} className="desk-skel-row desk-skel-row--list">
                  <i className="desk-skel-bar w60" />
                  <i className="desk-skel-dot" />
                  <span>
                    <i className="desk-skel-bar w55" />
                    <i className="desk-skel-bar sm w25" />
                  </span>
                </div>
              ))}
            </div>
          )}
          {body === "cards" && (
            <div
              className="desk-skel-grid"
              style={{ "--desk-skel-columns": columns }}
              aria-hidden="true"
            >
              {many(rows, (index) => (
                <div key={index} className="desk-skel-card desk-skel-tile">
                  <i className="desk-skel-thumb" />
                  <i className="desk-skel-bar w60" />
                  <i className="desk-skel-bar sm w40" />
                  <i className="desk-skel-bar sm w80" />
                </div>
              ))}
            </div>
          )}
          {body === "board" && (
            <div
              className="desk-skel-grid"
              style={{ "--desk-skel-columns": columns }}
              aria-hidden="true"
            >
              {many(columns, (column) => (
                <div key={column} className="desk-skel-card desk-skel-column">
                  <i className="desk-skel-bar w40" />
                  {many(3, (index) => (
                    <div key={index} className="desk-skel-ticket">
                      <i className="desk-skel-bar w55" />
                      <i className="desk-skel-bar sm w80" />
                      <i className="desk-skel-bar sm w65" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {body === "charts" && (
            <>
              <div className="desk-skel-charts" aria-hidden="true">
                <div className="desk-skel-card desk-skel-chart">
                  {many(7, (index) => (
                    <i
                      key={index}
                      style={{ height: `${30 + ((index * 37) % 60)}%` }}
                    />
                  ))}
                </div>
                <div className="desk-skel-card desk-skel-chart">
                  {many(5, (index) => (
                    <i
                      key={index}
                      style={{ height: `${25 + ((index * 41) % 65)}%` }}
                    />
                  ))}
                </div>
              </div>
              <div
                className="desk-skel-grid"
                style={{ "--desk-skel-columns": 3 }}
                aria-hidden="true"
              >
                {many(3, (index) => (
                  <div key={index} className="desk-skel-card desk-skel-tile">
                    <i className="desk-skel-bar w40" />
                    <i className="desk-skel-ring" />
                    <i className="desk-skel-bar sm w80" />
                    <i className="desk-skel-bar sm w60" />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        {rail && (
          <div className="desk-skel-rail" aria-hidden="true">
            {many(2, (card) => (
              <div key={card} className="desk-skel-card desk-skel-form">
                <i className="desk-skel-bar w45" />
                {many(4, (index) => (
                  <i key={index} className="desk-skel-bar sm w80" />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
