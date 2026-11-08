import { useEffect, useRef, useState } from "react";

// `format` turns the number into text (for example money); by default it
// shows `decimals` places.
export function CountUp({ value, decimals = 0, format }) {
  const target = Number(value) || 0;
  const current = useRef(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const from = current.current;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let frame;
    let started;
    function tick(time) {
      started ??= time;
      const progress = reducedMotion ? 1 : Math.min((time - started) / 750, 1);
      const eased = 1 - (1 - progress) ** 3;
      current.current = from + (target - from) * eased;
      setDisplay(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    if (from !== target) frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  const text = (number) =>
    format
      ? format(decimals ? number : Math.round(number))
      : number.toFixed(decimals);
  return (
    <span className="count-up">
      <span className="sr-only">{text(target)}</span>
      <span aria-hidden="true">{text(display)}</span>
    </span>
  );
}
