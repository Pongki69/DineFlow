import { Polyline } from "react-leaflet";

export function recordedSegments(points = []) {
  const segments = [];
  let segment = [],
    previous = null;
  for (const point of points) {
    const lat = Number(point.latitude),
      lng = Number(point.longitude);
    const at = new Date(point.recorded_at).getTime();
    if (
      point.latitude == null ||
      point.longitude == null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180 ||
      !Number.isFinite(at)
    ) {
      if (segment.length > 1) segments.push(segment);
      segment = [];
      previous = null;
      continue;
    }
    if (previous !== null && (at - previous > 120000 || at < previous)) {
      if (segment.length > 1) segments.push(segment);
      segment = [];
    }
    segment.push([lat, lng]);
    previous = at;
  }
  if (segment.length > 1) segments.push(segment);
  return segments;
}

export function arrivalLabel(value) {
  return value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
}

export function DeliveryArrivalTimes({ times = {}, eta, stale }) {
  return (
    <dl className="delivery-arrival-times" aria-label="Rider arrival times">
      {[
        ["restaurant", "At restaurant"],
        ["picked_up", "Picked up"],
        ["delivered", "Delivered"],
      ].map(([key, label]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>
            {arrivalLabel(times[key]) ? (
              <time
                dateTime={times[key]}
                title={new Date(times[key]).toLocaleString()}
              >
                {arrivalLabel(times[key])}
              </time>
            ) : (
              <span>Not recorded</span>
            )}
          </dd>
        </div>
      ))}
      {eta && !stale && arrivalLabel(eta) && (
        <div>
          <dt>Estimated arrival</dt>
          <dd>
            <time dateTime={eta}>{arrivalLabel(eta)}</time>
          </dd>
        </div>
      )}
    </dl>
  );
}

export function RecordedDeliveryPath({ segments }) {
  return segments.map((positions, index) => (
    <Polyline
      key={index}
      positions={positions}
      pathOptions={{
        color: "#286648",
        weight: 5,
        opacity: 0.95,
        className: "recorded-delivery-path",
      }}
    />
  ));
}

export function DeliveryPathLegend({
  recorded,
  suggested = false,
  remaining = false,
  error = "",
}) {
  return (
    <div className="delivery-path-key">
      <div className="delivery-route-chips">
        {recorded ? (
          <p>
            <span className="delivery-path-swatch" aria-hidden="true" />
            Recorded rider GPS trail
          </p>
        ) : (
          !suggested && !remaining && <p>GPS trail unavailable</p>
        )}
        {suggested && (
          <p>
            <span
              className="delivery-path-swatch suggested"
              aria-hidden="true"
            />
            Suggested route · estimated
          </p>
        )}
        {remaining && (
          <p>
            <span
              className="delivery-path-swatch suggested"
              aria-hidden="true"
            />
            Remaining route · estimated
          </p>
        )}
      </div>
      {(recorded || suggested) && (
        <details className="delivery-route-info">
          <summary>About this route</summary>
          <p>
            {recorded
              ? "Lines connect recorded samples; gaps over two minutes are left open."
              : "Suggested road route · not a record of the path actually taken."}
          </p>
        </details>
      )}
      {error && (
        <p role="status">Route unavailable. Location pins are still shown.</p>
      )}
    </div>
  );
}
