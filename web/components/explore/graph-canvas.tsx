"use client";

import { useEffect, useRef } from "react";
import ForceGraph3D, { type ForceGraphMethods, type ForceGraphProps } from "react-force-graph-3d";
import type * as THREE from "three";

import type { MapProject } from "@/components/explore/star-map";

type GraphNode = MapProject & { x: number; y: number; z: number; fx: number; fy: number; fz: number; size: number; axisScores: Record<string, number>; anchor: { x: number; y: number; z: number } };
type GraphAPI = { scene(): THREE.Scene; camera(): THREE.Camera; cameraPosition(position: { x: number; y: number; z: number }, lookAt?: { x: number; y: number; z: number }, duration?: number): unknown };
type Props = ForceGraphProps<GraphNode> & { onReady: (api: GraphAPI) => void };

export default function GraphCanvas({ onReady, ...props }: Props) {
  const apiRef = useRef<ForceGraphMethods<GraphNode> | undefined>(undefined);
  const notifiedRef = useRef(false);
  useEffect(() => {
    let frame = 0;
    let cancelled = false;
    const checkReady = () => {
      if (cancelled) return;
      const api = apiRef.current;
      const renderer = api?.renderer?.();
      if (api?.scene?.() && api?.camera?.() && renderer?.domElement.isConnected && renderer.getContext()) {
        if (!notifiedRef.current) {
          notifiedRef.current = true;
          onReady(api);
        }
      }
      else frame = window.requestAnimationFrame(checkReady);
    };
    frame = window.requestAnimationFrame(checkReady);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [onReady]);
  return <ForceGraph3D ref={apiRef} {...props} />;
}
