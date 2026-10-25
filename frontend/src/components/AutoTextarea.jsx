import { forwardRef, useCallback, useLayoutEffect, useRef } from "react";

export const AutoTextarea = forwardRef(function AutoTextarea(
  { onInput, value, defaultValue, rows = 2, ...props },
  forwardedRef,
) {
  const field = useRef(null);
  const resize = useCallback(() => {
    const element = field.current;
    if (!element || !element.getClientRects().length) return;
    const style = getComputedStyle(element);
    const border =
      parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const padding =
      parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const lineHeight =
      parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
    const minimum = Math.max(
      parseFloat(style.minHeight) || 0,
      element.rows * lineHeight + padding + border,
    );
    const maximum = Math.min(
      parseFloat(style.maxHeight) || 240,
      window.innerHeight * 0.4,
    );
    element.style.height = "auto";
    const height = Math.max(minimum, element.scrollHeight + border);
    element.style.height = `${Math.min(height, maximum)}px`;
    element.style.overflowY = height > maximum ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    resize();
  }, [resize, value, defaultValue, rows]);
  useLayoutEffect(() => {
    const element = field.current;
    let lastWidth = -1;
    let resizeFrame;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width !== lastWidth) {
        lastWidth = entry.contentRect.width;
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(resize);
      }
    });
    observer.observe(element);
    let resetFrame;
    const reset = () => {
      resetFrame = requestAnimationFrame(resize);
    };
    const form = element.form;
    form?.addEventListener("reset", reset);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
      cancelAnimationFrame(resetFrame);
      form?.removeEventListener("reset", reset);
      window.removeEventListener("resize", resize);
    };
  }, [resize]);

  return (
    <textarea
      {...props}
      rows={rows}
      value={value}
      defaultValue={defaultValue}
      ref={(element) => {
        field.current = element;
        if (typeof forwardedRef === "function") forwardedRef(element);
        else if (forwardedRef) forwardedRef.current = element;
      }}
      onInput={(event) => {
        resize();
        onInput?.(event);
      }}
    />
  );
});
