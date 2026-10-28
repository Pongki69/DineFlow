import { Clock3 } from "lucide-react";

export const outletDays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export function OperatingHoursEditor({ value, onChange, onApplyAll }) {
  const allMatchMonday = outletDays.every((day) =>
    ["open", "close", "closed"].every(
      (key) => value[day][key] === value.monday[key],
    ),
  );
  return (
    <div className="admin-hours-list">
      {outletDays.map((day) => {
        const hours = value[day];
        const mode = hours.closed
          ? "closed"
          : hours.open || hours.close
            ? "custom"
            : "all_day";
        return (
          <fieldset key={day} className="admin-hours-day" data-mode={mode}>
            <legend className="sr-only">{day} operating hours</legend>
            <span className="admin-hours-day-name" aria-hidden="true">
              {day}
            </span>
            <div className="admin-hours-mode">
              <label className="sr-only" htmlFor={`outlet-hours-${day}`}>
                Availability
              </label>
              <select
                id={`outlet-hours-${day}`}
                aria-label={`${day} schedule`}
                value={mode}
                onChange={(event) => {
                  const next = event.target.value;
                  onChange(
                    day,
                    next === "closed"
                      ? { ...hours, closed: true }
                      : next === "all_day"
                        ? { open: "", close: "", closed: false }
                        : {
                            open: hours.open || "09:00",
                            close: hours.close || "18:00",
                            closed: false,
                          },
                  );
                }}
              >
                <option value="all_day">Open all day</option>
                <option value="custom">Custom hours</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            {mode === "custom" ? (
              <div className="admin-hours-window">
                <label>
                  Opens
                  <input
                    type="time"
                    aria-label={`${day} opening time`}
                    value={hours.open || ""}
                    required
                    onChange={(event) =>
                      onChange(day, { ...hours, open: event.target.value })
                    }
                  />
                </label>
                <label>
                  Closes
                  <input
                    type="time"
                    aria-label={`${day} closing time`}
                    value={hours.close || ""}
                    required
                    onChange={(event) =>
                      onChange(day, { ...hours, close: event.target.value })
                    }
                  />
                </label>
                {hours.open && hours.close && hours.close < hours.open && (
                  <small className="admin-hours-overnight">
                    Closes the following day
                  </small>
                )}
              </div>
            ) : null}
          </fieldset>
        );
      })}
      {onApplyAll && (
        <div className="admin-hours-bulk">
          <button
            type="button"
            className="admin-button admin-button--secondary"
            disabled={allMatchMonday}
            title={
              allMatchMonday ? "All days already use the same hours" : undefined
            }
            onClick={() => onApplyAll(value.monday)}
          >
            <Clock3 size={15} aria-hidden="true" />
            Apply Monday’s hours to all days
          </button>
        </div>
      )}
    </div>
  );
}
