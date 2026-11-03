import "./customerScreenSkeleton.css";

const Bar = ({ className = "" }) => (
  <i className={`skeleton csk-bar ${className}`} />
);

// Loading placeholders shaped like each customer page, so content lands
// where the placeholder was instead of jumping into place.
export function CustomerScreenSkeleton({ variant = "menu", label }) {
  return (
    <div
      className="csk"
      data-variant={variant}
      role="status"
      aria-label={label || "Loading your page"}
    >
      <span className="sr-only">{label || "Loading your page"}</span>
      <div aria-hidden="true">{variants[variant]?.() || variants.menu()}</div>
    </div>
  );
}

const dishes = () => (
  <div className="csk-dish-grid">
    {Array.from({ length: 4 }, (_, index) => (
      <div className="csk-card csk-dish" key={index}>
        <i className="skeleton csk-dish-image" />
        <div className="csk-pad">
          <Bar className="csk-w40 csk-h10" />
          <Bar className="csk-w85" />
          <Bar className="csk-w60" />
          <Bar className="csk-button" />
        </div>
      </div>
    ))}
  </div>
);
const orderList = () => (
  <div className="csk-stack">
    {Array.from({ length: 2 }, (_, index) => (
      <div className="csk-card csk-pad csk-order" key={index}>
        <div className="csk-row">
          <i className="skeleton csk-tile" />
          <Bar className="csk-w45" />
          <Bar className="csk-pill" />
        </div>
        <Bar className="csk-w80 csk-h12" />
        <Bar className="csk-w60" />
        <i className="skeleton csk-strip" />
        <div className="csk-row csk-end">
          <Bar className="csk-button csk-button-right" />
        </div>
      </div>
    ))}
  </div>
);
const bookingList = () => (
  <div className="csk-stack">
    {Array.from({ length: 2 }, (_, index) => (
      <div className="csk-card csk-pad csk-booking" key={index}>
        <i className="skeleton csk-date-tile" />
        <div className="csk-stack csk-tight">
          <Bar className="csk-w60" />
          <Bar className="csk-w80 csk-h12" />
        </div>
        <div className="csk-row csk-between csk-span">
          <Bar className="csk-pill" />
          <Bar className="csk-button csk-button-right" />
        </div>
      </div>
    ))}
  </div>
);

const variants = {
  menu: () => (
    <>
      <Bar className="csk-search" />
      <div className="csk-chips">
        <Bar className="csk-chip csk-chip-wide" />
        <Bar className="csk-chip" />
        <Bar className="csk-chip" />
      </div>
      {dishes()}
    </>
  ),
  dishes,
  orders: () => (
    <>
      <Bar className="csk-w50 csk-h12" />
      {orderList()}
    </>
  ),
  orderList,
  bookingList,
  plan: () => <i className="skeleton csk-plan" />,
  booking: () => (
    <div className="csk-stack">
      <div className="csk-row">
        <Bar className="csk-pill" />
        <Bar className="csk-pill" />
        <Bar className="csk-pill" />
      </div>
      <div className="csk-card csk-pad">
        <div className="csk-row csk-between">
          <Bar className="csk-w25" />
          <Bar className="csk-w40" />
        </div>
        <div className="csk-days">
          {Array.from({ length: 5 }, (_, index) => (
            <i className="skeleton csk-day" key={index} />
          ))}
        </div>
      </div>
      <div className="csk-card csk-pad">
        <div className="csk-row csk-between">
          <Bar className="csk-w25" />
          <Bar className="csk-w25" />
        </div>
        <div className="csk-times">
          {Array.from({ length: 9 }, (_, index) => (
            <i className="skeleton csk-time" key={index} />
          ))}
        </div>
      </div>
      <div className="csk-card csk-pad csk-row csk-between">
        <Bar className="csk-w25" />
        <div className="csk-row">
          <i className="skeleton csk-round" />
          <i className="skeleton csk-round" />
        </div>
      </div>
      <i className="skeleton csk-plan" />
    </div>
  ),
  bookings: () => (
    <>
      <Bar className="csk-w80 csk-h12" />
      {bookingList()}
    </>
  ),
  profile: () => (
    <div className="csk-stack">
      <div className="csk-card csk-pad csk-row">
        <i className="skeleton csk-avatar" />
        <div className="csk-stack csk-tight csk-grow">
          <Bar className="csk-w60" />
          <Bar className="csk-w80 csk-h12" />
        </div>
      </div>
      <div className="csk-card">
        {Array.from({ length: 5 }, (_, index) => (
          <div className="csk-list-row" key={index}>
            <i className="skeleton csk-icon" />
            <Bar className="csk-w50" />
          </div>
        ))}
      </div>
      <i className="skeleton csk-signout" />
      <div className="csk-card csk-pad csk-stack">
        <Bar className="csk-w50" />
        <Bar className="csk-w80 csk-h12" />
        <i className="skeleton csk-field" />
      </div>
    </div>
  ),
  account: () => (
    <div className="csk-stack">
      <div className="csk-card csk-pad csk-stack">
        <i className="skeleton csk-avatar csk-avatar-lg" />
        <Bar className="csk-w60" />
        <Bar className="csk-w80 csk-h12" />
      </div>
      <div className="csk-card csk-pad csk-stack">
        <Bar className="csk-w40" />
        <i className="skeleton csk-field" />
        <i className="skeleton csk-field" />
        <Bar className="csk-button csk-button-right" />
      </div>
    </div>
  ),
  tracking: () => (
    <div className="csk-stack">
      <Bar className="csk-w60 csk-h20" />
      <Bar className="csk-pill" />
      {Array.from({ length: 2 }, (_, index) => (
        <div className="csk-card csk-pad csk-stack" key={index}>
          <Bar className="csk-w40" />
          <Bar className="csk-w60 csk-h20" />
          <Bar className="csk-w80 csk-h12" />
        </div>
      ))}
      <i className="skeleton csk-row-card" />
      <i className="skeleton csk-row-card" />
    </div>
  ),
};
