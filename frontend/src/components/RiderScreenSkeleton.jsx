const TITLES = {
  dashboard: "Rider dashboard",
  deliveries: "My deliveries",
  history: "Delivery history",
  reviews: "Ratings and reviews",
  details: "Order details",
  offers: "Delivery offers",
  profile: "Profile",
};

// Each variant mirrors the page it stands in for, so content lands where the
// placeholder was instead of jumping. `w` sets a line's width.
const Line = ({ w = "100%", h, className = "" }) => (
  <i
    className={`rsk-line ${className}`.trim()}
    style={{ "--rsk-w": w, ...(h ? { "--rsk-h": `${h}px` } : null) }}
  />
);

export function RiderScreenSkeleton({
  variant = "dashboard",
  label,
  showHeading = false,
}) {
  const title = TITLES[variant] || "Rider workspace";

  return (
    <div
      className={`rider-screen-skeleton rsk rsk--${variant}`}
      role="status"
      aria-label={label || `Loading ${title.toLowerCase()}`}
      aria-busy="true"
    >
      <div className="rsk-body" aria-hidden="true">
        {showHeading && variant === "details" && <Line w="34%" />}
        {showHeading && (
          <div className="rsk-heading">
            <Line w="46%" h={24} />
            <Line w="72%" />
          </div>
        )}
        {variant === "dashboard" && <Dashboard />}
        {variant === "deliveries" && <Deliveries />}
        {variant === "history" && <History />}
        {variant === "reviews" && <Reviews />}
        {variant === "details" && <Details />}
        {variant === "offers" && <Offers />}
        {variant === "profile" && <Profile />}
      </div>
    </div>
  );
}

function Dashboard() {
  return (
    <>
      <section className="rsk-card">
        <div className="rsk-row">
          <Line w="40%" h={20} />
          <Line w="22%" />
        </div>
        <div className="rsk-row">
          <div className="rsk-stack">
            <Line w="60%" />
            <Line w="45%" h={24} />
          </div>
          <i className="rsk-pill" />
        </div>
        <div className="rsk-segments">
          <i />
          <i />
          <i />
        </div>
        <div className="rsk-inset">
          <Line w="38%" />
          <Line w="70%" h={18} />
          <i className="rsk-button" />
        </div>
      </section>
      <div className="rsk-grid-2">
        {[0, 1, 2, 3].map((item) => (
          <section className="rsk-card rsk-card--tight" key={item}>
            <Line w="70%" />
            <Line w="35%" h={24} />
            <Line w="55%" />
          </section>
        ))}
      </div>
    </>
  );
}

function Deliveries() {
  return (
    <section className="rsk-card rsk-card--flush">
      <div className="rsk-chips">
        <i className="is-active" />
        <i />
        <i />
      </div>
      <div className="rsk-map">
        <i className="rsk-pin rsk-pin--a" />
        <i className="rsk-pin rsk-pin--b" />
        <i className="rsk-pin rsk-pin--c" />
      </div>
      <div className="rsk-sheet">
        <i className="rsk-handle" />
        <div className="rsk-segmented">
          <i />
          <i className="is-active" />
          <i />
        </div>
        <div className="rsk-row rsk-row--start">
          <i className="rsk-tile" />
          <div className="rsk-stack">
            <Line w="55%" h={20} />
            <i className="rsk-pill" />
          </div>
        </div>
        <i className="rsk-button rsk-button--tall" />
      </div>
    </section>
  );
}

function History() {
  return (
    <section className="rsk-card">
      <i className="rsk-input" />
      <div className="rsk-chips rsk-chips--pills">
        <i className="is-active" />
        <i />
        <i />
        <i />
      </div>
      <Line w="48%" />
      {[0, 1, 2, 3].map((item) => (
        <div className="rsk-list-row" key={item}>
          <div className="rsk-row">
            <div className="rsk-row rsk-row--start">
              <i className="rsk-tile rsk-tile--small" />
              <Line w="90px" h={18} />
            </div>
            <i className="rsk-pill" />
          </div>
          <Line w="78%" />
          <div className="rsk-row">
            <Line w="40%" />
            <Line w="22%" h={16} />
          </div>
        </div>
      ))}
    </section>
  );
}

function Reviews() {
  return (
    <>
      <section className="rsk-card rsk-row rsk-row--start">
        <i className="rsk-avatar" />
        <div className="rsk-stack">
          <Line w="55%" h={20} />
          <i className="rsk-pill" />
          <Line w="45%" />
        </div>
      </section>
      <section className="rsk-card">
        <Line w="40%" h={20} />
        <Line w="50%" />
      </section>
      <section className="rsk-card">
        <i className="rsk-tile" />
        <Line w="65%" h={18} />
        <Line w="90%" />
        <Line w="70%" />
      </section>
    </>
  );
}

function Details() {
  return (
    <>
      <section className="rsk-card">
        <div className="rsk-row">
          <Line w="45%" h={20} />
          <i className="rsk-pill" />
        </div>
        {[0, 1, 2].map((item) => (
          <div className="rsk-row" key={item}>
            <Line w="58%" />
            <Line w="18%" />
          </div>
        ))}
        <div className="rsk-row">
          <Line w="35%" h={20} />
          <Line w="25%" h={20} />
        </div>
      </section>
      <section className="rsk-card">
        <Line w="45%" h={20} />
        <Line w="80%" />
        <Line w="65%" />
      </section>
    </>
  );
}

function Offers() {
  return (
    <>
      {[0, 1].map((item) => (
        <section className="rsk-card" key={item}>
          <div className="rsk-row">
            <Line w="42%" h={20} />
            <i className="rsk-pill" />
          </div>
          <Line w="100%" h={4} />
          <div className="rsk-stack rsk-stack--route">
            <Line w="25%" />
            <Line w="70%" h={18} />
            <Line w="25%" />
            <Line w="62%" h={18} />
          </div>
          <i className="rsk-button rsk-button--tall" />
        </section>
      ))}
    </>
  );
}

function Profile() {
  return (
    <>
      <section className="rsk-card rsk-row rsk-row--start">
        <i className="rsk-avatar rsk-avatar--small" />
        <div className="rsk-stack">
          <Line w="50%" h={18} />
          <Line w="65%" />
        </div>
      </section>
      <section className="rsk-card rsk-card--list">
        {[0, 1, 2].map((item) => (
          <div className="rsk-row rsk-row--start" key={item}>
            <i className="rsk-tile rsk-tile--small" />
            <Line w="55%" />
          </div>
        ))}
      </section>
      <i className="rsk-button rsk-button--tall" />
    </>
  );
}
