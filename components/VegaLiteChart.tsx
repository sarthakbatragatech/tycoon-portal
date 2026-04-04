// @ts-nocheck
"use client";

import { useEffect, useRef } from "react";

type VegaLiteSpec = any;

type Props = {
  spec: VegaLiteSpec;
  height?: number;
  showActions?: boolean;
};

export default function VegaLiteChart({ spec, height = 260, showActions = true }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let view: any;
    let cancelled = false;

    (async () => {
      try {
        const embedModule = await import("vega-embed");
        const embed = embedModule.default;

        if (!containerRef.current || cancelled) return;

        const result = await embed(
          containerRef.current,
          {
            ...spec,
            height,
          },
          {
            actions: showActions
              ? {
                  export: true,
                  source: false,
                  editor: true,
                }
              : false,
            tooltip: true,
          }
        );

        view = result.view;
      } catch (err) {
        console.error("Error rendering VegaLite chart", err);
      }
    })();

    return () => {
      cancelled = true;
      if (view) {
        view.finalize?.();
      }
    };
  }, [spec, height, showActions]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", minHeight: height + 30 }}
    />
  );
}
