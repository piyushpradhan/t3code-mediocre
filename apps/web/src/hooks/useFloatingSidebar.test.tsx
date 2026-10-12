import { act, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useFloatingSidebar } from "./useFloatingSidebar";

let renderer: ReactTestRenderer;
let sidebar: ReturnType<typeof useFloatingSidebar>;
const windowEvents = new EventTarget();
const documentEvents = new EventTarget();

function Probe({ enabled = true, href = "/thread/one", hoverEnabled = true }) {
  const value = useFloatingSidebar(enabled, href, hoverEnabled);
  useLayoutEffect(() => {
    sidebar = value;
  });
  return null;
}

function advance(ms: number) {
  act(() => vi.advanceTimersByTime(ms));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", windowEvents);
  vi.stubGlobal("document", documentEvents);
  act(() => {
    renderer = create(<Probe />);
  });
});

afterEach(() => {
  act(() => renderer.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("floating sidebar interaction", () => {
  it("ignores a quick pass over the activation region", () => {
    act(() => sidebar.enterBoundary());
    advance(50);
    act(() => sidebar.leaveBoundary());
    advance(500);
    expect(sidebar.open).toBe(false);
  });

  it("keeps a preview open while crossing the gutter or returning during the close delay", () => {
    act(() => sidebar.enterBoundary());
    advance(100);
    expect(sidebar.open).toBe(true);
    expect(sidebar.pinned).toBe(false);

    act(() => sidebar.leaveBoundary());
    advance(180);
    expect(sidebar.open).toBe(true);
    act(() => sidebar.retainPreview());
    advance(500);
    expect(sidebar.open).toBe(true);

    act(() => sidebar.leaveBoundary());
    advance(240);
    expect(sidebar.open).toBe(false);
    expect(sidebar.floating).toBe(true);
  });

  it("pins a hover preview on toggle and stays open across pointer exits, blur and navigation", () => {
    act(() => sidebar.enterBoundary());
    advance(100);
    expect(sidebar.floating).toBe(true);
    act(() => sidebar.togglePinned());
    expect(sidebar.pinned).toBe(true);
    expect(sidebar.floating).toBe(false);

    act(() => {
      sidebar.leaveBoundary();
      windowEvents.dispatchEvent(new Event("blur"));
      sidebar.dismissPreview();
      renderer.update(<Probe href="/thread/two" />);
    });
    advance(500);
    expect(sidebar.open).toBe(true);

    act(() => sidebar.togglePinned());
    expect(sidebar.open).toBe(false);
    expect(sidebar.floating).toBe(false);
    act(() => sidebar.enterBoundary());
    advance(500);
    expect(sidebar.open).toBe(false);

    act(() => {
      sidebar.leaveBoundary();
      sidebar.enterBoundary();
    });
    advance(100);
    expect(sidebar.open).toBe(true);
    expect(sidebar.pinned).toBe(false);
  });

  it("cancels a pending hover close when the toggle pins the sidebar", () => {
    act(() => sidebar.enterBoundary());
    advance(100);
    act(() => sidebar.leaveBoundary());
    advance(100);
    act(() => sidebar.togglePinned());
    advance(500);
    expect(sidebar.open).toBe(true);
    expect(sidebar.pinned).toBe(true);
  });

  it("dismisses a selected thread preview without immediately reopening under the pointer", () => {
    act(() => sidebar.enterBoundary());
    advance(100);
    act(() => {
      sidebar.dismissPreview();
      renderer.update(<Probe href="/thread/two" />);
    });
    expect(sidebar.open).toBe(false);
    act(() => sidebar.enterBoundary());
    advance(500);
    expect(sidebar.open).toBe(false);
  });

  it("cancels pending previews on navigation and does not restore a preview on back navigation", () => {
    act(() => sidebar.enterBoundary());
    advance(50);
    act(() => renderer.update(<Probe href="/thread/two" />));
    advance(500);
    expect(sidebar.open).toBe(false);

    act(() => sidebar.enterBoundary());
    advance(100);
    expect(sidebar.open).toBe(true);
    act(() => renderer.update(<Probe href="/thread/one" />));
    expect(sidebar.open).toBe(false);
    act(() => renderer.update(<Probe href="/thread/two" />));
    expect(sidebar.open).toBe(false);
  });

  it("preserves pinning when hover is unavailable, but clears previews for narrow windows", () => {
    act(() => sidebar.togglePinned());
    act(() => renderer.update(<Probe hoverEnabled={false} />));
    act(() => renderer.update(<Probe hoverEnabled />));
    expect(sidebar.pinned).toBe(true);

    act(() => {
      sidebar.togglePinned();
      sidebar.leaveBoundary();
    });
    act(() => sidebar.enterBoundary());
    advance(100);
    expect(sidebar.open).toBe(true);
    act(() => renderer.update(<Probe hoverEnabled={false} />));
    act(() => renderer.update(<Probe hoverEnabled />));
    expect(sidebar.open).toBe(false);
  });

  it("clears the interaction when the option is disabled and starts hidden when reenabled", () => {
    act(() => sidebar.togglePinned());
    act(() => renderer.update(<Probe enabled={false} />));
    act(() => renderer.update(<Probe />));
    expect(sidebar.open).toBe(false);
    expect(sidebar.pinned).toBe(false);
  });

  it("lets Escape dismiss a preview without changing a pinned sidebar", () => {
    const escape = () => {
      const event = new Event("keydown");
      Object.defineProperty(event, "key", { value: "Escape" });
      documentEvents.dispatchEvent(event);
    };
    act(() => sidebar.enterBoundary());
    advance(100);
    act(escape);
    expect(sidebar.open).toBe(false);

    act(() => sidebar.togglePinned());
    act(escape);
    expect(sidebar.open).toBe(true);
    expect(sidebar.pinned).toBe(true);
  });
});
