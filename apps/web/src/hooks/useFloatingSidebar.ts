import { useCallback, useEffect, useRef, useState } from "react";

const HOVER_OPEN_DELAY_MS = 100;
const HOVER_CLOSE_DELAY_MS = 240;

/** Manual visibility survives pointer exits and navigation; hover previews do not. */
export function useFloatingSidebar(enabled: boolean, locationHref: string, hoverEnabled = enabled) {
  const [state, setState] = useState({
    enabled,
    pinned: false,
    previewHref: null as string | null,
    lastOpenedByHover: false,
  });
  if (state.enabled !== enabled) {
    setState({ enabled, pinned: false, previewHref: null, lastOpenedByHover: false });
  } else if (state.previewHref !== null && (state.previewHref !== locationHref || !hoverEnabled)) {
    setState({ ...state, previewHref: null });
  }

  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressHover = useRef(false);
  const clearTimers = useCallback(() => {
    if (openTimer.current !== null) clearTimeout(openTimer.current);
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  const dismissPreview = useCallback(() => {
    clearTimers();
    // Selecting a thread or closing via the toggle must not reopen under the pointer.
    suppressHover.current = true;
    setState((current) => ({ ...current, previewHref: null }));
  }, [clearTimers]);

  const setPinned = useCallback(
    (pinned: boolean) => {
      clearTimers();
      suppressHover.current = true;
      setState((current) => ({ ...current, pinned, previewHref: null, lastOpenedByHover: false }));
    },
    [clearTimers],
  );
  const togglePinned = useCallback(() => {
    clearTimers();
    suppressHover.current = true;
    setState((current) => ({
      ...current,
      pinned: !current.pinned,
      previewHref: null,
      lastOpenedByHover: false,
    }));
  }, [clearTimers]);

  const retainPreview = useCallback(() => clearTimers(), [clearTimers]);
  const enterBoundary = useCallback(() => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    if (
      !enabled ||
      !hoverEnabled ||
      state.pinned ||
      suppressHover.current ||
      state.previewHref === locationHref
    ) {
      return;
    }
    if (openTimer.current !== null) return;
    // Prepare the hidden floating surface before revealing it, so its first
    // appearance transitions from opacity zero instead of jumping on screen.
    setState((current) =>
      current.lastOpenedByHover ? current : { ...current, lastOpenedByHover: true },
    );
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      setState((current) => ({ ...current, previewHref: locationHref, lastOpenedByHover: true }));
    }, HOVER_OPEN_DELAY_MS);
  }, [enabled, hoverEnabled, locationHref, state.pinned, state.previewHref]);

  const leaveBoundary = useCallback(() => {
    clearTimers();
    suppressHover.current = false;
    if (!enabled || state.pinned || state.previewHref === null) return;
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setState((current) => ({ ...current, previewHref: null }));
    }, HOVER_CLOSE_DELAY_MS);
  }, [clearTimers, enabled, state.pinned, state.previewHref]);

  useEffect(() => {
    if (!enabled || !hoverEnabled) return;
    window.addEventListener("blur", dismissPreview);
    const onPointerLeaveWindow = (event: PointerEvent) => {
      if (event.relatedTarget === null) leaveBoundary();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) dismissPreview();
    };
    document.addEventListener("pointerleave", onPointerLeaveWindow);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("blur", dismissPreview);
      document.removeEventListener("pointerleave", onPointerLeaveWindow);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [dismissPreview, enabled, hoverEnabled, leaveBoundary]);

  useEffect(() => {
    if (!enabled || !hoverEnabled) suppressHover.current = false;
    if (state.previewHref !== locationHref) clearTimers();
    return clearTimers;
  }, [clearTimers, enabled, hoverEnabled, locationHref, state.previewHref]);

  return {
    open: enabled && (state.pinned || state.previewHref === locationHref),
    pinned: state.pinned,
    // Retain the preview's style for its closing fade. Docked sidebars close in their normal style.
    floating: state.lastOpenedByHover,
    setPinned,
    togglePinned,
    enterBoundary,
    leaveBoundary,
    retainPreview,
    dismissPreview,
  };
}
