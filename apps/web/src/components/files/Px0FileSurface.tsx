import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { type ReactNode, memo, useEffect, useMemo, useRef, useState } from "react";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import { px0File } from "~/state/projects";

import { FileSurfaceLoading } from "./fileSurfaceChrome";

/** Lines per px0 request. One chunk is one fetch and one innerHTML write. */
const CHUNK_LINES = 256;
/** Fixed row height keeps virtualization pure arithmetic: no measuring. */
const LINE_HEIGHT_PX = 20;

interface Px0Target {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly path: string;
}

function chunkAtom(target: Px0Target, index: number) {
  return px0File({
    environmentId: target.environmentId,
    input: {
      cwd: target.cwd,
      path: target.path,
      start: index * CHUNK_LINES,
      count: CHUNK_LINES,
    },
  });
}

/**
 * One window of px0 lines. px0 returns Chroma-highlighted HTML with the file
 * text already escaped, so the whole chunk is written as a single innerHTML.
 */
const Px0Chunk = memo(function Px0Chunk(props: { target: Px0Target; index: number }) {
  const result = useAtomValue(chunkAtom(props.target, props.index));
  const data = Option.getOrNull(AsyncResult.value(result));
  const html = useMemo(() => {
    if (!data) return "";
    let out = "";
    for (let i = 0; i < data.lines.length; i += 1) {
      out += `<div class="px0-row"><span class="px0-ln">${data.start + i + 1}</span><span class="px0-code">${data.lines[i]}</span></div>`;
    }
    return out;
  }, [data]);
  return (
    <div
      className="px0-chunk"
      style={{ top: props.index * CHUNK_LINES * LINE_HEIGHT_PX }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

/**
 * Read-only workspace file view backed by px0. Only the chunks in view (plus
 * one on each side) are fetched and mounted, so a 100k-line file costs the same
 * as a 500-line one. Falls back to `fallback` when px0 cannot read the path
 * (binary missing, directory, unreadable file).
 */
export function Px0FileSurface(props: {
  environmentId: EnvironmentId;
  cwd: string;
  relativePath: string;
  revealLine: number | null;
  revealRequestId: number;
  workspaceMutationId: string | null;
  fallback: () => ReactNode;
}) {
  const { environmentId, cwd, relativePath, revealLine, revealRequestId, workspaceMutationId } =
    props;
  const target = useMemo<Px0Target>(
    () => ({ environmentId, cwd, path: relativePath }),
    [environmentId, cwd, relativePath],
  );
  const head = useAtomValue(chunkAtom(target, 0));
  const headData = Option.getOrNull(AsyncResult.value(head));
  const total = headData?.total ?? 0;
  const chunkCount = Math.ceil(total / CHUNK_LINES);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ first: 0, last: 0 });
  const fetchedRef = useRef(new Set<number>());

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const chunkPx = CHUNK_LINES * LINE_HEIGHT_PX;
    const updateRange = () => {
      const first = Math.max(0, Math.floor(el.scrollTop / chunkPx) - 1);
      const last = Math.min(
        Math.max(0, chunkCount - 1),
        Math.floor((el.scrollTop + el.clientHeight) / chunkPx) + 1,
      );
      // Chunk granularity: scrolling re-renders only when a chunk boundary is crossed.
      setRange((current) =>
        current.first === first && current.last === last ? current : { first, last },
      );
    };
    updateRange();
    el.addEventListener("scroll", updateRange, { passive: true });
    const observer = new ResizeObserver(updateRange);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", updateRange);
      observer.disconnect();
    };
  }, [chunkCount]);

  useEffect(() => {
    for (let index = range.first; index <= range.last; index += 1) fetchedRef.current.add(index);
  }, [range]);

  // A workspace mutation invalidates every window read so far, on or off screen.
  const seenMutationRef = useRef(workspaceMutationId);
  useEffect(() => {
    if (seenMutationRef.current === workspaceMutationId) return;
    seenMutationRef.current = workspaceMutationId;
    appAtomRegistry.refresh(chunkAtom(target, 0));
    for (const index of fetchedRef.current) {
      if (index !== 0) appAtomRegistry.refresh(chunkAtom(target, index));
    }
  }, [target, workspaceMutationId]);

  const targetLine =
    revealLine === null || total === 0 ? null : Math.min(Math.max(1, revealLine), total);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || targetLine === null) return;
    el.scrollTop = Math.max(
      0,
      (targetLine - 1) * LINE_HEIGHT_PX - el.clientHeight / 2 + LINE_HEIGHT_PX / 2,
    );
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- A repeated link to the same line scrolls again.
  }, [targetLine, revealRequestId]);

  if (head._tag === "Failure") return props.fallback();
  if (!headData) return <FileSurfaceLoading />;

  const chunks: number[] = [];
  for (let index = range.first; index <= range.last && index < chunkCount; index += 1) {
    chunks.push(index);
  }

  return (
    <div
      ref={scrollRef}
      className="px0-view min-h-0 flex-1 overflow-auto"
      style={
        {
          "--px0-gutter": `${String(total).length + 2}ch`,
          "--px0-line": `${LINE_HEIGHT_PX}px`,
        } as React.CSSProperties
      }
    >
      <div
        className="relative"
        style={{
          height: total * LINE_HEIGHT_PX,
          minWidth: `calc(var(--px0-gutter) + ${headData.maxCols}ch + 2rem)`,
        }}
      >
        {targetLine !== null ? (
          <div className="px0-reveal" style={{ top: (targetLine - 1) * LINE_HEIGHT_PX }} />
        ) : null}
        {chunks.map((index) => (
          <Px0Chunk key={index} target={target} index={index} />
        ))}
      </div>
    </div>
  );
}
