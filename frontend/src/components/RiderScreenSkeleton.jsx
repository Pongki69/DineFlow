const TITLES = {
  dashboard: "Rider dashboard",
  deliveries: "My deliveries",
  history: "Delivery history",
  reviews: "Ratings and reviews",
  details: "Order details",
};

export function RiderScreenSkeleton({
  variant = "dashboard",
  label,
  showHeading = false,
}) {
  const title = TITLES[variant] || "Rider workspace";

  return (
    <div
      className={`rider-screen-skeleton rider-screen-skeleton--${variant}${showHeading ? " rider-screen-skeleton--has-heading" : ""}`}
      role="status"
      aria-label={label || `Loading ${title.toLowerCase()}`}
      aria-busy="true"
    >
      {showHeading && (
        <>
          {variant === "details" && (
            <span className="rider-screen-skeleton-block back-link-placeholder" aria-hidden="true" />
          )}
          <div className="rider-screen-skeleton-heading" aria-hidden="true">
            <span className="rider-screen-skeleton-block title" />
            <span className="rider-screen-skeleton-block subtitle" />
            {variant === "deliveries" && (
              <span className="rider-screen-skeleton-block heading-action" />
            )}
          </div>
        </>
      )}
      <div className="rider-screen-skeleton-content" aria-hidden="true">
        {variant === "history" && showHeading && (
          <section className="rider-history-panel history-panel-placeholder">
            <div className="history-toolbar-placeholder">
              <i /><i /><i />
            </div>
            <div className="history-results-placeholder"><i /><span /></div>
            <HistoryPlaceholder />
          </section>
        )}
        {variant === "dashboard" && (
          <>
            <section className="rider-loading-card dashboard-metrics">
              <span className="rider-screen-skeleton-block section-title" />
              <span className="rider-screen-skeleton-block section-copy" />
              <div className="dashboard-metric-grid">
                {[0, 1, 2, 3].map((item) => (
                  <div className="dashboard-metric-item" key={item}>
                    <i />
                    <b />
                    <span />
                  </div>
                ))}
              </div>
            </section>
            <div className="dashboard-main-grid">
              <section className="rider-loading-card dashboard-day">
                <span className="rider-screen-skeleton-block section-title" />
                <span className="rider-screen-skeleton-block section-copy" />
                <i className="wide-line" />
                <i className="medium-line" />
                <i className="short-line" />
              </section>
              <section className="rider-loading-card dashboard-status">
                <span className="rider-screen-skeleton-block section-title" />
                <i className="wide-line" />
                <i className="button-line" />
                <i className="medium-line" />
              </section>
            </div>
            <section className="rider-loading-card dashboard-tools">
              <span className="rider-screen-skeleton-block section-title" />
              <div className="dashboard-tool-grid">
                {[0, 1, 2].map((item) => (
                  <div className="dashboard-tool-item" key={item}>
                    <i />
                    <span><b /><em /></span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
        {variant === "deliveries" && (
          <div className="rider-loading-card deliveries-planner">
            <div className="deliveries-map-placeholder">
              <i className="map-road road-a" />
              <i className="map-road road-b" />
              <i className="map-route" />
              <i className="map-pin pin-a" />
              <i className="map-pin pin-b" />
            </div>
            <div className="deliveries-panel-placeholder">
              <span className="rider-screen-skeleton-block section-title" />
              <span className="rider-screen-skeleton-block section-copy" />
              {[0, 1, 2].map((item) => <i className="delivery-stop-line" key={item} />)}
            </div>
          </div>
        )}
        {variant === "history" && !showHeading && <HistoryPlaceholder />}
        {variant === "reviews" && (
          <>
            <section className="rider-loading-card review-profile-placeholder">
              <i />
              <div><b /><span /><em /></div>
              <small />
            </section>
            <div className="review-grid-placeholder">
              <section className="rider-loading-card review-score-placeholder">
                <b /><i /><i /><i /><i />
              </section>
              <section className="rider-loading-card review-empty-placeholder">
                <i /><div><b /><span /><span /><span /></div>
              </section>
            </div>
          </>
        )}
        {variant === "details" && (
          <>
            <section className="rider-loading-card receipt-placeholder">
              <span className="rider-screen-skeleton-block section-title" />
              {[0, 1, 2].map((item) => <i key={item} />)}
            </section>
            <div className="order-details-grid-placeholder">
              <section className="rider-loading-card"><i /><i /><i /></section>
              <section className="rider-loading-card"><i /><i /><i /></section>
            </div>
            <section className="rider-loading-card order-map-placeholder" />
          </>
        )}
      </div>
    </div>
  );
}

function HistoryPlaceholder() {
  return (
    <div className="history-list-placeholder">
      <div className="history-header-line">
        {[0, 1, 2, 3, 4, 5].map((item) => <i key={item} />)}
      </div>
      {[0, 1, 2, 3, 4].map((item) => (
        <div className="history-row-line" key={item}>
          {[0, 1, 2, 3, 4, 5].map((cell) => <i key={cell} />)}
        </div>
      ))}
    </div>
  );
}
