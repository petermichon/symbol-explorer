import { useEffect, useRef, useState, useMemo, useCallback, Fragment } from "react";
import { createPortal } from "react-dom";
import * as d3 from "d3";
import {
  Eye,
  EyeOff,
  CopyPlus,
  CopyMinus,
  Menu,
  Eye as EyeOpen,
  Lock,
  Unlock,
  Play,
  Pause,
  RefreshCw,
  Settings,
  Folder,
  FolderGit2,
  FolderOpen,
  X,
  FileBox,
  FileCode2,
  Circle,
  ChevronRight,
  FunctionSquare,
  Asterisk,
  Box,
  ListOrdered,
  Cuboid,
  Layers2,
} from "lucide-react";
import "./index.css";
import {
  parseFilesMinimal,
  ParsedData,
  buildGraphFromMinimal,
} from "./browserParser";

// Generic tree data structure
export interface TreeNode<T = any> {
  id: string;
  data: T;
  children: TreeNode<T>[];
  isExpanded?: boolean;
  isHidden?: boolean;
}

export interface TreeConfig<T = any> {
  renderNode: (node: TreeNode<T>) => React.ReactNode;
  expandedNodes: Set<string>;
  hiddenNodes: Set<string>;
}

// Generic Tree component
function Tree<T>({
  nodes,
  config,
}: {
  nodes: TreeNode<T>[];
  config: TreeConfig<T>;
}) {
  const { renderNode, expandedNodes, hiddenNodes } = config;

  function renderTreeNode(
    node: TreeNode<T>,
    depth: number = 0,
    parentHidden: boolean = false,
  ): React.ReactNode {
    const isExpanded = expandedNodes.has(node.id);
    // Normalize node ID for hidden check (remove .ts extension)
    const normalizedId = node.id.replace(".ts", "");
    const isHidden = parentHidden || hiddenNodes.has(normalizedId);

    return (
      <>
        <div style={{ marginLeft: `${depth * 16}px` }}>
          {renderNode({
            ...node,
            isExpanded,
            isHidden,
          })}
        </div>
        {isExpanded && node.children.length > 0 && (
          <>
            {node.children.map((child) => (
              <Fragment key={child.id}>
                {renderTreeNode(child, depth + 1, isHidden)}
              </Fragment>
            ))}
          </>
        )}
      </>
    );
  }

  return <>{nodes.map((node) => <Fragment key={node.id}>{renderTreeNode(node)}</Fragment>)}</>;
}

// IndexedDB helper for persisting directory handles
async function openDirectoryDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("SymbolExplorerDB", 2);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("directories")) {
        const store = db.createObjectStore("directories", { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

function ViewModeButton({
  mode,
  label,
  currentViewMode,
  onClick,
}: {
  mode: string;
  label: string;
  currentViewMode: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded text-sm cursor-pointer ${currentViewMode === mode ? "bg-neutral-700 text-neutral-50" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"}`}
    >
      {label}
    </button>
  );
}

function Tooltip({
  children,
  content,
}: {
  children: React.ReactNode;
  content: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left + rect.width / 2,
      });
    }
    setIsVisible(true);
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setIsVisible(false)}
        className="relative inline-block"
      >
        {children}
      </div>
      {isVisible && (
        <div
          className="fixed z-9999 px-3 py-1.5 text-xs text-white bg-neutral-800 rounded-lg shadow-lg border border-neutral-700 whitespace-nowrap pointer-events-none"
          style={{
            top: position.top,
            left: position.left,
            transform: "translateX(-50%)",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          {content}
        </div>
      )}
    </>
  );
}

function ModuleListItem({
  name,
  icon,
  count,
  type,
  isHidden,
  onClick,
  onHover,
  onLeave,
  onToggleVisibility,
  chevron,
}: any) {
  return (
    <div
      onClick={onClick}
      className="w-full text-left px-2 py-1 text-sm font-medium text-neutral-300 hover:bg-neutral-700 rounded flex items-center justify-between cursor-pointer group"
      style={{ opacity: isHidden ? 0.5 : 1, userSelect: "none" }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <div className="flex items-center gap-1 overflow-hidden">
        <span
          className="shrink-0"
          style={{
            width: 14,
            display: "inline-flex",
            justifyContent: "center",
          }}
        >
          {chevron}
        </span>
        <span className="shrink-0">{icon}</span>
        <span className="truncate text-neutral-300">{name}</span>
        {count !== undefined && (
          <span className="text-neutral-500 text-sm shrink-0">({count})</span>
        )}
        {type && (
          <span className="text-neutral-600 text-xs shrink-0">{type}</span>
        )}
      </div>
      {onToggleVisibility && (
        <Tooltip content={isHidden ? "Show" : "Hide"}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility();
            }}
            className={`${isHidden ? "block" : "hidden group-hover:block"} cursor-pointer text-neutral-300`}
          >
            {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </Tooltip>
      )}
    </div>
  );
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resizeRef = useRef<(() => void) | null>(null);
  const sidebarOpenRef = useRef(false);
  const simulationRef = useRef<any>(null);
  const polyBlocksDataRef = useRef<any[] | null>(null);
  const polyBlocksRectsRef = useRef<{ treemapSize: number; rects: Map<string, { x0: number; y0: number; x1: number; y1: number }> }>({ treemapSize: 0, rects: new Map() });
  const emptyModulePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const drawRef = useRef<(() => void) | null>(null);
  const hoveredNodeRef = useRef<any>(null);
  const hoverFromTreeRef = useRef(false);
  const mousePositionRef = useRef({ x: 0, y: 0 });
  const mouseOverCanvasRef = useRef(false);
  const selectedNodeRef = useRef<string | null>(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const dprRef = useRef(window.devicePixelRatio || 1);
  const fileLevelEdgesRef = useRef<{ key: string; sx: number; sy: number; tx: number; ty: number; label: string }[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem("sidebarOpen");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [rightSidebarOpen, setRightSidebarOpen] = useState(() => {
    const saved = localStorage.getItem("rightSidebarOpen");
    return saved !== null ? JSON.parse(saved) : false;
  });
  const rightSidebarOpenRef = useRef(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("expandedModules");
    return saved !== null ? new Set(JSON.parse(saved)) : new Set();
  });
  const [hiddenPaths, setHiddenPaths] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("hiddenPaths");
    return saved !== null ? new Set(JSON.parse(saved)) : new Set();
  });
  const [hiddenSymbols, setHiddenSymbols] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("hiddenSymbols");
    return saved !== null ? new Set(JSON.parse(saved)) : new Set();
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredEdges, setHoveredEdges] = useState<any[]>([]);
  const hoveredEdgesRef = useRef<any[]>([]);
  const [simulationLocked, setSimulationLocked] = useState(false);
  const simulationLockedRef = useRef(false);

  // Sync hoveredEdges ref with state
  useEffect(() => {
    hoveredEdgesRef.current = hoveredEdges;
  }, [hoveredEdges]);
  const [forcesEnabled, setForcesEnabled] = useState(false);
  const forcesEnabledRef = useRef(false);
  const [chargeStrength, setChargeStrength] = useState(() => {
    const saved = localStorage.getItem("chargeStrength");
    return saved !== null ? JSON.parse(saved) : -1000;
  });
  const [linkDistance, setLinkDistance] = useState(() => {
    const saved = localStorage.getItem("linkDistance");
    return saved !== null ? JSON.parse(saved) : 30;
  });
  const [alphaDecayValue, setAlphaDecayValue] = useState(() => {
    const saved = localStorage.getItem("alphaDecayValue");
    return saved !== null ? JSON.parse(saved) : 0.0228;
  });
  const [edgeOpacity, setEdgeOpacity] = useState(() => {
    const saved = localStorage.getItem("edgeOpacity");
    return saved !== null ? JSON.parse(saved) : 0.5;
  });
  const [groupCohesionStrength, setGroupCohesionStrength] = useState(1);
  const [collisionStrength, setCollisionStrength] = useState(1);
  const [repelStrength, setRepelStrength] = useState(0);
  const [crossFileEdgeStrength, setCrossFileEdgeStrength] = useState(0.3);
  const [viewMode, setViewMode] = useState<
    | "edges"
    | "circles"
    | "boxes"
    | "para-fillet"
    | "para-bezier"
    | "para-subdiv"
    | "expand-poly"
    | "circle-poly"
    | "ellipse-wrap"
    | "oriented-rect"
    | "oriented-rect-rounded"
    | "oriented-rect-roundpoly"
    | "oriented-rect-roundpoly2"
    | "poly-solid"
    | "poly-blocks"
  >("poly-blocks");

  function groupCohesionForce(strength: number, colStrength: number, repelStrength: number, legacy: boolean) {
    let nodes: any[];
    function force(alpha: number) {
      const groups = new Map<string, any[]>();
      nodes.forEach((node: any) => {
        if (!node._debug) node._debug = {};
        node._debug.edgePush = [0, 0];
        node._debug.groupPush = [0, 0];
        node._debug.crossFile = [0, 0];
        const file = node.data?.file;
        const folder = node.data?.folder || "";
        if (!file) return;
        const key = folder ? `${folder}/${file}` : file;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(node);
      });

      if (legacy) {
        const groupBounds = new Map<string, { cx: number; cy: number; radius: number }>();
        groups.forEach((groupNodes, key) => {
          const cx = groupNodes.reduce((s, n) => s + n.x, 0) / groupNodes.length;
          const cy = groupNodes.reduce((s, n) => s + n.y, 0) / groupNodes.length;
          const maxDist = Math.max(...groupNodes.map((n: any) => Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2))) || 1;
          const groupRadius = maxDist + 15;
          groupBounds.set(key, { cx, cy, radius: groupRadius });
          groupNodes.forEach((node: any) => {
            const dx = node.x - cx;
            const dy = node.y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const boundary = groupRadius - 15;
            if (dist > boundary) {
              const overlap = dist - boundary;
              node.vx -= (dx / dist) * overlap * strength * alpha;
              node.vy -= (dy / dist) * overlap * strength * alpha;
            }
          });
        });
        const keys = Array.from(groupBounds.keys());
        for (let i = 0; i < keys.length; i++) {
          for (let j = i + 1; j < keys.length; j++) {
            const a = groupBounds.get(keys[i])!;
            const b = groupBounds.get(keys[j])!;
            const dx = b.cx - a.cx;
            const dy = b.cy - a.cy;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const minDist = a.radius + b.radius;
            if (dist < minDist) {
              const overlap = minDist - dist;
              const pushX = (dx / dist) * overlap * strength * alpha;
              const pushY = (dy / dist) * overlap * strength * alpha;
              const groupA = groups.get(keys[i])!;
              const groupB = groups.get(keys[j])!;
              groupA.forEach((n: any) => { n.vx -= pushX; n.vy -= pushY; });
              groupB.forEach((n: any) => { n.vx += pushX; n.vy += pushY; });
            }
          }
        }
        return;
      }

      const groupHulls = new Map<string, [number, number][]>();
      const groupCircles = new Map<string, { cx: number; cy: number; radius: number }>();
      const edgePadding = 15;
      groups.forEach((groupNodes, key) => {
        const cx = groupNodes.reduce((s, n) => s + n.x, 0) / groupNodes.length;
        const cy = groupNodes.reduce((s, n) => s + n.y, 0) / groupNodes.length;

        if (groupNodes.length >= 3) {
          const pts: [number, number][] = groupNodes.map((n: any) => [n.x, n.y]);
          const hull = d3.polygonHull(pts) as [number, number][] | null;
          if (hull && hull.length >= 3) {
            // Expand hull outward by 15px with rounded corners matching visual
            const r = 15;
            const arcSegs = 4;  // vertices per arc (excluding endpoints)
            // Precompute outward perp for each edge
            const perps: [number, number][] = [];
            const n = hull.length;
            for (let i = 0; i < n; i++) {
              const curr = hull[i];
              const next = hull[(i + 1) % n];
              const ex = next[0] - curr[0], ey = next[1] - curr[1];
              const len = Math.sqrt(ex * ex + ey * ey) || 1;
              let px = -ey / len, py = ex / len;
              const cx = (curr[0] + next[0]) / 2, cy = (curr[1] + next[1]) / 2;
              if (px * cx + py * cy > 0) { px = -px; py = -py; }
              perps.push([px, py]);
            }
            const offsetHull: [number, number][] = [];
            for (let i = 0; i < n; i++) {
              const curr = hull[i];
              const p_in = perps[(i - 1 + n) % n];   // perp of edge (i-1→i)
              const p_out = perps[i];                  // perp of edge (i→i+1)
              // End of straight offset edge (i-1→i) = start of arc
              offsetHull.push([curr[0] + p_in[0] * r, curr[1] + p_in[1] * r]);
              // Arc vertices around curr connecting p_in to p_out
              const sa = Math.atan2(p_in[1], p_in[0]);
              let ea = Math.atan2(p_out[1], p_out[0]);
              const cross = p_in[0] * p_out[1] - p_in[1] * p_out[0];
              if (cross < 0) { if (ea < sa) ea += 2 * Math.PI; }
              else { if (ea > sa) ea -= 2 * Math.PI; }
              for (let k = 1; k <= arcSegs; k++) {
                const a = sa + (ea - sa) * k / (arcSegs + 1);
                offsetHull.push([curr[0] + Math.cos(a) * r, curr[1] + Math.sin(a) * r]);
              }
              // End of arc = start of next straight offset edge
              offsetHull.push([curr[0] + p_out[0] * r, curr[1] + p_out[1] * r]);
            }
            groupHulls.set(key, offsetHull);
            groupNodes.forEach((node: any) => {
              let minDist = Infinity;
              let pushDir: [number, number] = [0, 0];
              for (let i = 0; i < offsetHull.length; i++) {
                const j = (i + 1) % offsetHull.length;
                const ax = offsetHull[i][0], ay = offsetHull[i][1];
                const bx = offsetHull[j][0], by = offsetHull[j][1];
                const ex2 = bx - ax, ey2 = by - ay;
                const eLen = Math.sqrt(ex2 * ex2 + ey2 * ey2);
                if (eLen < 1e-10) continue;
                const t = Math.max(0, Math.min(1, ((node.x - ax) * ex2 + (node.y - ay) * ey2) / (eLen * eLen)));
                const ppx = ax + ex2 * t, ppy = ay + ey2 * t;
                const ddx = node.x - ppx, ddy = node.y - ppy;
                const d = Math.sqrt(ddx * ddx + ddy * ddy);
                if (d < minDist) {
                  minDist = d;
                  let nx2 = -ey2 / eLen, ny2 = ex2 / eLen;
                  if (nx2 * (cx - ax) + ny2 * (cy - ay) < 0) { nx2 = -nx2; ny2 = -ny2; }
                  pushDir = [nx2, ny2];
                }
              }
              if (minDist < edgePadding) {
                const overlap = edgePadding - minDist;
                const cdx = cx - node.x, cdy = cy - node.y;
                const cDist = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
                const bw = Math.min(cDist / edgePadding, 1);
                const dx2 = (1 - bw) * pushDir[0] + bw * (cdx / cDist);
                const dy2 = (1 - bw) * pushDir[1] + bw * (cdy / cDist);
                const dl = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
                const fx = (dx2 / dl) * overlap * strength * alpha;
                const fy = (dy2 / dl) * overlap * strength * alpha;
                node.vx += fx;
                node.vy += fy;
                node._debug.edgePush = [node._debug.edgePush[0] + fx, node._debug.edgePush[1] + fy];
              }
            });
            return;
          }
        }

        if (groupNodes.length === 2) {
          const p1 = groupNodes[0], p2 = groupNodes[1];
          const zoneSize = 10;
          // Capsule hull with rounded ends matching visible polygon
          const ex = p2.x - p1.x, ey = p2.y - p1.y;
          const len = Math.sqrt(ex * ex + ey * ey) || 1;
          const ux = ex / len, uy = ey / len;
          const vx = -uy, vy = ux;
          const r = 15;
          const capPts: [number, number][] = [];
          capPts.push([p1.x + r * vx, p1.y + r * vy]);                      // top of p1
          capPts.push([p2.x + r * vx, p2.y + r * vy]);                      // top of p2
          for (let i = 1; i < 4; i++) {                                     // right end cap intermediates
            const a = Math.PI / 2 - (Math.PI * i) / 4;
            capPts.push([p2.x + r * (Math.cos(a) * ux + Math.sin(a) * vx), p2.y + r * (Math.cos(a) * uy + Math.sin(a) * vy)]);
          }
          capPts.push([p2.x - r * vx, p2.y - r * vy]);                      // bottom of p2
          capPts.push([p1.x - r * vx, p1.y - r * vy]);                      // bottom of p1
          for (let i = 1; i < 4; i++) {                                     // left end cap intermediates (use -ux for outward)
            const a = -Math.PI / 2 + (Math.PI * i) / 4;
            capPts.push([p1.x + r * (-Math.cos(a) * ux + Math.sin(a) * vx), p1.y + r * (-Math.cos(a) * uy + Math.sin(a) * vy)]);
          }
          groupHulls.set(key, capPts);
          // Intra-group: individual zones + spring
          groupNodes.forEach((node) => {
            const zh: [number, number][] = [
              [node.x - zoneSize, node.y - zoneSize],
              [node.x + zoneSize, node.y - zoneSize],
              [node.x + zoneSize, node.y + zoneSize],
              [node.x - zoneSize, node.y + zoneSize],
            ];
            let minDist = Infinity;
            let pushDir: [number, number] = [0, 0];
            for (let i = 0; i < zh.length; i++) {
              const j = (i + 1) % zh.length;
              const ax = zh[i][0], ay = zh[i][1];
              const bx = zh[j][0], by = zh[j][1];
              const ex2 = bx - ax, ey2 = by - ay;
              const eLen = Math.sqrt(ex2 * ex2 + ey2 * ey2);
              if (eLen < 1e-10) continue;
              const t = Math.max(0, Math.min(1, ((node.x - ax) * ex2 + (node.y - ay) * ey2) / (eLen * eLen)));
              const ppx = ax + ex2 * t, ppy = ay + ey2 * t;
              const ddx = node.x - ppx, ddy = node.y - ppy;
              const d = Math.sqrt(ddx * ddx + ddy * ddy);
              if (d < minDist) {
                minDist = d;
                let nx2 = -ey2 / eLen, ny2 = ex2 / eLen;
                if (nx2 * (cx - ax) + ny2 * (cy - ay) < 0) { nx2 = -nx2; ny2 = -ny2; }
                pushDir = [nx2, ny2];
              }
            }
            if (minDist < zoneSize) {
              const overlap = zoneSize - minDist;
              const cdx = cx - node.x, cdy = cy - node.y;
              const cDist = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
              const bw = Math.min(cDist / zoneSize, 1);
              const dx2 = (1 - bw) * pushDir[0] + bw * (cdx / cDist);
              const dy2 = (1 - bw) * pushDir[1] + bw * (cdy / cDist);
              const dl = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
              const fx = (dx2 / dl) * overlap * strength * alpha;
              const fy = (dy2 / dl) * overlap * strength * alpha;
              node.vx += fx;
              node.vy += fy;
              node._debug.edgePush = [node._debug.edgePush[0] + fx, node._debug.edgePush[1] + fy];
            }
          });
          const ex2 = p2.x - p1.x, ey2 = p2.y - p1.y;
          const dist = Math.sqrt(ex2 * ex2 + ey2 * ey2) || 1;
          const f = (dist - 25) * 0.05 * alpha;
          p1.vx += (ex2 / dist) * f;
          p1.vy += (ey2 / dist) * f;
          p2.vx -= (ex2 / dist) * f;
          p2.vy -= (ey2 / dist) * f;
          return;
        }

        // 1 node: true circle (radius 15)
        groupCircles.set(key, { cx, cy, radius: 15 });

        groupNodes.forEach((node: any) => {
          const dx = node.x - cx;
          const dy = node.y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist > 15) {
            const overlap = dist - 15;
            const fx = -(dx / dist) * overlap * strength * alpha;
            const fy = -(dy / dist) * overlap * strength * alpha;
            node.vx += fx;
            node.vy += fy;
            node._debug.edgePush = [node._debug.edgePush[0] + fx, node._debug.edgePush[1] + fy];
          }
        });
      });

      // Polygon-polygon contact collision via SAT
      const satContact = (aPts: [number, number][], bPts: [number, number][], pad = 0) => {
        const axes: [number, number][] = [];
        for (const verts of [aPts, bPts]) {
          for (let i = 0; i < verts.length; i++) {
            const j = (i + 1) % verts.length;
            const ex = verts[j][0] - verts[i][0];
            const ey = verts[j][1] - verts[i][1];
            const len = Math.sqrt(ex * ex + ey * ey);
            if (len < 1e-10) continue;
            axes.push([-ey / len, ex / len]);
          }
        }
        let bestAxis: [number, number] = [0, 1];
        let minOverlap = Infinity;
        let pushPositive = false;
        for (const axis of axes) {
          let minA = Infinity, maxA = -Infinity;
          let minB = Infinity, maxB = -Infinity;
          for (const v of aPts) {
            const p = v[0] * axis[0] + v[1] * axis[1];
            if (p < minA) minA = p;
            if (p > maxA) maxA = p;
          }
          for (const v of bPts) {
            const p = v[0] * axis[0] + v[1] * axis[1];
            if (p < minB) minB = p;
            if (p > maxB) maxB = p;
          }
          const gap = Math.max(minB - maxA, minA - maxB);
          if (gap > 0) return null;
          const t1 = maxA - minB;
          const t2 = maxB - minA;
          const overlap = t1 < t2 ? t1 : t2;
          if (overlap < minOverlap) {
            minOverlap = overlap;
            bestAxis = axis;
            pushPositive = t2 < t1;
          }
        }
        const normal: [number, number] = pushPositive ? bestAxis : [-bestAxis[0], -bestAxis[1]];
        return { normal, depth: minOverlap + pad };
      };

      const applyPush = (groupA: any[], groupB: any[], nx: number, ny: number, depth: number) => {
        const k = colStrength * alpha * 1;
        const px = nx * depth * k;
        const py = ny * depth * k;
        groupA.forEach((n: any) => {
          n.vx += px; n.vy += py;
          n._debug.groupPush = [n._debug.groupPush[0] + px, n._debug.groupPush[1] + py];
        });
        groupB.forEach((n: any) => {
          n.vx -= px; n.vy -= py;
          n._debug.groupPush = [n._debug.groupPush[0] - px, n._debug.groupPush[1] - py];
        });
      };

      const hullKeys = Array.from(groupHulls.keys());
      const circleKeys = Array.from(groupCircles.keys());

      // hull vs hull (SAT)
      for (let i = 0; i < hullKeys.length; i++) {
        for (let j = i + 1; j < hullKeys.length; j++) {
          const result = satContact(groupHulls.get(hullKeys[i])!, groupHulls.get(hullKeys[j])!, 10);
          if (result) {
            applyPush(
              groups.get(hullKeys[i])!,
              groups.get(hullKeys[j])!,
              result.normal[0], result.normal[1], result.depth,
            );
          }
        }
      }

      // hull vs circle
      for (const hKey of hullKeys) {
        const hull = groupHulls.get(hKey)!;
        for (const cKey of circleKeys) {
          const circ = groupCircles.get(cKey)!;
          let minDistSq = Infinity;
          let closestX = 0, closestY = 0;
          for (let i = 0; i < hull.length; i++) {
            const j = (i + 1) % hull.length;
            const ax = hull[i][0], ay = hull[i][1];
            const bx = hull[j][0], by = hull[j][1];
            const ex = bx - ax, ey = by - ay;
            const elen2 = ex * ex + ey * ey;
            if (elen2 < 1e-10) continue;
            const t = Math.max(0, Math.min(1, ((circ.cx - ax) * ex + (circ.cy - ay) * ey) / elen2));
            const ppx = ax + ex * t, ppy = ay + ey * t;
            const ddx = circ.cx - ppx, ddy = circ.cy - ppy;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 < minDistSq) {
              minDistSq = d2;
              closestX = ppx; closestY = ppy;
            }
          }
          const dist = Math.sqrt(minDistSq);
          if (dist < circ.radius) {
            const overlap = circ.radius - dist;
            const nx = dist > 0.01 ? (circ.cx - closestX) / dist : 0;
            const ny = dist > 0.01 ? (circ.cy - closestY) / dist : 1;
            applyPush(groups.get(cKey)!, groups.get(hKey)!, nx, ny, overlap);
          }
        }
      }

      // circle vs circle
      for (let i = 0; i < circleKeys.length; i++) {
        for (let j = i + 1; j < circleKeys.length; j++) {
          const a = groupCircles.get(circleKeys[i])!;
          const b = groupCircles.get(circleKeys[j])!;
          const dx = b.cx - a.cx;
          const dy = b.cy - a.cy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < a.radius + b.radius) {
            const overlap = a.radius + b.radius - dist;
            const nx = dx / dist, ny = dy / dist;
            applyPush(groups.get(circleKeys[i])!, groups.get(circleKeys[j])!, -nx, -ny, overlap);
          }
        }
      }

      // Inter-group node repulsion (all nodes repel nodes in other groups)
      if (repelStrength > 0 && nodes.length < 400) {
        const nodeList = Array.from(groups.values()).flat();
        for (let i = 0; i < nodeList.length; i++) {
          const a = nodeList[i];
          const aKey = (a.data?.folder || "") + "/" + (a.data?.file || "");
          for (let j = i + 1; j < nodeList.length; j++) {
            const b = nodeList[j];
            const bKey = (b.data?.folder || "") + "/" + (b.data?.file || "");
            if (aKey === bKey) continue;
            const dx = a.x - b.x, dy = a.y - b.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const f = repelStrength / (dist * dist);
            const fx = (dx / dist) * f * alpha;
            const fy = (dy / dist) * f * alpha;
            a.vx += fx; a.vy += fy;
            b.vx -= fx; b.vy -= fy;
          }
        }
      }
    }
    force.initialize = (n: any[]) => { nodes = n; };
    return force;
  }

  function crossFileEdgeForce(edges: any[], strength: number, legacy: boolean) {
    let nodeMap: Map<string, any>;
    function force(alpha: number) {
      if (legacy) {
        edges.forEach((edge: any) => {
          const source = typeof edge.source === "string" ? nodeMap.get(edge.source) : edge.source;
          const target = typeof edge.target === "string" ? nodeMap.get(edge.target) : edge.target;
          if (!source || !target) return;
          const sourceFile = source.data?.file;
          const sourceFolder = source.data?.folder || "";
          const targetFile = target.data?.file;
          const targetFolder = target.data?.folder || "";
          if (!sourceFile || !targetFile) return;
          const sourceKey = sourceFolder ? `${sourceFolder}/${sourceFile}` : sourceFile;
          const targetKey = targetFolder ? `${targetFolder}/${targetFile}` : targetFile;
          if (sourceKey === targetKey) return;
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = (dist - 30) * strength * alpha;
          const sfx = (dx / dist) * f;
          const sfy = (dy / dist) * f;
          source.vx += sfx;
          source.vy += sfy;
          target.vx -= sfx;
          target.vy -= sfy;
        });
        return;
      }

      const groups = new Map<string, { nodes: any[]; fx: number; fy: number }>();
      nodeMap.forEach((node) => {
        const file = node.data?.file;
        const folder = node.data?.folder || "";
        if (!file) return;
        const key = folder ? `${folder}/${file}` : file;
        if (!groups.has(key)) groups.set(key, { nodes: [], fx: 0, fy: 0 });
        groups.get(key)!.nodes.push(node);
      });

      edges.forEach((edge: any) => {
        const source = typeof edge.source === "string" ? nodeMap.get(edge.source) : edge.source;
        const target = typeof edge.target === "string" ? nodeMap.get(edge.target) : edge.target;
        if (!source || !target) return;

        const sourceFile = source.data?.file;
        const sourceFolder = source.data?.folder || "";
        const targetFile = target.data?.file;
        const targetFolder = target.data?.folder || "";
        if (!sourceFile || !targetFile) return;

        const sourceKey = sourceFolder ? `${sourceFolder}/${sourceFile}` : sourceFile;
        const targetKey = targetFolder ? `${targetFolder}/${targetFile}` : targetFile;
        if (sourceKey === targetKey || !groups.has(sourceKey) || !groups.has(targetKey)) return;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (dist - 30) * strength * alpha;
        const sfx = (dx / dist) * f;
        const sfy = (dy / dist) * f;

        groups.get(sourceKey)!.fx += sfx;
        groups.get(sourceKey)!.fy += sfy;
        groups.get(targetKey)!.fx -= sfx;
        groups.get(targetKey)!.fy -= sfy;
      });

      groups.forEach((g) => {
        if (g.nodes.length === 0 || (Math.abs(g.fx) < 1e-10 && Math.abs(g.fy) < 1e-10)) return;
        const n = g.nodes.length;
        g.nodes.forEach((node: any) => {
          node.vx += g.fx / n;
          node.vy += g.fy / n;
          node._debug.crossFile = [node._debug.crossFile[0] + g.fx / n, node._debug.crossFile[1] + g.fy / n];
        });
      });
    }
    force.initialize = (n: any[]) => {
      nodeMap = new Map();
      n.forEach((node: any) => nodeMap.set(node.id, node));
    };
    return force;
  }

  function twoLevelLayoutForce(edges: any[], params: { groupStrength: number; crossFileStrength: number; collisionStrength: number; repelStrength: number }, gridSnapSpacing = 0) {
    let nodes: any[];
    let groupInfo: Map<string, { cx: number; cy: number; radius: number; members: any[] }> | null = null;

    function getGroupKey(node: any): string {
      const file = node.data?.file;
      const folder = node.data?.folder || "";
      return file ? (folder ? `${folder}/${file}` : file) : "";
    }

    function force(alpha: number) {
      if (!groupInfo) return;
      if (gridSnapSpacing > 0) return;

      const nodeMap = new Map(nodes.map((n: any) => [n.id, n]));

      // --- 1. Update group centroids from current symbol positions ---
      groupInfo.forEach(g => {
        if (g.members.length === 0) return;
        g.cx = g.members.reduce((s: number, n: any) => s + n.x, 0) / g.members.length;
        g.cy = g.members.reduce((s: number, n: any) => s + n.y, 0) / g.members.length;
      });

      // --- 2. Cross-file edge forces (group-to-group spring) ---
      if (params.crossFileStrength > 0 && gridSnapSpacing === 0) {
        const groupSpringForces = new Map<string, { fx: number; fy: number }>();
        edges.forEach((e: any) => {
          const sourceId = typeof e.source === 'string' ? e.source : e.source.id;
          const targetId = typeof e.target === 'string' ? e.target : e.target.id;
          const sn = nodeMap.get(sourceId);
          const tn = nodeMap.get(targetId);
          if (!sn || !tn) return;
          const sk = getGroupKey(sn);
          const tk = getGroupKey(tn);
          if (!sk || !tk || sk === tk) return;
          const sg = groupInfo!.get(sk);
          const tg = groupInfo!.get(tk);
          if (!sg || !tg) return;
          const dx = tg.cx - sg.cx;
          const dy = tg.cy - sg.cy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const ideal = sg.radius + tg.radius + 10;
          const k = (dist - ideal) * 0.03 * params.crossFileStrength * alpha;
          const pfx = (dx / dist) * k;
          const pfy = (dy / dist) * k;
          if (!groupSpringForces.has(sk)) groupSpringForces.set(sk, { fx: 0, fy: 0 });
          if (!groupSpringForces.has(tk)) groupSpringForces.set(tk, { fx: 0, fy: 0 });
          const sf = groupSpringForces.get(sk)!;
          const tf = groupSpringForces.get(tk)!;
          sf.fx += pfx; sf.fy += pfy;
          tf.fx -= pfx; tf.fy -= pfy;
        });
        groupSpringForces.forEach((f, key) => {
          const g = groupInfo!.get(key);
          if (!g || g.members.length === 0) return;
          g.members.forEach((n: any) => {
            n.vx += f.fx / g.members.length;
            n.vy += f.fy / g.members.length;
          });
        });
      }

      // --- 3. Group separation (container packing) ---
      const groups = Array.from(groupInfo.values());
      for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) {
          const a = groups[i], b = groups[j];
          const dx = b.cx - a.cx;
          const dy = b.cy - a.cy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = a.radius + b.radius + 10;
          if (dist < minDist) {
            const overlap = minDist - dist;
            const k = params.collisionStrength * alpha * 0.5;
            const px = (dx / dist) * overlap * k;
            const py = (dy / dist) * overlap * k;
            a.members.forEach((n: any) => { n.vx -= px / a.members.length; n.vy -= py / a.members.length; });
            b.members.forEach((n: any) => { n.vx += px / b.members.length; n.vy += py / b.members.length; });
          }
        }
      }

      // --- 4. Boundary enforcement + gentle centering (skipped when grid snap active) ---
      if (gridSnapSpacing === 0) {
        groupInfo.forEach(g => {
          const gk = params.groupStrength * alpha;
          g.members.forEach((n: any) => {
            const dx = n.x - g.cx;
            const dy = n.y - g.cy;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            if (dist > g.radius) {
              const overlap = dist - g.radius;
              const f = overlap * 0.3 * gk;
              n.vx -= (dx / dist) * f;
              n.vy -= (dy / dist) * f;
            }
            n.vx -= dx * 0.002 * alpha;
            n.vy -= dy * 0.002 * alpha;
          });
        });
      }

      // --- 5. Intra-group node collision (skipped when grid snap active — grid handles spacing) ---
      if (gridSnapSpacing === 0) {
        groupInfo.forEach(g => {
          for (let i = 0; i < g.members.length; i++) {
            for (let j = i + 1; j < g.members.length; j++) {
              const a = g.members[i], b = g.members[j];
              const dx = a.x - b.x;
              const dy = a.y - b.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const minDist = 15;
              if (dist < minDist) {
                const f = (minDist - dist) * 0.08 * alpha;
                a.vx += (dx / dist) * f;
                a.vy += (dy / dist) * f;
                b.vx -= (dx / dist) * f;
                b.vy -= (dy / dist) * f;
              }
            }
          }
        });
      }

      // --- 6. Intra-file edge springs (skipped when grid snap active) ---
      if (gridSnapSpacing === 0) {
        edges.forEach((e: any) => {
          const source = typeof e.source === 'string' ? nodeMap.get(e.source) : e.source;
          const target = typeof e.target === 'string' ? nodeMap.get(e.target) : e.target;
          if (!source || !target) return;
          const sk = getGroupKey(source);
          const tk = getGroupKey(target);
          if (sk !== tk || !sk) return;
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = (dist - 25) * 0.03 * alpha;
          source.vx += (dx / dist) * f;
          source.vy += (dy / dist) * f;
          target.vx -= (dx / dist) * f;
          target.vy -= (dy / dist) * f;
        });
      }

      // --- 7. Inter-group symbol repulsion ---
      if (params.repelStrength > 0 && nodes.length < 400) {
        const allMembers = Array.from(groupInfo.values()).flatMap(g => g.members);
        const scale = gridSnapSpacing > 0 ? 0.3 : 1;
        for (let i = 0; i < allMembers.length; i++) {
          const a = allMembers[i];
          const aKey = getGroupKey(a);
          for (let j = i + 1; j < allMembers.length; j++) {
            const b = allMembers[j];
            if (getGroupKey(b) === aKey) continue;
            const dx = a.x - b.x, dy = a.y - b.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const f = params.repelStrength / (dist * dist) * scale;
            a.vx += (dx / dist) * f * alpha;
            a.vy += (dy / dist) * f * alpha;
            b.vx -= (dx / dist) * f * alpha;
            b.vy -= (dy / dist) * f * alpha;
          }
        }
      }
    }

    force.initialize = (n: any[]) => {
      nodes = n;
      const groups = new Map<string, any[]>();
      nodes.forEach((n: any) => {
        const key = getGroupKey(n);
        if (key) {
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(n);
        }
      });

      const rootData: any = { id: "root", children: [] };
      groups.forEach((members, key) => {
        rootData.children.push({ id: key, value: members.length });
      });

      if (rootData.children.length === 0) {
        groupInfo = new Map();
        return;
      }

      try {
        const root = d3.hierarchy(rootData).sum(d => d.value);
        const packSize = 400;
        d3.pack<any>().size([packSize, packSize]).padding(15)(root);

        groupInfo = new Map();
        root.children?.forEach((child: any) => {
          const key = child.data.id;
          const members = groups.get(key) || [];
          const minR = gridSnapSpacing > 0 ? Math.sqrt(members.length * gridSnapSpacing * gridSnapSpacing / Math.PI) + gridSnapSpacing : 0;
          const r = Math.max(child.r - 5, 15, minR);
          const cx = (child.x ?? 0) - packSize / 2;
          const cy = (child.y ?? 0) - packSize / 2;
          groupInfo!.set(key, { cx, cy, radius: r, members });
          if (gridSnapSpacing > 0) {
            const usedSlots = new Set<string>();
            const candidates: [number, number][] = [];
            const searchR = r + gridSnapSpacing;
            const minX = Math.floor((cx - searchR) / gridSnapSpacing) * gridSnapSpacing;
            const maxX = Math.ceil((cx + searchR) / gridSnapSpacing) * gridSnapSpacing;
            const minY = Math.floor((cy - searchR) / gridSnapSpacing) * gridSnapSpacing;
            const maxY = Math.ceil((cy + searchR) / gridSnapSpacing) * gridSnapSpacing;
            for (let x = minX; x <= maxX; x += gridSnapSpacing) {
              for (let y = minY; y <= maxY; y += gridSnapSpacing) {
                candidates.push([x, y]);
              }
            }
            candidates.sort((a, b) => (a[0] - cx) ** 2 + (a[1] - cy) ** 2 - (b[0] - cx) ** 2 - (b[1] - cy) ** 2);
            members.forEach((n: any) => {
              const slot = candidates.find(([x, y]) => !usedSlots.has(`${x},${y}`));
              if (slot) {
                usedSlots.add(`${slot[0]},${slot[1]}`);
                n.x = slot[0]; n.y = slot[1];
              } else {
                n.x = cx; n.y = cy;
              }
              n.vx = 0;
              n.vy = 0;
            });
          } else {
            members.forEach((n: any) => {
              const angle = Math.random() * 2 * Math.PI;
              const dist = Math.random() * r * 0.7;
              n.x = cx + Math.cos(angle) * dist;
              n.y = cy + Math.sin(angle) * dist;
              n.vx = 0;
              n.vy = 0;
            });
          }
        });
      } catch {
        groupInfo = new Map();
        groups.forEach((members, key) => {
          const minR = gridSnapSpacing > 0 ? Math.sqrt(members.length * gridSnapSpacing * gridSnapSpacing / Math.PI) + gridSnapSpacing : 0;
          const r = Math.max(15, 5 + members.length * 5, minR);
          const gcx = 0; const gcy = 0;
          groupInfo!.set(key, { cx: gcx, cy: gcy, radius: r, members });
          if (gridSnapSpacing > 0) {
            const usedSlots = new Set<string>();
            const candidates: [number, number][] = [];
            const searchR = r + gridSnapSpacing;
            const minX = Math.floor((gcx - searchR) / gridSnapSpacing) * gridSnapSpacing;
            const maxX = Math.ceil((gcx + searchR) / gridSnapSpacing) * gridSnapSpacing;
            const minY = Math.floor((gcy - searchR) / gridSnapSpacing) * gridSnapSpacing;
            const maxY = Math.ceil((gcy + searchR) / gridSnapSpacing) * gridSnapSpacing;
            for (let x = minX; x <= maxX; x += gridSnapSpacing) {
              for (let y = minY; y <= maxY; y += gridSnapSpacing) {
                candidates.push([x, y]);
              }
            }
            candidates.sort((a, b) => (a[0] - gcx) ** 2 + (a[1] - gcy) ** 2 - (b[0] - gcx) ** 2 - (b[1] - gcy) ** 2);
            members.forEach((n: any) => {
              const slot = candidates.find(([x, y]) => !usedSlots.has(`${x},${y}`));
              if (slot) {
                usedSlots.add(`${slot[0]},${slot[1]}`);
                n.x = slot[0]; n.y = slot[1];
              } else {
                n.x = gcx; n.y = gcy;
              }
              n.vx = 0; n.vy = 0;
            });
          } else {
            members.forEach((n: any) => {
              const angle = Math.random() * 2 * Math.PI;
              const dist = Math.random() * r * 0.7;
              n.x = Math.cos(angle) * dist;
              n.y = Math.sin(angle) * dist;
              n.vx = 0; n.vy = 0;
            });
          }
        });
      }
    };

    return force;
  }

  function initPolyBlocksNodes(nodes: any[], spacing: number, rectStore?: { treemapSize: number; rects: Map<string, { x0: number; y0: number; x1: number; y1: number }> }, emptyFileKeys: string[] = []) {
    const groupKeyToName: string[] = [];
    const groups: { members: any[] }[] = [];
    const groupKey = new Map<string, number>();
    nodes.forEach((n: any) => {
      const file = n.data?.file;
      const folder = n.data?.folder || "";
      const key = file ? (folder ? `${folder}/${file}` : file) : "";
      if (key) {
        if (!groupKey.has(key)) { groupKey.set(key, groups.length); groups.push({ members: [] }); groupKeyToName.push(key); }
        groups[groupKey.get(key)!].members.push(n);
      }
    });
    // Empty files (no symbols) still get a treemap cell so they appear as isolated blocks
    emptyFileKeys.forEach((key) => {
      if (key && !groupKey.has(key)) {
        groupKey.set(key, groups.length);
        groups.push({ members: [] });
        groupKeyToName.push(key);
      }
    });
    if (groups.length === 0) return;
    if (rectStore) rectStore.rects.clear();

    const globalUsed = new Set<string>();

    try {
      const rootData: any = { id: "root", children: [] };
      groups.forEach((g, i) => rootData.children.push({ id: String(i), value: Math.max(1, g.members.length) }));
      const root = d3.hierarchy(rootData).sum(d => d.value);
      const rawSize = Math.max(600, Math.ceil(Math.sqrt(nodes.length + emptyFileKeys.length) * spacing * 2.5));
      const treemapSize = Math.ceil(rawSize / (spacing * 2)) * (spacing * 2);
      d3.treemap<any>().size([treemapSize, treemapSize]).padding(16).round(true)(root);

      if (rectStore) rectStore.treemapSize = treemapSize;

      root.children?.forEach((child: any) => {
        const gi = Number(child.data.id);
        const g = groups[gi];
        const [x0, y0, x1, y1] = [child.x0, child.y0, child.x1, child.y1];
        const slots: [number, number][] = [];
        const gx0 = Math.floor(x0 / spacing) * spacing;
        const gy0 = Math.floor(y0 / spacing) * spacing;
        const gx1 = Math.ceil(x1 / spacing) * spacing;
        const gy1 = Math.ceil(y1 / spacing) * spacing;
        for (let x = gx0; x < gx1; x += spacing)
          for (let y = gy0; y < gy1; y += spacing)
            if (x >= x0 && x < x1 && y >= y0 && y < y1) slots.push([x - treemapSize / 2, y - treemapSize / 2]);
        slots.sort((a, b) => (a[0] - slots[0][0]) ** 2 + (a[1] - slots[0][1]) ** 2 - (b[0] - slots[0][0]) ** 2 - (b[1] - slots[0][1]) ** 2);
        const offX = Math.round((x0 + x1) / 2 / spacing) * spacing - treemapSize / 2;
        const offY = Math.round((y0 + y1) / 2 / spacing) * spacing - treemapSize / 2;
        if (rectStore && groupKeyToName[gi]) {
          const half = treemapSize / 2;
          if (g.members.length === 0) {
            // Empty module: same footprint as a 1-symbol block, centered on a grid point
            const s = 15; // matches block padding around a symbol node
            emptyModulePositionsRef.current.set(groupKeyToName[gi], { x: offX, y: offY });
            rectStore.rects.set(groupKeyToName[gi], { x0: offX - s, y0: offY - s, x1: offX + s, y1: offY + s });
          } else {
            rectStore.rects.set(groupKeyToName[gi], { x0: child.x0 - half, y0: child.y0 - half, x1: child.x1 - half, y1: child.y1 - half });
          }
        }
        const boundCheck = (sx: number, sy: number) => {
          const rx = sx + treemapSize / 2, ry = sy + treemapSize / 2;
          return rx >= x0 && rx < x1 && ry >= y0 && ry < y1;
        };
        const findSlot = (taken: Set<string>, cx: number, cy: number) => {
          for (let ring = 0; ring < 30; ring++) {
            for (let dx = -ring; dx <= ring; dx++) {
              for (let dy = -ring; dy <= ring; dy++) {
                if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
                const sx = Math.round((cx + dx * spacing) / spacing) * spacing;
                const sy = Math.round((cy + dy * spacing) / spacing) * spacing;
                if (boundCheck(sx, sy) && !taken.has(`${sx},${sy}`)) return [sx, sy] as [number, number];
              }
            }
          }
          return null;
        };

        let fallbackIdx = 0;
        g.members.forEach((n, i) => {
          if (i < slots.length) {
            const sk = `${slots[i][0]},${slots[i][1]}`;
            if (!globalUsed.has(sk)) {
              globalUsed.add(sk); n.x = slots[i][0]; n.y = slots[i][1]; n.vx = 0; n.vy = 0; return;
            }
          }
          let found = findSlot(globalUsed, offX, offY);
          if (!found) {
            for (let ring = 0; !found && ring < 30; ring++) {
              for (let dx = -ring; dx <= ring && !found; dx++) {
                for (let dy = -ring; dy <= ring && !found; dy++) {
                  if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
                  const sx = offX + dx * spacing, sy = offY + dy * spacing;
                  if (!globalUsed.has(`${sx},${sy}`)) { found = [sx, sy]; }
                }
              }
            }
          }
          if (found) { globalUsed.add(`${found[0]},${found[1]}`); n.x = found[0]; n.y = found[1]; }
          else { fallbackIdx++; n.x = offX + (fallbackIdx % 5) * (spacing / 2); n.y = offY + Math.floor(fallbackIdx / 5) * (spacing / 2); }
          n.vx = 0; n.vy = 0;
        });
      });
    } catch {
      nodes.forEach((n: any, i) => { n.x = (i % 10) * spacing - 200; n.y = Math.floor(i / 10) * spacing - 200; n.vx = 0; n.vy = 0; });
    }
  }

  function getPolyBlocksStorageKey(): string {
    const id = localStorage.getItem("polyBlocksCurrentProjectId");
    return "polyBlocksPositions_" + (id || "default");
  }

  function setCurrentProjectId(id: string) {
    console.log("[uuid] setCurrentProjectId", id);
    localStorage.setItem("polyBlocksCurrentProjectId", id);
  }



  function savePolyBlocksPositions(nodes: any[]) {
    const storageKey = getPolyBlocksStorageKey();
    const positions: Record<string, { x: number; y: number }> = {};
    nodes.forEach((n: any) => { positions[n.id] = { x: n.x, y: n.y }; });
    const emptyModules: Record<string, { x: number; y: number }> = {};
    emptyModulePositionsRef.current.forEach((pos, key) => { emptyModules[key] = { x: pos.x, y: pos.y }; });
    localStorage.setItem(storageKey, JSON.stringify({ positions, emptyModules }));
    console.log("[pos] saved", Object.keys(positions).length, "nodes,", Object.keys(emptyModules).length, "empty modules for", storageKey);
  }

  function applySavedPositions(nodes: any[]): void {
    const storageKey = getPolyBlocksStorageKey();
    const saved = localStorage.getItem(storageKey);
    console.log("[uuid] loading positions for:", storageKey);
    if (!saved) {
      console.log("[pos] no saved positions for", storageKey);
      return;
    }
    try {
      const data = JSON.parse(saved);
      let count = 0;
      nodes.forEach((n: any) => {
        const pos = data.positions?.[n.id];
        if (pos) {
          n.x = pos.x;
          n.y = pos.y;
          n.vx = 0;
          n.vy = 0;
          count++;
        }
      });
      if (data.emptyModules) {
        emptyModulePositionsRef.current.forEach((_, key) => {
          const pos = data.emptyModules[key];
          if (pos) {
            const s = 15;
            emptyModulePositionsRef.current.set(key, { x: pos.x, y: pos.y });
            polyBlocksRectsRef.current.rects.set(key, { x0: pos.x - s, y0: pos.y - s, x1: pos.x + s, y1: pos.y + s });
          }
        });
      }
      console.log("[pos] restored", count, "of", nodes.length, "nodes for", storageKey);
    } catch (e) { console.error("[pos] error", e); }
  }

  function updatePolyBlocksGroupRect(fileKey: string) {
    const members = filteredNodes.filter((n: any) => {
      const f = n.data?.file;
      const d = n.data?.folder || "";
      const k = f ? (d ? `${d}/${f}` : f) : "";
      return k === fileKey;
    });
    if (members.length === 0) return;
    const padding = 15;
    const minX = Math.min(...members.map((n: any) => n.x)) - padding;
    const maxX = Math.max(...members.map((n: any) => n.x)) + padding;
    const minY = Math.min(...members.map((n: any) => n.y)) - padding;
    const maxY = Math.max(...members.map((n: any) => n.y)) + padding;
    polyBlocksRectsRef.current.rects.set(fileKey, { x0: minX, y0: minY, x1: maxX, y1: maxY });
  }

  function rebuildPolyBlocksRects() {
    const rects = polyBlocksRectsRef.current.rects;
    const prevRects = new Map(rects);
    rects.clear();
    const groups = new Map<string, any[]>();
    filteredNodes.forEach((n: any) => {
      const f = n.data?.file;
      const d = n.data?.folder || "";
      const k = f ? (d ? `${d}/${f}` : f) : "";
      if (!k) return;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(n);
    });
    const padding = 15;
    groups.forEach((members, key) => {
      const minX = Math.min(...members.map((n: any) => n.x)) - padding;
      const maxX = Math.max(...members.map((n: any) => n.x)) + padding;
      const minY = Math.min(...members.map((n: any) => n.y)) - padding;
      const maxY = Math.max(...members.map((n: any) => n.y)) + padding;
      rects.set(key, { x0: minX, y0: minY, x1: maxX, y1: maxY });
    });
    // Empty files have no member nodes, so keep their treemap cells from the last init
    emptyGroupsRef.current.forEach((g) => {
      if (!rects.has(g.key) && prevRects.has(g.key)) {
        rects.set(g.key, prevRects.get(g.key)!);
      }
    });
  }

  const [customData, setCustomData] = useState<{
    nodes: any[];
    edges: any[];
  } | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [directoryHandle, setDirectoryHandle] = useState<any>(null);
  const [savedDirectories, setSavedDirectories] = useState<any[]>([]);
  const [showDirectoryDropdown, setShowDirectoryDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const folderButtonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supportsFileSystemAccess = "showDirectoryPicker" in window;

  const { nodes: generatedNodes, edges: generatedEdges } = useMemo(
    () => (customData ? customData : { nodes: [], edges: [] }),
    [customData],
  );

  // Filter nodes and edges based on hidden folders, files, and symbols
  const { filteredNodes, filteredEdges } = useMemo(() => {
    const hiddenSet = hiddenPaths;

    const visibleNodes = generatedNodes.filter((node: any) => {
      const folder = node.data.folder || "root";
      const file = node.data.file || "";

      // Check if this specific symbol is hidden
      if (hiddenSymbols.has(node.id)) {
        return false;
      }

      // Check if this folder or any parent folder is hidden
      const folderParts = folder.split("/");
      for (let i = 0; i < folderParts.length; i++) {
        const parentPath = folderParts.slice(0, i + 1).join("/");
        if (hiddenSet.has(parentPath)) {
          return false;
        }
      }

      // Check if this specific file is hidden
      const rawFolder = node.data.folder || "";
      const filePath = file ? (rawFolder ? `${rawFolder}/${file}` : file) : rawFolder;
      const filePathWithoutExt = filePath.replace(".ts", "");
      if (hiddenSet.has(filePathWithoutExt)) {
        return false;
      }

      return true;
    });

    const visibleNodeIds = new Set(visibleNodes.map((n: any) => n.id));

    const visibleEdges = generatedEdges.filter((edge: any) => {
      // Handle both string IDs and D3 node objects
      const sourceId =
        typeof edge.source === "string" ? edge.source : edge.source.id;
      const targetId =
        typeof edge.target === "string" ? edge.target : edge.target.id;
      return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
    });

    return { filteredNodes: visibleNodes, filteredEdges: visibleEdges };
  }, [generatedNodes, generatedEdges, hiddenPaths, hiddenSymbols]);

  // Files with no symbols (empty modules/scripts, e.g. pure barrel index.ts).
  // In poly-blocks they render as isolated blocks, mirroring filteredNodes' visibility rules.
  const emptyFileGroups = useMemo(() => {
    if (!parsedData) return [];
    const groups: { key: string; file: string; folder: string }[] = [];
    const hiddenSet = hiddenPaths;
    [...parsedData.modules, ...parsedData.scripts].forEach((m) => {
      if (m.symbols.length > 0) return;
      const pathParts = m.path.split("/");
      const file = pathParts[pathParts.length - 1] || m.path;
      const folder = pathParts.slice(0, -1).join("/");
      const key = folder ? `${folder}/${file}` : file;

      // Check if this folder or any parent folder is hidden
      const folderParts = folder.split("/").filter(Boolean);
      let hidden = false;
      for (let i = 0; i < folderParts.length; i++) {
        const parentPath = folderParts.slice(0, i + 1).join("/");
        if (hiddenSet.has(parentPath)) {
          hidden = true;
          break;
        }
      }
      if (hidden) return;

      // Check if this specific file is hidden
      if (hiddenSet.has(key.replace(".ts", ""))) return;

      groups.push({ key, file, folder });
    });
    return groups;
  }, [parsedData, hiddenPaths]);

  const emptyGroupsRef = useRef(emptyFileGroups);
  emptyGroupsRef.current = emptyFileGroups;

  const handleHoverPath = useCallback(
    (path: string | null, isFolder: boolean = false) => {
      hoverFromTreeRef.current = path !== null;
      if (path === null) {
        hoveredNodeRef.current = null;
      } else if (isFolder) {
        const nodesInFolder = filteredNodes.filter((n: any) => {
          const folder = n.data.folder || "";
          return folder === path || folder.startsWith(path + "/");
        });
        hoveredNodeRef.current = nodesInFolder.length > 0 ? nodesInFolder : null;
      } else {
        const nodesInFile = filteredNodes.filter((n: any) => {
          const lastDotIndex = n.id.lastIndexOf(".");
          const nodeFilePath = n.id.substring(0, lastDotIndex);
          return nodeFilePath === path;
        });
        hoveredNodeRef.current = nodesInFile.length > 0 ? nodesInFile : null;
      }
      if (drawRef.current) {
        drawRef.current();
      }
    },
    [filteredNodes],
  );

  const handleHoverSymbol = useCallback(
    (symbolName: string | null, modulePath?: string) => {
      hoverFromTreeRef.current = symbolName !== null;
      if (symbolName === null || !modulePath) {
        hoveredNodeRef.current = null;
      } else {
        const node = filteredNodes.find((n: any) => {
          const nodeFilePath = n.data.folder
            ? `${n.data.folder}/${n.data.file}`
            : n.data.file;
          return n.data.label === symbolName && nodeFilePath === modulePath;
        });
        hoveredNodeRef.current = node || null;
      }
      if (drawRef.current) {
        drawRef.current();
      }
    },
    [filteredNodes],
  );

  const handleSelectSymbol = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  // Sync selectedNodeId to ref for use in draw function
  useEffect(() => {
    selectedNodeRef.current = selectedNodeId;
    if (drawRef.current) {
      drawRef.current();
    }
  }, [selectedNodeId]);

  // Extract folder names for coloring (based on all nodes for consistent colors)
  const { folderMap, colorScale } = useMemo(() => {
    const map = new Map<string, string>();
    generatedNodes.forEach((node: any) => {
      const folder = node.data.folder || "root";
      map.set(node.id, folder);
    });

    // Use folder paths for coloring (modules are grouped by folder)
    const folderList = Array.from(new Set(Array.from(map.values())));
    const scale = d3.scaleOrdinal(d3.schemeSet3).domain(folderList);

    return { folderMap: map, colorScale: scale };
  }, [generatedNodes]);

  // Build path-based tree structure from modules and scripts
  const treeData = useMemo(() => {
    if (!parsedData) return [];

    const treeRoot = new Map<string, TreeNode<any>>();

    function getPathSegments(path: string): string[] {
      return path.split("/").filter(Boolean);
    }

    function getOrCreateNode(
      path: string,
      type: "path" | "file" | "symbol",
    ): TreeNode<any> {
      if (treeRoot.has(path)) {
        return treeRoot.get(path)!;
      }

      const segments = getPathSegments(path);
      const name = segments[segments.length - 1];
      const node: TreeNode<any> = {
        id: path,
        data: {
          name,
          path,
          type,
        },
        children: [],
      };

      treeRoot.set(path, node);

      // Create parent nodes if they don't exist (only for path and file types, not symbols)
      if (type !== "symbol" && segments.length > 1) {
        const parentPath = segments.slice(0, -1).join("/");
        const parentNode = getOrCreateNode(parentPath, "path");
        parentNode.children.push(node);
      }

      return node;
    }

    // Add modules
    parsedData.modules.forEach((module) => {
      const fileNode = getOrCreateNode(module.path, "file");
      fileNode.data.symbolCount = module.symbols.length;
      fileNode.data.fileType = "module";

      module.symbols.forEach((symbol) => {
        const symbolPath = `${module.path}::${symbol.name}`;
        const symbolNode = getOrCreateNode(symbolPath, "symbol");
        symbolNode.data.symbolType = symbol.type;
        symbolNode.data.modulePath = module.path;
        symbolNode.data.name = symbol.name; // Explicitly set the symbol name
        fileNode.children.push(symbolNode);
      });
    });

    // Add scripts
    parsedData.scripts.forEach((script) => {
      const fileNode = getOrCreateNode(script.path, "file");
      fileNode.data.symbolCount = script.symbols.length;
      fileNode.data.fileType = "script";

      script.symbols.forEach((symbol) => {
        const symbolPath = `${script.path}::${symbol.name}`;
        const symbolNode = getOrCreateNode(symbolPath, "symbol");
        symbolNode.data.symbolType = symbol.type;
        symbolNode.data.modulePath = script.path;
        symbolNode.data.name = symbol.name; // Explicitly set the symbol name
        fileNode.children.push(symbolNode);
      });
    });

    // Get root nodes (nodes without parents in the tree)
    const rootNodes: TreeNode<any>[] = [];
    const allPaths = new Set(treeRoot.keys());
    const childPaths = new Set<string>();

    treeRoot.forEach((node) => {
      node.children.forEach((child) => {
        childPaths.add(child.id);
      });
    });

    allPaths.forEach((path) => {
      if (!childPaths.has(path)) {
        rootNodes.push(treeRoot.get(path)!);
      }
    });

    // Sort root nodes by path
    return rootNodes.sort((a, b) => a.data.path.localeCompare(b.data.path));
  }, [parsedData]);

  const togglePathVisibility = useCallback((path: string) => {
    if (!path) return;
    setHiddenPaths((prev: Set<string>) => {
      const next = new Set(prev);
      const normalizedPath = path.replace(".ts", "");
      if (next.has(normalizedPath)) {
        next.delete(normalizedPath);
      } else {
        next.add(normalizedPath);
      }
      return next;
    });
  }, []);

  const toggleSymbolVisibility = useCallback((modulePath: string, symbolName: string) => {
    const pathParts = modulePath.split("/");
    const fileName = pathParts[pathParts.length - 1];
    const folder = pathParts.slice(0, -1).join("/");
    const graphNodeId = folder ? `${folder}/${fileName}.${symbolName}` : `${fileName}.${symbolName}`;

    setHiddenSymbols((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(graphNodeId)) {
        next.delete(graphNodeId);
      } else {
        next.add(graphNodeId);
      }
      return next;
    });
  }, []);

  const toggleModule = useCallback((moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      localStorage.setItem("expandedModules", JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  const expandAllModules = useCallback(() => {
    if (!parsedData) return;
    // Collect all expandable node IDs (path and file nodes)
    const allExpandableIds = new Set<string>();

    // Add all module and script file IDs
    [...parsedData.modules, ...parsedData.scripts].forEach((m) => {
      allExpandableIds.add(m.id);
      // Add all parent path nodes
      const segments = m.path.split("/").filter(Boolean);
      for (let i = 1; i < segments.length; i++) {
        const parentPath = segments.slice(0, i).join("/");
        allExpandableIds.add(parentPath);
      }
    });

    setExpandedModules(allExpandableIds);
    localStorage.setItem(
      "expandedModules",
      JSON.stringify(Array.from(allExpandableIds)),
    );
  }, [parsedData]);

  const collapseAllModules = useCallback(() => {
    setExpandedModules(new Set());
    localStorage.setItem("expandedModules", JSON.stringify([]));
  }, []);

  const showAll = useCallback(() => {
    setHiddenPaths(new Set());
    setHiddenSymbols(new Set());
  }, []);

  const hideAll = useCallback(() => {
    const pathsToHide = new Set<string>();
    if (!parsedData) return;

    [...parsedData.modules, ...parsedData.scripts].forEach((module) => {
      pathsToHide.add(module.path.replace(".ts", ""));
    });
    setHiddenPaths(pathsToHide);
  }, [parsedData]);

  // Tree configuration for rendering
  const treeConfig = useMemo<TreeConfig<any>>(
    () => ({
      renderNode: (node) => {
        const { data, isExpanded } = node;
        const isHidden = data.type === "symbol"
          ? (() => {
              const pathParts = (data.modulePath || "").split("/");
              const fileName = pathParts[pathParts.length - 1];
              const folder = pathParts.slice(0, -1).join("/");
              const graphNodeId = folder ? `${folder}/${fileName}.${data.name}` : `${fileName}.${data.name}`;
              return hiddenSymbols.has(graphNodeId);
            })()
          : node.isHidden;
        // Extract path for coloring
        const fullPath = data.path || data.modulePath || "root";
        // For path nodes (folders), use their own path for coloring
        // For file nodes, use their parent folder path for coloring
        const colorPath =
          data.type === "path"
            ? fullPath
            : fullPath.split("/").slice(0, -1).join("/") || "root";
        const itemColor = colorScale(colorPath) as string;

        // Choose icon based on type
        let icon;
        if (data.type === "path") {
          // Path node - use folder icon (open if expanded)
          icon = isExpanded ? (
            <FolderOpen size={16} style={{ color: itemColor }} />
          ) : (
            <Folder size={16} style={{ color: itemColor }} />
          );
        } else if (data.type === "file") {
          // File node
          icon =
            data.fileType === "module" ? (
              <FileBox size={16} style={{ color: itemColor }} />
            ) : (
              <FileCode2 size={16} style={{ color: itemColor }} />
            );
        } else if (data.type === "symbol") {
          // Symbol node - use different icons based on symbol type
          if (data.symbolType === "function") {
            icon = <FunctionSquare size={16} style={{ color: itemColor }} />;
          } else if (data.symbolType === "variable") {
            icon = <Asterisk size={16} style={{ color: itemColor }} />;
          } else if (data.symbolType === "class") {
            icon = <Box size={16} style={{ color: itemColor }} />;
          } else if (data.symbolType === "interface") {
            icon = <Layers2 size={16} style={{ color: itemColor }} />;
          } else if (data.symbolType === "type") {
            icon = <Cuboid size={16} style={{ color: itemColor }} />;
          } else if (data.symbolType === "enum") {
            icon = <ListOrdered size={16} style={{ color: itemColor }} />;
          } else {
            icon = <Circle size={16} style={{ color: itemColor }} />;
          }
        }

        // Chevron for expandable nodes (path and file)
        const chevron =
          data.type === "path" || data.type === "file" ? (
            <ChevronRight
              size={14}
              style={{
                color: "#a1a1aa",
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              }}
            />
          ) : null;

        return (
          <ModuleListItem
            name={data.name}
            icon={icon}
            color={itemColor}
            count={data.symbolCount}
            type={
              data.type === "file"
                ? data.fileType === "module"
                  ? "module"
                  : "script"
                : data.type === "symbol"
                  ? data.symbolType
                  : undefined
            }
            isHidden={isHidden}
            onClick={() => {
              if (data.type === "path" || data.type === "file") {
                toggleModule(node.id);
              } else if (data.type === "symbol") {
                handleSelectSymbol(node.id);
              }
            }}
            onHover={() => {
              if (data.type === "symbol") {
                handleHoverSymbol(data.name, data.modulePath);
              } else {
                handleHoverPath(data.path, data.type === "path");
              }
            }}
            onLeave={() => {
              if (data.type === "symbol") {
                handleHoverSymbol(null);
              } else {
                handleHoverPath(null);
              }
            }}
            onToggleVisibility={
              data.type === "path" || data.type === "file"
                ? () => togglePathVisibility(data.path)
                : data.type === "symbol"
                  ? () => toggleSymbolVisibility(data.modulePath, data.name)
                  : undefined
            }
            chevron={chevron}
          />
        );
      },
      expandedNodes: expandedModules,
      hiddenNodes: hiddenPaths,
    }),
    [
      colorScale,
      toggleModule,
      handleHoverPath,
      togglePathVisibility,
      toggleSymbolVisibility,
      expandedModules,
      hiddenPaths,
      hiddenSymbols,
      handleSelectSymbol,
    ],
  );

  const toggleSimulationLock = useCallback(() => {
    setSimulationLocked((prev) => {
      const newLocked = !prev;
      if (simulationRef.current) {
        if (newLocked) {
          simulationRef.current.stop();
        } else {
          simulationRef.current.alpha(0.3).restart();
        }
      }
      return newLocked;
    });
  }, []);

  const toggleForces = useCallback(() => {
    setForcesEnabled((prev) => {
      const newEnabled = !prev;
      forcesEnabledRef.current = newEnabled;
      if (simulationRef.current) {
        if (newEnabled) {
          // Run forces: set alphaDecay to 0 so it doesn't decay
          simulationRef.current.alphaDecay(0).alpha(0.3).restart();
        } else {
          // Stop forces: restore normal alphaDecay
          simulationRef.current.alphaDecay(0.0228);
        }
      }
      return newEnabled;
    });
  }, []);

  const resetGraph = useCallback(() => {
    if (simulationRef.current) {
      if (viewMode === "poly-blocks") {
        initPolyBlocksNodes(filteredNodes, 40, polyBlocksRectsRef.current, emptyGroupsRef.current.map((g) => g.key));
        rebuildPolyBlocksRects();
      } else {
        filteredNodes.forEach((node: any) => {
          node.x = (Math.random() - 0.5) * 100;
          node.y = (Math.random() - 0.5) * 100;
          node.vx = 0;
          node.vy = 0;
        });
      }
      // Reset transform to center
      transformRef.current = {
        x: window.innerWidth / 2 - (sidebarOpenRef.current ? 150 : 0),
        y: window.innerHeight / 2,
        k: 1,
      };
      simulationRef.current.alpha(1).restart();
      if (drawRef.current) {
        drawRef.current();
      }
    }
  }, [filteredNodes]);

  const loadDirectoryData = useCallback(
    async (
      dirHandle: any | null,
      fallbackFiles?: { path: string; content: string }[],
    ) => {
      try {
        setIsLoading(true);
        const files: { path: string; content: string }[] = [];

        if (dirHandle) {
          async function* getFiles(
            dirHandle: any,
            path: string = "",
          ): AsyncGenerator<{ path: string; content: string }> {
            for await (const entry of dirHandle.values()) {
              const entryPath = path ? `${path}/${entry.name}` : entry.name;
              if (
                entry.kind === "file" &&
                (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
              ) {
                const file = await entry.getFile();
                const content = await file.text();
                yield { path: entryPath, content };
              } else if (entry.kind === "directory") {
                yield* getFiles(entry, entryPath);
              }
            }
          }

          for await (const file of getFiles(dirHandle)) {
            files.push(file);
          }
        } else if (fallbackFiles) {
          files.push(...fallbackFiles);
        }

        console.log(`Loaded ${files.length} TypeScript files`);

        // Parse the files to get minimal data format
        const data = parseFilesMinimal(files);
        console.log(
          `Parsed ${data.modules.length} modules, ${data.scripts.length} scripts, and ${data.imports.length} imports`,
        );

        setParsedData(data);

        // Build graph data from minimal format
        const graphData = buildGraphFromMinimal(data);
        console.log(
          `Built ${graphData.nodes.length} nodes and ${graphData.edges.length} edges`,
        );

        setCustomData(graphData);
      } catch (err) {
        const errorMessage = (err as Error).message;
        // Don't alert for permission errors - they're expected when handles lack user gesture
        if (
          errorMessage.includes("not allowed") ||
          errorMessage.includes("permission")
        ) {
          console.warn(
            "Permission error loading directory (user gesture required):",
            err,
          );
        } else {
          console.error("Error loading directory data:", err);
          alert("Error loading directory data: " + errorMessage);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const handleDirectoryPicker = useCallback(async () => {
    try {
      setIsLoading(true);
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: "read",
      });
      setDirectoryHandle(dirHandle);
      await loadDirectoryData(dirHandle);

      // Save to IndexedDB
      try {
        const db = await openDirectoryDB();
        const tx = db.transaction("directories", "readwrite");
        const store = tx.objectStore("directories");
        const id = crypto.randomUUID();
        setCurrentProjectId(id);
        await store.put({
          id,
          handle: dirHandle,
          name: dirHandle.name,
          timestamp: Date.now(),
        });

        // Refresh saved directories list
        const getAllRequest = store.getAll();
        const directories = await new Promise<any[]>((resolve, reject) => {
          getAllRequest.onsuccess = () => resolve(getAllRequest.result);
          getAllRequest.onerror = () => reject(getAllRequest.error);
        });
        setSavedDirectories(
          directories.sort((a, b) => b.timestamp - a.timestamp),
        );
      } catch (err) {
        console.warn("Failed to save directory handle:", err);
      }
    } catch (err) {
      console.error("Directory picker error:", err);
      if ((err as Error).name !== "AbortError") {
        alert("Error picking directory: " + (err as Error).message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [loadDirectoryData]);

  const handleFallbackFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      setShowDirectoryDropdown(false);
      setIsLoading(true);

      try {
        const fileData: { path: string; content: string }[] = [];

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.name.endsWith(".ts") || file.name.endsWith(".tsx")) {
            const content = await file.text();
            // Get the relative path from webkitRelativePath
            const path = file.webkitRelativePath || file.name;
            fileData.push({ path, content });
          }
        }

        console.log(`Loaded ${fileData.length} TypeScript files via fallback`);
        await loadDirectoryData(null, fileData);
      } catch (err) {
        console.error("Error loading files:", err);
        alert("Error loading files: " + (err as Error).message);
      } finally {
        setIsLoading(false);
        // Reset input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [loadDirectoryData],
  );

  const handleToggleDropdown = useCallback(() => {
    if (!showDirectoryDropdown && folderButtonRef.current) {
      const rect = folderButtonRef.current.getBoundingClientRect();
      setDropdownPosition({ top: rect.bottom + 4, left: rect.left });
    }
    setShowDirectoryDropdown(!showDirectoryDropdown);
  }, [showDirectoryDropdown]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDirectoryDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        folderButtonRef.current &&
        !folderButtonRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDirectoryDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDirectoryDropdown]);

  // Load saved directories on mount
  useEffect(() => {
    const loadSavedDirectories = async () => {
      try {
        const db = await openDirectoryDB();
        const tx = db.transaction("directories", "readonly");
        const store = tx.objectStore("directories");
        const request = store.getAll();

        const directories = await new Promise<any[]>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        const sortedDirectories = directories.sort(
          (a, b) => b.timestamp - a.timestamp,
        );
        setSavedDirectories(sortedDirectories);

        // Auto-load the most recent directory if it has read permission
        if (sortedDirectories.length > 0) {
          const mostRecent = sortedDirectories[0];
          setDirectoryHandle(mostRecent.handle);
          setCurrentProjectId(mostRecent.id);
          try {
            const permission = await mostRecent.handle.queryPermission({
              mode: "read",
            });
            if (permission === "granted") {
              await loadDirectoryData(mostRecent.handle);
            }
          } catch (err) {
            console.warn("Permission check failed:", err);
          }
        }
      } catch (err) {
        console.warn("Failed to load saved directories:", err);
      }
    };

    loadSavedDirectories();
  }, [loadDirectoryData]);

  const handleLoadSavedDirectory = useCallback(
    async (id: string) => {
      const dir = savedDirectories.find((d) => d.id === id);
      if (!dir) return;

      try {
        setIsLoading(true);
        setDirectoryHandle(dir.handle);
        setCurrentProjectId(dir.id);
        await loadDirectoryData(dir.handle);

        // Update timestamp to move to top
        try {
          const db = await openDirectoryDB();
          const tx = db.transaction("directories", "readwrite");
          const store = tx.objectStore("directories");
          await store.put({
            ...dir,
            timestamp: Date.now(),
          });

          // Refresh list
          const getAllRequest = store.getAll();
          const directories = await new Promise<any[]>((resolve, reject) => {
            getAllRequest.onsuccess = () => resolve(getAllRequest.result);
            getAllRequest.onerror = () => reject(getAllRequest.error);
          });
          setSavedDirectories(
            directories.sort((a, b) => b.timestamp - a.timestamp),
          );
        } catch (err) {
          console.warn("Failed to update directory timestamp:", err);
        }
      } catch (err) {
        console.error("Error loading saved directory:", err);
        alert("Error loading directory: " + (err as Error).message);
      } finally {
        setIsLoading(false);
      }
    },
    [savedDirectories, loadDirectoryData],
  );

  const handleRemoveDirectory = useCallback(async (id: string) => {
    try {
      const db = await openDirectoryDB();
      const tx = db.transaction("directories", "readwrite");
      const store = tx.objectStore("directories");
      await store.delete(id);

      setSavedDirectories((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error("Error removing directory:", err);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!directoryHandle) {
      alert("No directory selected. Please select a directory first.");
      return;
    }
    // Save current visibility states
    const savedHiddenPaths = new Set(hiddenPaths);

    await loadDirectoryData(directoryHandle);

    // Restore visibility states
    setHiddenPaths(savedHiddenPaths);
  }, [directoryHandle, loadDirectoryData, hiddenPaths]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;

    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    const widthRef = {
      current:
        window.innerWidth -
        (sidebarOpenRef.current ? 300 : 0) -
        (rightSidebarOpenRef.current ? 300 : 0),
    };
    const heightRef = { current: window.innerHeight };
    let width = widthRef.current;
    let height = heightRef.current;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.scale(dpr, dpr);

    const handleResize = () => {
      const newDpr = window.devicePixelRatio || 1;
      const dprChanged = newDpr !== dprRef.current;

      if (dprChanged) {
        dprRef.current = newDpr;
      }

      width =
        window.innerWidth -
        (sidebarOpenRef.current ? 300 : 0) -
        (rightSidebarOpenRef.current ? 300 : 0);
      height = window.innerHeight;
      widthRef.current = width;
      heightRef.current = height;
      canvas.width = width * newDpr;
      canvas.height = height * newDpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(newDpr, 0, 0, newDpr, 0, 0);
      transformRef.current.x = width / 2;
      transformRef.current.y = height / 2;
      if (simulationRef.current) {
        simulationRef.current.alpha(0.3).restart();
      }
    };

    const handleSidebarResize = () => {
      const newDpr = dprRef.current;
      const newWidth =
        window.innerWidth -
        (sidebarOpenRef.current ? 300 : 0) -
        (rightSidebarOpenRef.current ? 300 : 0);
      widthRef.current = newWidth;
      canvas.width = newWidth * newDpr;
      canvas.style.width = `${newWidth}px`;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(newDpr, newDpr);
      transformRef.current.x = newWidth / 2;
      if (drawRef.current) {
        drawRef.current();
      }
    };

    resizeRef.current = handleSidebarResize;

    window.addEventListener("resize", handleResize);

    // Initialize transform if not set
    if (transformRef.current.x === 0 && transformRef.current.y === 0) {
      transformRef.current = { x: width / 2, y: height / 2, k: 1 };
    }

    // Manual zoom/pan handling
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let draggedNode: any = null;
    let draggedGroup: any[] | null = null;
    let draggedEmptyModule: string | null = null;
    let draggedEmptyOffset: { x: number; y: number } | null = null;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
      const newK = transformRef.current.k * zoomFactor;

      // Zoom towards mouse position
      transformRef.current.x =
        mouseX -
        (mouseX - transformRef.current.x) * (newK / transformRef.current.k);
      transformRef.current.y =
        mouseY -
        (mouseY - transformRef.current.y) * (newK / transformRef.current.k);
      transformRef.current.k = newK;

      draw();
    };

    canvas.addEventListener("wheel", handleWheel);

    if (viewMode === "poly-blocks") {
      const needsInit = filteredNodes.length > 0 && (
        polyBlocksDataRef.current !== generatedNodes ||
        Math.abs(filteredNodes[0].x % 40) > 0.1
      );
      if (needsInit) {
        initPolyBlocksNodes(filteredNodes, 40, polyBlocksRectsRef.current, emptyGroupsRef.current.map((g) => g.key));
      }
      rebuildPolyBlocksRects();
      polyBlocksDataRef.current = generatedNodes;
    }

    const isGroupingMode = viewMode !== "edges";
    const isLegacy = viewMode === "oriented-rect-roundpoly" || viewMode === "oriented-rect-roundpoly2" || viewMode === "poly-blocks";

    const simulation = d3
      .forceSimulation(filteredNodes as any)
      .alphaDecay(forcesEnabled ? 0 : alphaDecayValue);

    const boundaryRadius = 600;
    if (viewMode !== "poly-blocks") {
      simulation.force("boundary", (alpha: number) => {
        filteredNodes.forEach((node: any) => {
          const d = Math.sqrt(node.x * node.x + node.y * node.y);
          if (d > boundaryRadius) {
            const overlap = d - boundaryRadius;
            const f = overlap * 0.5 * alpha;
            node.vx -= (node.x / d) * f;
            node.vy -= (node.y / d) * f;
          }
        });
      });
    }

    if (viewMode === "poly-blocks") {
      // no forces
    } else if (isGroupingMode) {
      if (isLegacy) {
        simulation.force("twoLevel", twoLevelLayoutForce(filteredEdges as any, {
          groupStrength: groupCohesionStrength,
          crossFileStrength: crossFileEdgeStrength,
          collisionStrength,
          repelStrength,
        }, 0));
        simulation.force("collide", d3.forceCollide(15));
      } else {
        simulation.force("group", groupCohesionForce(groupCohesionStrength, collisionStrength, repelStrength, isLegacy));
        simulation.force("crossFile", crossFileEdgeForce(filteredEdges as any, crossFileEdgeStrength, isLegacy));
        simulation.force("collide", d3.forceCollide(15));
      }
    } else {
      simulation.force(
        "link",
        d3
          .forceLink(filteredEdges as any)
          .id((d: any) => d.id)
          .distance(linkDistance),
      );
    }

    simulationRef.current = simulation;

    simulation.on("tick", () => {
      draw();
      if (viewMode === "poly-blocks") {
        let anyAnimating = false;
        filteredNodes.forEach((node: any) => {
          if (node._snapTarget) {
            const dx = node._snapTarget.x - node.x;
            const dy = node._snapTarget.y - node.y;
            if (dx * dx + dy * dy < 0.5) {
              node.x = node._snapTarget.x;
              node.y = node._snapTarget.y;
              node._snapTarget = null;
              savePolyBlocksPositions(filteredNodes);
              const f = node.data?.file;
              const d = node.data?.folder || "";
              const k = f ? (d ? `${d}/${f}` : f) : "";
              if (k) updatePolyBlocksGroupRect(k);
            } else {
              node.x += dx * 0.2;
              node.y += dy * 0.2;
              anyAnimating = true;
            }
          }
        });
        if (anyAnimating) draw();
      }
    });

    // Stop simulation if locked
    if (simulationLocked) {
      simulation.stop();
    }

    // Initial draw
    draw();

    function draw() {
      if (!context) return;
      context.save();
      context.clearRect(0, 0, widthRef.current, heightRef.current);
      context.translate(transformRef.current.x, transformRef.current.y);
      context.scale(transformRef.current.k, transformRef.current.k);

      // Draw boundary circle
      if (viewMode !== "poly-blocks") {
        context.beginPath();
        context.arc(0, 0, boundaryRadius, 0, 2 * Math.PI);
        context.strokeStyle = "rgba(255, 0, 0, 0.3)";
        context.lineWidth = 1;
        context.setLineDash([6, 4]);
        context.stroke();
        context.setLineDash([]);
      }

      // Background grid for poly-blocks mode
      if (viewMode === "poly-blocks") {
        const gs = 40;
        const t = transformRef.current;
        const minX = Math.floor((-t.x) / t.k / gs) * gs;
        const maxX = Math.ceil((widthRef.current - t.x) / t.k / gs) * gs;
        const minY = Math.floor((-t.y) / t.k / gs) * gs;
        const maxY = Math.ceil((heightRef.current - t.y) / t.k / gs) * gs;
        const cols = Math.round((maxX - minX) / gs) + 1;
        const rows = Math.round((maxY - minY) / gs) + 1;
        if (cols * rows < 5000) {
          context.fillStyle = "rgba(255, 255, 255, 0.06)";
          context.beginPath();
          for (let x = minX; x <= maxX; x += gs)
            for (let y = minY; y <= maxY; y += gs) {
              context.moveTo(x + 1.5, y);
              context.arc(x, y, 1.5, 0, 2 * Math.PI);
            }
          context.fill();
        }
      }

      // Draw polygons/circles/boxes/offsets around nodes from the same file
      // Store hull paths for clipping edges inside groups
      const groupHulls = new Map<string, [number, number][]>();

      if (
        viewMode === "circles" ||
        viewMode === "boxes" ||
        viewMode === "para-fillet" ||
        viewMode === "para-bezier" ||
        viewMode === "para-subdiv" ||
        viewMode === "expand-poly" ||
        viewMode === "circle-poly" ||
        viewMode === "ellipse-wrap" ||
        viewMode === "oriented-rect" ||
        viewMode === "oriented-rect-rounded" ||
        viewMode === "oriented-rect-roundpoly" ||
        viewMode === "oriented-rect-roundpoly2" ||
        viewMode === "poly-solid" ||
        viewMode === "poly-blocks"
      ) {
        const nodesByFile = new Map<string, any[]>();
        filteredNodes.forEach((node: any) => {
          const file = node.data.file;
          const folder = node.data.folder || "";
          const uniqueKey = folder ? `${folder}/${file}` : file;
          if (!nodesByFile.has(uniqueKey)) {
            nodesByFile.set(uniqueKey, []);
          }
          nodesByFile.get(uniqueKey)!.push(node);
        });

        // Empty modules (0 symbols) join the normal grouping so they render
        // through the same path, using their treemap cell as geometry
        if (viewMode === "poly-blocks") {
          emptyGroupsRef.current.forEach((g) => {
            if (!nodesByFile.has(g.key)) {
              nodesByFile.set(g.key, []);
            }
          });
        }

        nodesByFile.forEach((nodes, uniqueKey) => {
          // Get folder color for this group
          const folder =
            nodes.length > 0
              ? nodes[0].data.folder || "root"
              : uniqueKey.includes("/")
                ? uniqueKey.slice(0, uniqueKey.lastIndexOf("/"))
                : "root";
          const folderColor = colorScale(folder) as string;

          // Convert hex to rgba with 0.15 opacity
          const hexToRgba = (hex: string, alpha: number): string => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
          };
          const fillColor = hexToRgba(folderColor, 0.15);
          const strokeColor = hexToRgba(folderColor, 0.3);

          if (viewMode === "para-fillet") {
            // Parallel offset with fillet (45-degree chamfer)
            if (nodes.length < 3) return;

            const points: [number, number][] = nodes.map((n) => [n.x, n.y]);
            const hull = d3.polygonHull(points);

            if (hull && hull.length >= 3) {
              // Store hull for clipping
              groupHulls.set(uniqueKey, hull);
              const nodeRadius = 10;
              const padding = 5;
              const offset = nodeRadius + padding;
              const chamferSize = 8;
              const offsetPoints: [number, number][] = [];

              for (let i = 0; i < hull.length; i++) {
                const current = hull[i];
                const prev = hull[(i - 1 + hull.length) % hull.length];
                const next = hull[(i + 1) % hull.length];

                const edge1 = [next[0] - current[0], next[1] - current[1]];
                const edge2 = [current[0] - prev[0], current[1] - prev[1]];

                const len1 = Math.sqrt(
                  edge1[0] * edge1[0] + edge1[1] * edge1[1],
                );
                const len2 = Math.sqrt(
                  edge2[0] * edge2[0] + edge2[1] * edge2[1],
                );
                const norm1 = [edge1[0] / len1, edge1[1] / len1];
                const norm2 = [edge2[0] / len2, edge2[1] / len2];

                const perp1 = [-norm1[1], norm1[0]];
                const perp2 = [-norm2[1], norm2[0]];

                const avgPerp = [
                  (perp1[0] + perp2[0]) / 2,
                  (perp1[1] + perp2[1]) / 2,
                ];
                const avgLen = Math.sqrt(
                  avgPerp[0] * avgPerp[0] + avgPerp[1] * avgPerp[1],
                );
                const normalizedAvg = [
                  avgPerp[0] / avgLen,
                  avgPerp[1] / avgLen,
                ];

                offsetPoints.push([
                  current[0] + normalizedAvg[0] * offset,
                  current[1] + normalizedAvg[1] * offset,
                ] as [number, number]);
              }

              context.beginPath();

              for (let i = 0; i < offsetPoints.length; i++) {
                const current = offsetPoints[i];
                const prev =
                  offsetPoints[
                    (i - 1 + offsetPoints.length) % offsetPoints.length
                  ];
                const next = offsetPoints[(i + 1) % offsetPoints.length];

                const v1 = [prev[0] - current[0], prev[1] - current[1]];
                const v2 = [next[0] - current[0], next[1] - current[1]];

                const len1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1]);
                const len2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1]);
                const n1 = [v1[0] / len1, v1[1] / len1];
                const n2 = [v2[0] / len2, v2[1] / len2];

                const chamferDist = Math.min(
                  chamferSize,
                  Math.min(len1, len2) / 2,
                );
                const chamferStart = [
                  current[0] + n1[0] * chamferDist,
                  current[1] + n1[1] * chamferDist,
                ];
                const chamferEnd = [
                  current[0] + n2[0] * chamferDist,
                  current[1] + n2[1] * chamferDist,
                ];

                if (i === 0) {
                  context.moveTo(chamferStart[0], chamferStart[1]);
                } else {
                  context.lineTo(chamferStart[0], chamferStart[1]);
                }
                context.lineTo(chamferEnd[0], chamferEnd[1]);
              }

              context.closePath();
              context.fillStyle = fillColor;
              context.fill();
              context.strokeStyle = strokeColor;
              context.lineWidth = 1;
              context.stroke();
            }
          } else if (viewMode === "para-bezier") {
            // Parallel offset with Bezier curve smoothing
            if (nodes.length < 3) return;

            const points: [number, number][] = nodes.map((n) => [n.x, n.y]);
            const hull = d3.polygonHull(points);

            if (hull && hull.length >= 3) {
              // Store hull for clipping
              groupHulls.set(uniqueKey, hull);
              const nodeRadius = 10;
              const padding = 5;
              const offset = nodeRadius + padding;
              const smoothness = 0.3;
              const offsetPoints: [number, number][] = [];

              for (let i = 0; i < hull.length; i++) {
                const current = hull[i];
                const prev = hull[(i - 1 + hull.length) % hull.length];
                const next = hull[(i + 1) % hull.length];

                const edge1 = [next[0] - current[0], next[1] - current[1]];
                const edge2 = [current[0] - prev[0], current[1] - prev[1]];

                const len1 = Math.sqrt(
                  edge1[0] * edge1[0] + edge1[1] * edge1[1],
                );
                const len2 = Math.sqrt(
                  edge2[0] * edge2[0] + edge2[1] * edge2[1],
                );
                const norm1 = [edge1[0] / len1, edge1[1] / len1];
                const norm2 = [edge2[0] / len2, edge2[1] / len2];

                const perp1 = [-norm1[1], norm1[0]];
                const perp2 = [-norm2[1], norm2[0]];

                const avgPerp = [
                  (perp1[0] + perp2[0]) / 2,
                  (perp1[1] + perp2[1]) / 2,
                ];
                const avgLen = Math.sqrt(
                  avgPerp[0] * avgPerp[0] + avgPerp[1] * avgPerp[1],
                );
                const normalizedAvg = [
                  avgPerp[0] / avgLen,
                  avgPerp[1] / avgLen,
                ];

                offsetPoints.push([
                  current[0] + normalizedAvg[0] * offset,
                  current[1] + normalizedAvg[1] * offset,
                ] as [number, number]);
              }

              context.beginPath();

              for (let i = 0; i < offsetPoints.length; i++) {
                const current = offsetPoints[i];
                const prev =
                  offsetPoints[
                    (i - 1 + offsetPoints.length) % offsetPoints.length
                  ];
                const next = offsetPoints[(i + 1) % offsetPoints.length];

                if (i === 0) {
                  context.moveTo(current[0], current[1]);
                } else {
                  const cp1x = prev[0] + (current[0] - prev[0]) * smoothness;
                  const cp1y = prev[1] + (current[1] - prev[1]) * smoothness;
                  const cp2x = current[0] - (next[0] - current[0]) * smoothness;
                  const cp2y = current[1] - (next[1] - current[1]) * smoothness;
                  context.bezierCurveTo(
                    cp1x,
                    cp1y,
                    cp2x,
                    cp2y,
                    current[0],
                    current[1],
                  );
                }
              }

              const first = offsetPoints[0];
              const last = offsetPoints[offsetPoints.length - 1];
              const second = offsetPoints[1];
              const cp1x = last[0] + (first[0] - last[0]) * smoothness;
              const cp1y = last[1] + (first[1] - last[1]) * smoothness;
              const cp2x = first[0] - (second[0] - first[0]) * smoothness;
              const cp2y = first[1] - (second[1] - first[1]) * smoothness;
              context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, first[0], first[1]);

              context.closePath();
              context.fillStyle = fillColor;
              context.fill();
              context.strokeStyle = strokeColor;
              context.lineWidth = 1;
              context.stroke();
            }
          } else if (viewMode === "para-subdiv") {
            // Parallel offset with subdivision smoothing (Chaikin's algorithm)
            if (nodes.length < 3) return;

            const points: [number, number][] = nodes.map((n) => [n.x, n.y]);
            const hull = d3.polygonHull(points);

            if (hull && hull.length >= 3) {
              // Store hull for clipping
              groupHulls.set(uniqueKey, hull);
              const nodeRadius = 10;
              const padding = 5;
              const offset = nodeRadius + padding;
              const iterations = 2;
              const offsetPoints: [number, number][] = [];

              for (let i = 0; i < hull.length; i++) {
                const current = hull[i];
                const prev = hull[(i - 1 + hull.length) % hull.length];
                const next = hull[(i + 1) % hull.length];

                const edge1 = [next[0] - current[0], next[1] - current[1]];
                const edge2 = [current[0] - prev[0], current[1] - prev[1]];

                const len1 = Math.sqrt(
                  edge1[0] * edge1[0] + edge1[1] * edge1[1],
                );
                const len2 = Math.sqrt(
                  edge2[0] * edge2[0] + edge2[1] * edge2[1],
                );
                const norm1 = [edge1[0] / len1, edge1[1] / len1];
                const norm2 = [edge2[0] / len2, edge2[1] / len2];

                const perp1 = [-norm1[1], norm1[0]];
                const perp2 = [-norm2[1], norm2[0]];

                const avgPerp = [
                  (perp1[0] + perp2[0]) / 2,
                  (perp1[1] + perp2[1]) / 2,
                ];
                const avgLen = Math.sqrt(
                  avgPerp[0] * avgPerp[0] + avgPerp[1] * avgPerp[1],
                );
                const normalizedAvg = [
                  avgPerp[0] / avgLen,
                  avgPerp[1] / avgLen,
                ];

                offsetPoints.push([
                  current[0] + normalizedAvg[0] * offset,
                  current[1] + normalizedAvg[1] * offset,
                ] as [number, number]);
              }

              // Chaikin's subdivision
              let smoothed = [...offsetPoints];
              for (let iter = 0; iter < iterations; iter++) {
                const newPoints: [number, number][] = [];
                for (let i = 0; i < smoothed.length; i++) {
                  const current = smoothed[i];
                  const next = smoothed[(i + 1) % smoothed.length];
                  const q = [
                    0.75 * current[0] + 0.25 * next[0],
                    0.75 * current[1] + 0.25 * next[1],
                  ] as [number, number];
                  const r = [
                    0.25 * current[0] + 0.75 * next[0],
                    0.25 * current[1] + 0.75 * next[1],
                  ] as [number, number];
                  newPoints.push(q, r);
                }
                smoothed = newPoints;
              }

              context.beginPath();
              smoothed.forEach((point, i) => {
                if (i === 0) context.moveTo(point[0], point[1]);
                else context.lineTo(point[0], point[1]);
              });
              context.closePath();
              context.fillStyle = fillColor;
              context.fill();
              context.strokeStyle = strokeColor;
              context.lineWidth = 1;
              context.stroke();
            }
          } else if (viewMode === "expand-poly") {
            // Expand point to regular polygon
            const nodeRadius = 10;
            const padding = 5;
            const radius = nodeRadius + padding;
            const sides = 8;

            let basePoints: [number, number][] = [];

            if (nodes.length === 1) {
              // Single node: create regular polygon around it
              const centerX = nodes[0].x;
              const centerY = nodes[0].y;
              for (let i = 0; i < sides; i++) {
                const angle = (i / sides) * 2 * Math.PI;
                basePoints.push([
                  centerX + Math.cos(angle) * radius,
                  centerY + Math.sin(angle) * radius,
                ]);
              }
            } else if (nodes.length === 2) {
              // Two nodes: create capsule polygon
              const p1 = nodes[0];
              const p2 = nodes[1];
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const angle = Math.atan2(dy, dx);
              const dist = Math.sqrt(dx * dx + dy * dy);

              for (let i = 0; i < sides; i++) {
                const theta = (i / sides) * 2 * Math.PI;
                const x = (dist / 2) * Math.cos(theta);
                const y = radius * Math.sin(theta);
                const rotatedX = x * Math.cos(angle) - y * Math.sin(angle);
                const rotatedY = x * Math.sin(angle) + y * Math.cos(angle);
                basePoints.push([
                  p1.x + dx / 2 + rotatedX,
                  p1.y + dy / 2 + rotatedY,
                ]);
              }
            } else {
              // 3+ nodes: use convex hull
              const points: [number, number][] = nodes.map((n) => [n.x, n.y]);
              const hull = d3.polygonHull(points);
              if (hull) {
                basePoints = hull;
                groupHulls.set(uniqueKey, hull);
              }
            }

            if (basePoints.length > 0) {
              context.beginPath();
              basePoints.forEach((point, i) => {
                if (i === 0) context.moveTo(point[0], point[1]);
                else context.lineTo(point[0], point[1]);
              });
              context.closePath();
              context.fillStyle = fillColor;
              context.fill();
              context.strokeStyle = strokeColor;
              context.lineWidth = 1;
              context.stroke();
            }
          } else if (viewMode === "circle-poly") {
            // Circle as polygon
            const nodeRadius = 10;
            const padding = 5;
            const circleRadius = nodeRadius + padding;
            const segments = 32;

            let basePoints: [number, number][] = [];

            if (nodes.length === 1) {
              const centerX = nodes[0].x;
              const centerY = nodes[0].y;
              for (let i = 0; i < segments; i++) {
                const angle = (i / segments) * 2 * Math.PI;
                basePoints.push([
                  centerX + Math.cos(angle) * circleRadius,
                  centerY + Math.sin(angle) * circleRadius,
                ]);
              }
            } else if (nodes.length === 2) {
              const p1 = nodes[0];
              const p2 = nodes[1];
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const angle = Math.atan2(dy, dx);
              const dist = Math.sqrt(dx * dx + dy * dy);

              for (let i = 0; i < segments; i++) {
                const theta = (i / segments) * 2 * Math.PI;
                const x = (dist / 2) * Math.cos(theta);
                const y = circleRadius * Math.sin(theta);
                const rotatedX = x * Math.cos(angle) - y * Math.sin(angle);
                const rotatedY = x * Math.sin(angle) + y * Math.cos(angle);
                basePoints.push([
                  p1.x + dx / 2 + rotatedX,
                  p1.y + dy / 2 + rotatedY,
                ]);
              }
            } else {
              const points: [number, number][] = nodes.map((n) => [n.x, n.y]);
              const hull = d3.polygonHull(points);
              if (hull) {
                basePoints = hull;
                groupHulls.set(uniqueKey, hull);
              }
            }

            if (basePoints.length > 0) {
              context.beginPath();
              basePoints.forEach((point, i) => {
                if (i === 0) context.moveTo(point[0], point[1]);
                else context.lineTo(point[0], point[1]);
              });
              context.closePath();
              context.fillStyle = fillColor;
              context.fill();
              context.strokeStyle = strokeColor;
              context.lineWidth = 1;
              context.stroke();
            }
          } else if (viewMode === "ellipse-wrap") {
            // Minimum bounding ellipse
            const nodeRadius = 10;
            const padding = 5;
            const bufferDistance = nodeRadius + padding;
            const segments = 32;

            let centerX, centerY, radiusX, radiusY, angle;

            if (nodes.length === 1) {
              centerX = nodes[0].x;
              centerY = nodes[0].y;
              radiusX = bufferDistance;
              radiusY = bufferDistance;
              angle = 0;
            } else if (nodes.length === 2) {
              const p1 = nodes[0];
              const p2 = nodes[1];
              centerX = (p1.x + p2.x) / 2;
              centerY = (p1.y + p2.y) / 2;
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              radiusX = dist / 2 + bufferDistance;
              radiusY = bufferDistance;
              angle = Math.atan2(dy, dx);
            } else {
              // 3+ nodes: compute oriented bounding ellipse using PCA
              const points: [number, number][] = nodes.map((n) => [n.x, n.y]);

              // Compute centroid
              const cx =
                points.reduce((sum, p) => sum + p[0], 0) / points.length;
              const cy =
                points.reduce((sum, p) => sum + p[1], 0) / points.length;

              // Compute covariance matrix
              let covXX = 0,
                covYY = 0,
                covXY = 0;
              points.forEach((p) => {
                const dx = p[0] - cx;
                const dy = p[1] - cy;
                covXX += dx * dx;
                covYY += dy * dy;
                covXY += dx * dy;
              });
              covXX /= points.length;
              covYY /= points.length;
              covXY /= points.length;

              // Compute eigenvalues and eigenvectors
              const trace = covXX + covYY;
              const det = covXX * covYY - covXY * covXY;
              const discriminant = Math.sqrt(trace * trace - 4 * det);
              const lambda1 = (trace + discriminant) / 2;

              // Eigenvector for lambda1
              let ev1x, ev1y;
              if (Math.abs(covXY) < 0.0001) {
                ev1x = 1;
                ev1y = 0;
              } else {
                ev1x = lambda1 - covYY;
                ev1y = covXY;
                const len = Math.sqrt(ev1x * ev1x + ev1y * ev1y);
                ev1x /= len;
                ev1y /= len;
              }

              // Compute spread along principal axes
              let maxDist1 = 0,
                maxDist2 = 0;
              points.forEach((p) => {
                const dx = p[0] - cx;
                const dy = p[1] - cy;
                const proj1 = dx * ev1x + dy * ev1y;
                const proj2 = -dx * ev1y + dy * ev1x;
                maxDist1 = Math.max(maxDist1, Math.abs(proj1));
                maxDist2 = Math.max(maxDist2, Math.abs(proj2));
              });

              centerX = cx;
              centerY = cy;
              radiusX = maxDist1 + bufferDistance;
              radiusY = maxDist2 + bufferDistance;
              angle = Math.atan2(ev1y, ev1x);
            }

            // Draw ellipse as polygon
            const basePoints: [number, number][] = [];
            for (let i = 0; i < segments; i++) {
              const theta = (i / segments) * 2 * Math.PI;
              const x = radiusX * Math.cos(theta);
              const y = radiusY * Math.sin(theta);
              const rotatedX = x * Math.cos(angle) - y * Math.sin(angle);
              const rotatedY = x * Math.sin(angle) + y * Math.cos(angle);
              basePoints.push([centerX + rotatedX, centerY + rotatedY]);
            }

            // Store hull for clipping
            groupHulls.set(uniqueKey, basePoints);

            context.beginPath();
            basePoints.forEach((point, i) => {
              if (i === 0) context.moveTo(point[0], point[1]);
              else context.lineTo(point[0], point[1]);
            });
            context.closePath();
            context.fillStyle = fillColor;
            context.fill();
            context.strokeStyle = strokeColor;
            context.lineWidth = 1;
            context.stroke();
          } else if (viewMode === "oriented-rect") {
            // PCA-based oriented bounding rectangle with rounded corners
            const nodeRadius = 10;
            const padding = 5;
            const bufferDistance = nodeRadius + padding;
            const cornerRadius = 8;

            let centerX, centerY, width, height, angle;

            if (nodes.length === 1) {
              centerX = nodes[0].x;
              centerY = nodes[0].y;
              width = bufferDistance * 2;
              height = bufferDistance * 2;
              angle = 0;
            } else if (nodes.length === 2) {
              const p1 = nodes[0];
              const p2 = nodes[1];
              centerX = (p1.x + p2.x) / 2;
              centerY = (p1.y + p2.y) / 2;
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              width = dist + bufferDistance * 2;
              height = bufferDistance * 2;
              angle = Math.atan2(dy, dx);
            } else {
              // 3+ nodes: compute oriented bounding box using PCA
              const points: [number, number][] = nodes.map((n) => [n.x, n.y]);

              // Compute centroid
              const cx =
                points.reduce((sum, p) => sum + p[0], 0) / points.length;
              const cy =
                points.reduce((sum, p) => sum + p[1], 0) / points.length;

              // Compute covariance matrix
              let covXX = 0,
                covYY = 0,
                covXY = 0;
              points.forEach((p) => {
                const dx = p[0] - cx;
                const dy = p[1] - cy;
                covXX += dx * dx;
                covYY += dy * dy;
                covXY += dx * dy;
              });
              covXX /= points.length;
              covYY /= points.length;
              covXY /= points.length;

              // Compute eigenvectors
              const trace = covXX + covYY;
              const det = covXX * covYY - covXY * covXY;
              const discriminant = Math.sqrt(trace * trace - 4 * det);
              const lambda1 = (trace + discriminant) / 2;

              // Eigenvector for lambda1
              let ev1x, ev1y;
              if (Math.abs(covXY) < 0.0001) {
                ev1x = 1;
                ev1y = 0;
              } else {
                ev1x = lambda1 - covYY;
                ev1y = covXY;
                const len = Math.sqrt(ev1x * ev1x + ev1y * ev1y);
                ev1x /= len;
                ev1y /= len;
              }

              // Project points onto principal axes
              let minProj1 = Infinity,
                maxProj1 = -Infinity;
              let minProj2 = Infinity,
                maxProj2 = -Infinity;
              points.forEach((p) => {
                const dx = p[0] - cx;
                const dy = p[1] - cy;
                const proj1 = dx * ev1x + dy * ev1y;
                const proj2 = -dx * ev1y + dy * ev1x;
                minProj1 = Math.min(minProj1, proj1);
                maxProj1 = Math.max(maxProj1, proj1);
                minProj2 = Math.min(minProj2, proj2);
                maxProj2 = Math.max(maxProj2, proj2);
              });

              centerX = cx;
              centerY = cy;
              width = maxProj1 - minProj1 + bufferDistance * 2;
              height = maxProj2 - minProj2 + bufferDistance * 2;
              angle = Math.atan2(ev1y, ev1x);
            }

            // Draw oriented rounded rectangle
            context.save();
            context.translate(centerX, centerY);
            context.rotate(angle);

            context.beginPath();
            context.roundRect(
              -width / 2,
              -height / 2,
              width,
              height,
              cornerRadius,
            );
            context.fillStyle = fillColor;
            context.fill();
            context.strokeStyle = strokeColor;
            context.lineWidth = 1;
            context.stroke();

            context.restore();

            // Store hull for clipping (convert rect to polygon)
            const rectHull: [number, number][] = [
              [-width / 2, -height / 2],
              [width / 2, -height / 2],
              [width / 2, height / 2],
              [-width / 2, height / 2],
            ].map(([x, y]) => {
              const rotatedX = x * Math.cos(angle) - y * Math.sin(angle);
              const rotatedY = x * Math.sin(angle) + y * Math.cos(angle);
              return [centerX + rotatedX, centerY + rotatedY] as [
                number,
                number,
              ];
            });
            groupHulls.set(uniqueKey, rectHull);
          } else if (viewMode === "oriented-rect-rounded") {
            // PCA-based oriented bounding rectangle with adaptive rounding
            const nodeRadius = 10;
            const padding = 5;
            const bufferDistance = nodeRadius + padding;
            const cornerRadius = 8;

            let centerX, centerY, width, height, angle, adaptiveCornerRadius;

            if (nodes.length === 1) {
              // Circle for 1 node
              centerX = nodes[0].x;
              centerY = nodes[0].y;
              const radius = bufferDistance;

              context.beginPath();
              context.arc(centerX, centerY, radius, 0, 2 * Math.PI);
              context.fillStyle = fillColor;
              context.fill();
              context.strokeStyle = strokeColor;
              context.lineWidth = 1;
              context.stroke();
              return;
            } else if (nodes.length === 2) {
              const p1 = nodes[0];
              const p2 = nodes[1];
              centerX = (p1.x + p2.x) / 2;
              centerY = (p1.y + p2.y) / 2;
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              width = dist + bufferDistance * 2;
              height = bufferDistance * 2;
              angle = Math.atan2(dy, dx);
              adaptiveCornerRadius = height / 2; // Fully rounded (capsule)
            } else {
              // 3+ nodes: compute oriented bounding box using PCA
              const points: [number, number][] = nodes.map((n) => [n.x, n.y]);

              // Compute centroid
              const cx =
                points.reduce((sum, p) => sum + p[0], 0) / points.length;
              const cy =
                points.reduce((sum, p) => sum + p[1], 0) / points.length;

              // Compute covariance matrix
              let covXX = 0,
                covYY = 0,
                covXY = 0;
              points.forEach((p) => {
                const dx = p[0] - cx;
                const dy = p[1] - cy;
                covXX += dx * dx;
                covYY += dy * dy;
                covXY += dx * dy;
              });
              covXX /= points.length;
              covYY /= points.length;
              covXY /= points.length;

              // Compute eigenvectors
              const trace = covXX + covYY;
              const det = covXX * covYY - covXY * covXY;
              const discriminant = Math.sqrt(trace * trace - 4 * det);
              const lambda1 = (trace + discriminant) / 2;

              // Eigenvector for lambda1
              let ev1x, ev1y;
              if (Math.abs(covXY) < 0.0001) {
                ev1x = 1;
                ev1y = 0;
              } else {
                ev1x = lambda1 - covYY;
                ev1y = covXY;
                const len = Math.sqrt(ev1x * ev1x + ev1y * ev1y);
                ev1x /= len;
                ev1y /= len;
              }

              // Project points onto principal axes
              let minProj1 = Infinity,
                maxProj1 = -Infinity;
              let minProj2 = Infinity,
                maxProj2 = -Infinity;
              points.forEach((p) => {
                const dx = p[0] - cx;
                const dy = p[1] - cy;
                const proj1 = dx * ev1x + dy * ev1y;
                const proj2 = -dx * ev1y + dy * ev1x;
                minProj1 = Math.min(minProj1, proj1);
                maxProj1 = Math.max(maxProj1, proj1);
                minProj2 = Math.min(minProj2, proj2);
                maxProj2 = Math.max(maxProj2, proj2);
              });

              centerX = cx;
              centerY = cy;
              width = maxProj1 - minProj1 + bufferDistance * 2;
              height = maxProj2 - minProj2 + bufferDistance * 2;
              angle = Math.atan2(ev1y, ev1x);
              adaptiveCornerRadius = cornerRadius;
            }

            // Draw oriented rounded rectangle
            context.save();
            context.translate(centerX, centerY);
            context.rotate(angle);

            context.beginPath();
            context.roundRect(
              -width / 2,
              -height / 2,
              width,
              height,
              adaptiveCornerRadius,
            );
            context.fillStyle = fillColor;
            context.fill();
            context.strokeStyle = strokeColor;
            context.lineWidth = 1;
            context.stroke();

            context.restore();

            // Store hull for clipping (convert rect to polygon)
            const rectHull2: [number, number][] = [
              [-width / 2, -height / 2],
              [width / 2, -height / 2],
              [width / 2, height / 2],
              [-width / 2, height / 2],
            ].map(([x, y]) => {
              const rotatedX = x * Math.cos(angle) - y * Math.sin(angle);
              const rotatedY = x * Math.sin(angle) + y * Math.cos(angle);
              return [centerX + rotatedX, centerY + rotatedY] as [
                number,
                number,
              ];
            });
            groupHulls.set(uniqueKey, rectHull2);
          } else if (viewMode === "oriented-rect-roundpoly" || viewMode === "poly-solid") {
            // Adaptive rounding with Para+ polygons for 3+ nodes
            const nodeRadius = 10;
            const padding = 5;
            const bufferDistance = nodeRadius + padding;

            if (nodes.length === 1) {
              // Circle for 1 node
              const centerX = nodes[0].x;
              const centerY = nodes[0].y;
              const radius = bufferDistance;

              context.beginPath();
              context.arc(centerX, centerY, radius, 0, 2 * Math.PI);
              context.fillStyle = fillColor;
              context.fill();
              context.strokeStyle = strokeColor;
              context.lineWidth = 1;
              context.stroke();
              return;
            } else if (nodes.length === 2) {
              // Capsule for 2 nodes
              const p1 = nodes[0];
              const p2 = nodes[1];
              const centerX = (p1.x + p2.x) / 2;
              const centerY = (p1.y + p2.y) / 2;
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const width = dist + bufferDistance * 2;
              const height = bufferDistance * 2;
              const angle = Math.atan2(dy, dx);
              const adaptiveCornerRadius = height / 2;

              context.save();
              context.translate(centerX, centerY);
              context.rotate(angle);

              context.beginPath();
              context.roundRect(
                -width / 2,
                -height / 2,
                width,
                height,
                adaptiveCornerRadius,
              );
              context.fillStyle = fillColor;
              context.fill();
              context.strokeStyle = strokeColor;
              context.lineWidth = 1;
              context.stroke();

              context.restore();
            } else {
              // 3+ nodes: Minkowski sum with circle for proper rounded corners
              const points: [number, number][] = nodes.map((n) => [n.x, n.y]);
              const hull = d3.polygonHull(points);

              if (hull && hull.length >= 3) {
                // Store hull for clipping
                groupHulls.set(uniqueKey, hull);
                const offset = bufferDistance;
                const radius = bufferDistance;

                // Helper to normalize vector
                const normalize = (v: [number, number]): [number, number] => {
                  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
                  return [v[0] / len, v[1] / len];
                };

                // Helper to get perpendicular (rotated 90 degrees counter-clockwise)
                const perpendicular = (
                  v: [number, number],
                ): [number, number] => {
                  return [-v[1], v[0]];
                };

                context.beginPath();

                // Process each vertex of the hull
                for (let i = 0; i < hull.length; i++) {
                  const current = hull[i];
                  const prev = hull[(i - 1 + hull.length) % hull.length];
                  const next = hull[(i + 1) % hull.length];

                  // Edge vectors (pointing away from current)
                  const edge1 = [
                    prev[0] - current[0],
                    prev[1] - current[1],
                  ] as [number, number];
                  const edge2 = [
                    next[0] - current[0],
                    next[1] - current[1],
                  ] as [number, number];

                  // Normalize edge vectors
                  const norm1 = normalize(edge1);
                  const norm2 = normalize(edge2);

                  // Outward perpendicular normals
                  const perp1 = perpendicular(norm1);
                  const perp2 = perpendicular(norm2);

                  // Check if normals point outward (away from polygon center)
                  const centroid: [number, number] = [
                    hull.reduce((sum, p) => sum + p[0], 0) / hull.length,
                    hull.reduce((sum, p) => sum + p[1], 0) / hull.length,
                  ];
                  const toCenter: [number, number] = [
                    centroid[0] - current[0],
                    centroid[1] - current[1],
                  ];

                  if (perp1[0] * toCenter[0] + perp1[1] * toCenter[1] > 0) {
                    perp1[0] = -perp1[0];
                    perp1[1] = -perp1[1];
                  }
                  if (perp2[0] * toCenter[0] + perp2[1] * toCenter[1] > 0) {
                    perp2[0] = -perp2[0];
                    perp2[1] = -perp2[1];
                  }

                  // Compute offset edge lines
                  const offsetEdge1_p1 = [
                    prev[0] + perp1[0] * offset,
                    prev[1] + perp1[1] * offset,
                  ] as [number, number];
                  const offsetEdge1_p2 = [
                    current[0] + perp1[0] * offset,
                    current[1] + perp1[1] * offset,
                  ] as [number, number];

                  if (i === 0) {
                    // Start at the first offset edge point
                    context.moveTo(offsetEdge1_p1[0], offsetEdge1_p1[1]);
                  }

                  // Draw line to the start of the arc (along offset edge 1)
                  context.lineTo(offsetEdge1_p2[0], offsetEdge1_p2[1]);

                  // Draw circular arc centered at the original vertex
                  // The arc connects the two offset edges
                  const angle1 = Math.atan2(perp1[1], perp1[0]);
                  const angle2 = Math.atan2(perp2[1], perp2[0]);

                  // Determine arc direction (should go around the outside)
                  const cross = perp1[0] * perp2[1] - perp1[1] * perp2[0];
                  let startAngle = angle1;
                  let endAngle = angle2;

                  if (cross < 0) {
                    // Arc goes counter-clockwise
                    if (endAngle < startAngle) endAngle += 2 * Math.PI;
                  } else {
                    // Arc goes clockwise
                    if (endAngle > startAngle) endAngle -= 2 * Math.PI;
                  }

                  context.arc(
                    current[0],
                    current[1],
                    radius,
                    startAngle,
                    endAngle,
                    cross < 0,
                  );
                }

                context.closePath();
                context.fillStyle = fillColor;
                context.fill();
                context.strokeStyle = strokeColor;
                context.lineWidth = 1;
                context.stroke();
              }
            }
          } else if (viewMode === "oriented-rect-roundpoly2") {
            // Adaptive rounding with Para+ polygons for 3+ nodes (Polygon2 - copy of Polygon)
            const nodeRadius = 10;
            const padding = 5;
            const bufferDistance = nodeRadius + padding;

            if (nodes.length === 1) {
              // Circle for 1 node
              const centerX = nodes[0].x;
              const centerY = nodes[0].y;
              const radius = bufferDistance;

              context.beginPath();
              context.arc(centerX, centerY, radius, 0, 2 * Math.PI);
              context.fillStyle = fillColor;
              context.fill();
              context.strokeStyle = strokeColor;
              context.lineWidth = 1;
              context.stroke();
              return;
            } else if (nodes.length === 2) {
              // Capsule for 2 nodes
              const p1 = nodes[0];
              const p2 = nodes[1];
              const centerX = (p1.x + p2.x) / 2;
              const centerY = (p1.y + p2.y) / 2;
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const width = dist + bufferDistance * 2;
              const height = bufferDistance * 2;
              const angle = Math.atan2(dy, dx);
              const adaptiveCornerRadius = height / 2;

              context.save();
              context.translate(centerX, centerY);
              context.rotate(angle);

              context.beginPath();
              context.roundRect(
                -width / 2,
                -height / 2,
                width,
                height,
                adaptiveCornerRadius,
              );
              context.fillStyle = fillColor;
              context.fill();
              context.strokeStyle = strokeColor;
              context.lineWidth = 1;
              context.stroke();

              context.restore();
            } else {
              // 3+ nodes: Minkowski sum with circle for proper rounded corners
              const points: [number, number][] = nodes.map((n) => [n.x, n.y]);
              const hull = d3.polygonHull(points);

              if (hull && hull.length >= 3) {
                // Store hull for clipping
                groupHulls.set(uniqueKey, hull);
                const offset = bufferDistance;
                const radius = bufferDistance;

                // Helper to normalize vector
                const normalize = (v: [number, number]): [number, number] => {
                  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
                  return [v[0] / len, v[1] / len];
                };

                // Helper to get perpendicular (rotated 90 degrees counter-clockwise)
                const perpendicular = (
                  v: [number, number],
                ): [number, number] => {
                  return [-v[1], v[0]];
                };

                context.beginPath();

                // Process each vertex of the hull
                for (let i = 0; i < hull.length; i++) {
                  const current = hull[i];
                  const prev = hull[(i - 1 + hull.length) % hull.length];
                  const next = hull[(i + 1) % hull.length];

                  // Edge vectors (pointing away from current)
                  const edge1 = [
                    prev[0] - current[0],
                    prev[1] - current[1],
                  ] as [number, number];
                  const edge2 = [
                    next[0] - current[0],
                    next[1] - current[1],
                  ] as [number, number];

                  // Normalize edge vectors
                  const norm1 = normalize(edge1);
                  const norm2 = normalize(edge2);

                  // Outward perpendicular normals
                  const perp1 = perpendicular(norm1);
                  const perp2 = perpendicular(norm2);

                  // Check if normals point outward (away from polygon center)
                  const centroid: [number, number] = [
                    hull.reduce((sum, p) => sum + p[0], 0) / hull.length,
                    hull.reduce((sum, p) => sum + p[1], 0) / hull.length,
                  ];
                  const toCenter: [number, number] = [
                    centroid[0] - current[0],
                    centroid[1] - current[1],
                  ];

                  if (perp1[0] * toCenter[0] + perp1[1] * toCenter[1] > 0) {
                    perp1[0] = -perp1[0];
                    perp1[1] = -perp1[1];
                  }
                  if (perp2[0] * toCenter[0] + perp2[1] * toCenter[1] > 0) {
                    perp2[0] = -perp2[0];
                    perp2[1] = -perp2[1];
                  }

                  // Compute offset edge lines
                  const offsetEdge1_p1 = [
                    prev[0] + perp1[0] * offset,
                    prev[1] + perp1[1] * offset,
                  ] as [number, number];
                  const offsetEdge1_p2 = [
                    current[0] + perp1[0] * offset,
                    current[1] + perp1[1] * offset,
                  ] as [number, number];

                  if (i === 0) {
                    // Start at the first offset edge point
                    context.moveTo(offsetEdge1_p1[0], offsetEdge1_p1[1]);
                  }

                  // Draw line to the start of the arc (along offset edge 1)
                  context.lineTo(offsetEdge1_p2[0], offsetEdge1_p2[1]);

                  // Draw circular arc centered at the original vertex
                  // The arc connects the two offset edges
                  const angle1 = Math.atan2(perp1[1], perp1[0]);
                  const angle2 = Math.atan2(perp2[1], perp2[0]);

                  // Determine arc direction (should go around the outside)
                  const cross = perp1[0] * perp2[1] - perp1[1] * perp2[0];
                  let startAngle = angle1;
                  let endAngle = angle2;

                  if (cross < 0) {
                    // Arc goes counter-clockwise
                    if (endAngle < startAngle) endAngle += 2 * Math.PI;
                  } else {
                    // Arc goes clockwise
                    if (endAngle > startAngle) endAngle -= 2 * Math.PI;
                  }

                  context.arc(
                    current[0],
                    current[1],
                    radius,
                    startAngle,
                    endAngle,
                    cross < 0,
                  );
                }

                context.closePath();
                context.fillStyle = fillColor;
                context.fill();
                context.strokeStyle = strokeColor;
                context.lineWidth = 1;
                context.stroke();
              }
            }
          } else if (viewMode === "circles") {
            // Circle enclosure for circles mode
            if (nodes.length < 1) return;

            // Calculate centroid
            const sumX = nodes.reduce((sum, n) => sum + n.x, 0);
            const sumY = nodes.reduce((sum, n) => sum + n.y, 0);
            const centerX = sumX / nodes.length;
            const centerY = sumY / nodes.length;

            // Calculate max distance from centroid
            const maxDistance = Math.max(
              ...nodes.map((n) =>
                Math.sqrt((n.x - centerX) ** 2 + (n.y - centerY) ** 2),
              ),
            );

            // Add padding
            const circlePadding = 15;
            const radius = maxDistance + circlePadding;

            context.beginPath();
            context.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            context.fillStyle = fillColor;
            context.fill();
            context.strokeStyle = strokeColor;
            context.lineWidth = 1;
            context.stroke();

            // Store hull for clipping (convert circle to polygon)
            const circleHull: [number, number][] = [];
            const segments = 32;
            for (let i = 0; i < segments; i++) {
              const theta = (i / segments) * 2 * Math.PI;
              circleHull.push([
                centerX + radius * Math.cos(theta),
                centerY + radius * Math.sin(theta),
              ]);
            }
            groupHulls.set(uniqueKey, circleHull);
          } else if (viewMode === "boxes" || viewMode === "poly-blocks") {
            // Bounding box with rounded corners for boxes mode
            const padding = 15;
            let minX: number;
            let minY: number;
            let maxX: number;
            let maxY: number;

            if (nodes.length > 0) {
              minX = Math.min(...nodes.map((n) => n.x)) - padding;
              maxX = Math.max(...nodes.map((n) => n.x)) + padding;
              minY = Math.min(...nodes.map((n) => n.y)) - padding;
              maxY = Math.max(...nodes.map((n) => n.y)) + padding;
            } else {
              // Empty module: use its treemap cell as the block geometry
              const rect = polyBlocksRectsRef.current.rects.get(uniqueKey);
              if (!rect) return;
              minX = rect.x0;
              minY = rect.y0;
              maxX = rect.x1;
              maxY = rect.y1;
            }
            const width = maxX - minX;
            const height = maxY - minY;
            const radius = 8;

            context.beginPath();
            context.roundRect(minX, minY, width, height, radius);
            context.fillStyle = fillColor;
            context.fill();
            context.strokeStyle = strokeColor;
            context.lineWidth = 1;
            context.stroke();

            // Store hull for clipping (convert rect to polygon)
            const boxHull: [number, number][] = [
              [minX, minY],
              [maxX, minY],
              [maxX, maxY],
              [minX, maxY],
            ];
            groupHulls.set(uniqueKey, boxHull);
          }
        });

        // Draw module name just above each group's shape
        groupHulls.forEach((hull, key) => {
          const xs = hull.map((p) => p[0]);
          const ys = hull.map((p) => p[1]);
          const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
          const top = Math.min(...ys);
          const folder = key.includes("/")
            ? key.slice(0, key.lastIndexOf("/"))
            : "root";
          const folderColor = colorScale(folder) as string;

          context.font =
            '10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          context.fillStyle = folderColor;
          context.textAlign = "center";
          context.textBaseline = "bottom";
          context.fillText(key, cx, top - 6);
          context.textAlign = "left";
          context.textBaseline = "alphabetic";
        });
      }

      // Pre-build node id map for O(1) lookups
      const nodeById = new Map<string, any>();
      filteredNodes.forEach((n: any) => nodeById.set(n.id, n));

      // Pre-compute hovered edge id set to avoid .some() closures per edge
      const hoveredEdgeIds = new Set<string>();
      hoveredEdgesRef.current.forEach((e: any) => {
        if (e) {
          if (e.id) hoveredEdgeIds.add(e.id);
          if (e.source?.id) hoveredEdgeIds.add(e.source.id);
        }
      });

      // Draw edges
      const hoveredNodes = hoveredNodeRef.current;
      const hoveredNodeId = Array.isArray(hoveredNodes)
        ? hoveredNodes[0]?.id
        : hoveredNodes?.id;
      const selectedNodeId = selectedNodeRef.current;

      // Helper to get file key for a node (matching grouping key format)
      const getFileKey = (node: any) => {
        const f = node?.data?.folder || "";
        const file = node?.data?.file || "";
        return f ? `${f}/${file}` : file;
      };

      // File-level hover/selection for grouping mode
      const hoveredFileKey = hoveredNodeId
        ? getFileKey(nodeById.get(hoveredNodeId))
        : null;
      const selectedFileKey = selectedNodeId
        ? getFileKey(nodeById.get(selectedNodeId))
        : null;

      // Check if we're in a grouping mode
      const isGroupingMode =
        viewMode === "circles" ||
        viewMode === "boxes" ||
        viewMode === "para-fillet" ||
        viewMode === "para-bezier" ||
        viewMode === "para-subdiv" ||
        viewMode === "expand-poly" ||
        viewMode === "circle-poly" ||
        viewMode === "ellipse-wrap" ||
        viewMode === "oriented-rect" ||
        viewMode === "oriented-rect-rounded" ||
        viewMode === "oriented-rect-roundpoly" ||
        viewMode === "oriented-rect-roundpoly2" ||
        viewMode === "poly-solid" ||
        viewMode === "poly-blocks";

      if (isGroupingMode) {
        // Group edges by file-to-file connections for namespace imports
        const fileToNodes = new Map<string, any[]>();
        filteredNodes.forEach((node: any) => {
          const file = node.data.file;
          const folder = node.data.folder || "";
          const uniqueKey = folder ? `${folder}/${file}` : file;
          if (!fileToNodes.has(uniqueKey)) {
            fileToNodes.set(uniqueKey, []);
          }
          fileToNodes.get(uniqueKey)!.push(node);
        });

        // Calculate centers for each file
        const fileCentroids = new Map<string, { x: number; y: number }>();
        fileToNodes.forEach((nodes, file) => {
          if (viewMode === "poly-blocks") {
            const xs = nodes.map((n: any) => n.x);
            const ys = nodes.map((n: any) => n.y);
            fileCentroids.set(file, {
              x: (Math.min(...xs) + Math.max(...xs)) / 2,
              y: (Math.min(...ys) + Math.max(...ys)) / 2,
            });
          } else {
            const sumX = nodes.reduce((sum, n) => sum + n.x, 0);
            const sumY = nodes.reduce((sum, n) => sum + n.y, 0);
            fileCentroids.set(file, {
              x: sumX / nodes.length,
              y: sumY / nodes.length,
            });
          }
        });

        // Module centroid: from member nodes, or from the block rect for empty modules
        const getModuleCentroid = (fileKey: string): { x: number; y: number } | undefined => {
          const centroid = fileCentroids.get(fileKey);
          if (centroid) return centroid;
          const rect = polyBlocksRectsRef.current.rects.get(fileKey);
          if (rect) {
            return {
              x: (rect.x0 + rect.x1) / 2,
              y: (rect.y0 + rect.y1) / 2,
            };
          }
          return undefined;
        };

        // Segments shared between pass-through connections are stroked only once
        const strokedSegments = new Set<string>();
        const strokeSegment = (
          p1: { x: number; y: number },
          p2: { x: number; y: number },
          color: string,
          width: number,
          alpha: number,
        ) => {
          const key = `${p1.x},${p1.y}->${p2.x},${p2.y}`;
          if (strokedSegments.has(key)) return;
          strokedSegments.add(key);
          context.beginPath();
          context.moveTo(p1.x, p1.y);
          context.lineTo(p2.x, p2.y);
          context.strokeStyle = color;
          context.lineWidth = width;
          context.globalAlpha = alpha;
          context.stroke();
          context.globalAlpha = 1;
        };

        // Resolve edge source/target from string IDs to node objects
        const nodeMap = new Map<string, any>();
        filteredNodes.forEach((node: any) => nodeMap.set(node.id, node));

        const resolvedEdges = filteredEdges
          .map((edge: any) => ({
            ...edge,
            source: typeof edge.source === "string" ? nodeMap.get(edge.source) : edge.source,
            target: typeof edge.target === "string" ? nodeMap.get(edge.target) : edge.target,
          }))
          .filter((edge: any) => edge.source && edge.target);

        // Separate edge types for polygon view:
        // - Wildcard imports: source file centroid -> target file centroid
        // - Named imports: source file centroid -> target symbol node
        // - Symbol-level dynamic imports: source symbol node -> target file centroid
        const fileConnections = new Map<
          string,
          Map<string, { count: number; types: Set<string>; via: Set<string> }>
        >();
        const namedImportEdges: any[] = []; // source file -> target symbol
        const symbolLevelEdges: any[] = []; // source symbol -> target file
        const processedEdges = new Set<string>();

        resolvedEdges.forEach((edge: any) => {
          // Skip intra-file edges in grouping modes
          const sourceFolder = edge.source.data.folder || "";
          const targetFolder = edge.target.data.folder || "";
          const sourceKey = sourceFolder
            ? `${sourceFolder}/${edge.source.data.file}`
            : edge.source.data.file;
          const targetKey = targetFolder
            ? `${targetFolder}/${edge.target.data.file}`
            : edge.target.data.file;

          if (sourceKey === targetKey) {
            return;
          }

          // Symbol-level: dynamic imports from specific functions
          if (edge.sourceSymbolType === "function") {
            symbolLevelEdges.push(edge);
            processedEdges.add(edge.id);
          }
          // Named imports: source file -> target symbol (not wildcard, not symbol-level)
          else if (edge.type === "import" || edge.type === "re-export") {
            namedImportEdges.push(edge);
            processedEdges.add(edge.id);
          }
          // Wildcard and module-level: aggregate by file-to-file
          else {
            if (!fileConnections.has(sourceKey)) {
              fileConnections.set(sourceKey, new Map());
            }
            const targetMap = fileConnections.get(sourceKey)!;
            if (!targetMap.has(targetKey)) {
              targetMap.set(targetKey, {
                count: 0,
                types: new Set(),
                via: new Set(),
              });
            }
            const connection = targetMap.get(targetKey)!;
            connection.count++;
            connection.types.add(edge.type);
            if (edge.via && edge.via.length > 0) {
              edge.via.forEach((b: string) => connection.via.add(b));
            }
            processedEdges.add(edge.id);
          }
        });

        // Build file-level edge lines for hover detection in grouping mode
        const fileEdgeLines: { key: string; sx: number; sy: number; tx: number; ty: number; label: string }[] = [];

        // Draw single edges for file-to-file connections between file centroids
        fileConnections.forEach((targetMap, sourceFile) => {
          const sourceCentroid = fileCentroids.get(sourceFile);
          if (!sourceCentroid) return;

          // Get folder color for the source file
          const sourcePathParts = sourceFile.split("/");
          const sourceFolder = sourcePathParts.slice(0, -1).join("/") || "root";
          const sourceColor = colorScale(sourceFolder) as string;

          // Convert hex to rgba
          const hexToRgba = (hex: string, alpha: number): string => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
          };
          const edgeColor = hexToRgba(sourceColor, 1);

          targetMap.forEach((connection, targetFile) => {
            const targetCentroid = getModuleCentroid(targetFile);
            if (!targetCentroid) return;

            const edgeKey = `${sourceFile}||${targetFile}`;
            const label = connection.types.has("wildcard")
              ? "namespace import"
              : Array.from(connection.types).join(", ");

            // Route through intermediate barrels (re-export pass-through)
            const points: { x: number; y: number }[] = [
              { x: sourceCentroid.x, y: sourceCentroid.y },
            ];
            Array.from(connection.via).forEach((barrel) => {
              const barrelCentroid = getModuleCentroid(barrel);
              if (barrelCentroid) points.push(barrelCentroid);
            });
            points.push({ x: targetCentroid.x, y: targetCentroid.y });

            const isHoveredFile =
              hoveredFileKey && sourceFile === hoveredFileKey;
            const isSelectedFile =
              selectedFileKey && sourceFile === selectedFileKey;
            const isEdgeHovered = hoveredEdgeIds.has(edgeKey);

            // Use line width based on edge count (min 2, max 8)
            const lineWidth = Math.min(
              8,
              Math.max(2, Math.log2(connection.count) + 2),
            );
            const isWildcard = connection.types.has("wildcard");

            // Register each segment for hover detection (same key) and stroke,
            // deduplicating segments shared between pass-through connections
            for (let i = 0; i < points.length - 1; i++) {
              fileEdgeLines.push({
                key: edgeKey,
                sx: points[i].x,
                sy: points[i].y,
                tx: points[i + 1].x,
                ty: points[i + 1].y,
                label: i === 0 ? label : "",
              });
              strokeSegment(
                points[i],
                points[i + 1],
                edgeColor,
                isWildcard ? 5 : lineWidth,
                isHoveredFile || isSelectedFile || isEdgeHovered ? 1 : edgeOpacity,
              );
            }
          });
        });

        // Deduplicate named import edges: same source file → same target symbol = one line
        const seenNamedEdges = new Set<string>();
        const dedupedNamedEdges = namedImportEdges.filter((edge: any) => {
          const sourceFolder = edge.source.data.folder || "";
          const sourceKey = sourceFolder
            ? `${sourceFolder}/${edge.source.data.file}`
            : edge.source.data.file;
          const key = `${sourceKey}->${edge.target.id}`;
          if (seenNamedEdges.has(key)) return false;
          seenNamedEdges.add(key);
          return true;
        });

        // Draw named import edges from source file centroid to target symbol node
        dedupedNamedEdges.forEach((edge: any) => {
          const sourceFolder = edge.source.data.folder || "";
          const sourceKey = sourceFolder
            ? `${sourceFolder}/${edge.source.data.file}`
            : edge.source.data.file;
          const sourceCentroid = fileCentroids.get(sourceKey);

          if (!sourceCentroid) return;

          const offset = 12;

          // Route through intermediate barrels (re-export pass-through)
          const points: { x: number; y: number }[] = [
            { x: sourceCentroid.x, y: sourceCentroid.y },
          ];
          (edge.via || []).forEach((barrel: string) => {
            const barrelCentroid = getModuleCentroid(barrel);
            if (barrelCentroid) points.push(barrelCentroid);
          });
          points.push({ x: edge.target.x, y: edge.target.y });

          // Shorten the last segment so the line stops before the target symbol
          if (points.length >= 2) {
            const last = points[points.length - 1];
            const prev = points[points.length - 2];
            const segDx = last.x - prev.x;
            const segDy = last.y - prev.y;
            const segDist = Math.sqrt(segDx * segDx + segDy * segDy);
            if (segDist > 0) {
              last.x = prev.x + (segDx / segDist) * Math.max(0, segDist - offset);
              last.y = prev.y + (segDy / segDist) * Math.max(0, segDist - offset);
            }
          }

          const namedKey = `named:${sourceKey}->${edge.target.id}`;
          const namedColor = colorScale(
            folderMap.get(edge.source.id) || "root",
          ) as string;
          const isOutgoingFromHovered =
            hoveredFileKey && sourceKey === hoveredFileKey;
          const isOutgoingFromSelected =
            selectedFileKey && sourceKey === selectedFileKey;
          const isEdgeHovered = hoveredEdgeIds.has(namedKey);
          const namedAlpha =
            isOutgoingFromHovered || isOutgoingFromSelected || isEdgeHovered
              ? 1
              : edgeOpacity;
          for (let i = 0; i < points.length - 1; i++) {
            fileEdgeLines.push({
              key: namedKey,
              sx: points[i].x,
              sy: points[i].y,
              tx: points[i + 1].x,
              ty: points[i + 1].y,
              label: i === 0 ? edge.label : "",
            });
            strokeSegment(points[i], points[i + 1], namedColor, 2, namedAlpha);
          }
        });

        // Draw symbol-level edges from specific symbol nodes to target file centroids
        symbolLevelEdges.forEach((edge: any) => {
          const targetFolder = edge.target.data.folder || "";
          const targetKey = targetFolder
            ? `${targetFolder}/${edge.target.data.file}`
            : edge.target.data.file;
          const targetCentroid = fileCentroids.get(targetKey);

          if (!targetCentroid) return;

          const dx = targetCentroid.x - edge.source.x;
          const dy = targetCentroid.y - edge.source.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const offset = 12;

          let targetX = targetCentroid.x;
          let targetY = targetCentroid.y;

          if (distance > 0) {
            targetX = edge.source.x + (dx / distance) * (distance - offset);
            targetY = edge.source.y + (dy / distance) * (distance - offset);
          }

          context.beginPath();
          context.moveTo(edge.source.x, edge.source.y);
          context.lineTo(targetX, targetY);
          context.strokeStyle = colorScale(
            folderMap.get(edge.source.id) || "root",
          ) as string;
          context.lineWidth = 2;
          const symbolKey = `symbol:${edge.source.id}->${targetKey}`;
          fileEdgeLines.push({ key: symbolKey, sx: edge.source.x, sy: edge.source.y, tx: targetX, ty: targetY, label: edge.label });
          const isOutgoingFromHovered =
            hoveredNodeId && edge.source.id === hoveredNodeId;
          const isOutgoingFromSelected =
            selectedNodeId && edge.source.id === selectedNodeId;
          const isEdgeHovered = hoveredEdgeIds.has(symbolKey);
          context.globalAlpha =
            isOutgoingFromHovered || isOutgoingFromSelected || isEdgeHovered
              ? 1
              : edgeOpacity;
          context.stroke();
          context.globalAlpha = 1;
        });

        fileLevelEdgesRef.current = fileEdgeLines;

        // Draw edge labels for hovered file-level edges
        fileEdgeLines.forEach((flEdge) => {
          if (flEdge.label && hoveredEdgeIds.has(flEdge.key)) {
            const midX = (flEdge.sx + flEdge.tx) / 2;
            const midY = (flEdge.sy + flEdge.ty) / 2;

            context.font =
              '10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            const textWidth = context.measureText(flEdge.label).width;
            const padding = 6;
            const rectWidth = textWidth + padding * 2;
            const rectHeight = 20;
            const rectX = midX - rectWidth / 2;
            const rectY = midY - rectHeight / 2;

            context.fillStyle = "rgba(9, 9, 11, 0.5)";
            context.beginPath();
            context.roundRect(rectX, rectY, rectWidth, rectHeight, 4);
            context.fill();

            context.fillStyle = "#fafafa";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(flEdge.label, midX, midY);
          }
        });

        // Clip edges inside groups using destination-out compositing
        // Only apply clipping for Polygon2 (oriented-rect-roundpoly2), not for Polygon
        if (groupHulls.size > 0 && viewMode === "oriented-rect-roundpoly2") {
          context.save();
          context.globalCompositeOperation = "destination-out";

          groupHulls.forEach((hull) => {
            context.beginPath();
            hull.forEach((point, i) => {
              if (i === 0) context.moveTo(point[0], point[1]);
              else context.lineTo(point[0], point[1]);
            });
            context.closePath();
            context.fill();
          });

          context.restore();
        }
      } else {
        // Edges mode: draw all individual edges
        filteredEdges.forEach((edge: any) => {
          const dx = edge.target.x - edge.source.x;
          const dy = edge.target.y - edge.source.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const offset = 12;

          let targetX = edge.target.x;
          let targetY = edge.target.y;

          if (distance > 0) {
            targetX = edge.source.x + (dx / distance) * (distance - offset);
            targetY = edge.source.y + (dy / distance) * (distance - offset);
          }

          context.beginPath();
          context.moveTo(edge.source.x, edge.source.y);
          context.lineTo(targetX, targetY);
          context.strokeStyle = colorScale(
            folderMap.get(edge.source.id) || "root",
          ) as string;
          context.lineWidth = 2;
          const isOutgoingFromHovered =
            hoveredNodeId && edge.source.id === hoveredNodeId;
          const isOutgoingFromSelected =
            selectedNodeId && edge.source.id === selectedNodeId;
          const isHoveredEdge = hoveredEdgeIds.has(edge.id);
          context.globalAlpha =
            isOutgoingFromHovered || isOutgoingFromSelected || isHoveredEdge
              ? 1
              : edgeOpacity;
          context.stroke();
          context.globalAlpha = 1;
        });
      }

      // Draw collision and group bounding circles in polygon view
      if (viewMode !== "edges" && viewMode !== "poly-blocks") {
        filteredNodes.forEach((node: any) => {
          context.beginPath();
          context.arc(node.x, node.y, 15, 0, 2 * Math.PI);
          context.strokeStyle = "rgba(255, 0, 0, 0.4)";
          context.lineWidth = 1;
          context.stroke();
        });
      }

      // Draw nodes
      filteredNodes.forEach((node: any) => {
        const isSelected = node.id === selectedNodeRef.current;
        const hoveredNodes = hoveredNodeRef.current;
        const isHovered = Array.isArray(hoveredNodes)
          ? hoveredNodes.some((n: any) => n.id === node.id)
          : hoveredNodes?.id === node.id;
          const isEdgeSource = hoveredEdgeIds.has(node.id);
        const hasUnknownDynamicImport = node.data.hasUnknownDynamicImport;

        context.beginPath();
        context.arc(node.x, node.y, isSelected ? 7 : 5, 0, 2 * Math.PI);
        context.fillStyle = colorScale(
          folderMap.get(node.id) || "root",
        ) as string;
        context.fill();

        // Use orange border for nodes with unknown dynamic imports
        if (hasUnknownDynamicImport && !isSelected) {
          context.strokeStyle = "#f97316"; // orange-500
          context.lineWidth = 2;
        } else {
          context.strokeStyle = isSelected ? "#ffffff" : "#171717";
          context.lineWidth = isSelected ? 2.5 : 1.5;
        }
        context.stroke();

        // Draw hover overlay (50% opacity neutral-50) on top of border
        if ((isHovered || isEdgeSource) && !isSelected) {
          context.beginPath();
          context.arc(node.x, node.y, 8, 0, 2 * Math.PI);
          context.fillStyle = "rgba(250, 250, 250, 0.5)";
          context.fill();
        }

        // Draw warning indicator for unknown dynamic imports
        if (hasUnknownDynamicImport) {
          context.beginPath();
          context.arc(node.x + 4, node.y - 4, 3, 0, 2 * Math.PI);
          context.fillStyle = "#f97316";
          context.fill();
        }
        // Debug: draw force vectors
        const debugForces: { key: string; vx: number; vy: number; color: string }[] = [
          { key: "edgePush", vx: node._debug?.edgePush?.[0] || 0, vy: node._debug?.edgePush?.[1] || 0, color: "rgba(0, 200, 0, 0.9)" },
          { key: "groupPush", vx: node._debug?.groupPush?.[0] || 0, vy: node._debug?.groupPush?.[1] || 0, color: "rgba(0, 100, 255, 0.9)" },
          { key: "crossFile", vx: node._debug?.crossFile?.[0] || 0, vy: node._debug?.crossFile?.[1] || 0, color: "rgba(255, 150, 0, 0.9)" },
        ];
        for (const f of debugForces) {
          const len = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
          if (len > 0.01) {
            const scale = 100;
            const drawLen = Math.min(len * scale, 40);
            const nx = f.vx / len, ny = f.vy / len;
            context.beginPath();
            context.moveTo(node.x, node.y);
            context.lineTo(node.x + nx * drawLen, node.y + ny * drawLen);
            context.strokeStyle = f.color;
            context.lineWidth = 1.5;
            context.stroke();
            const tipX = node.x + nx * drawLen, tipY = node.y + ny * drawLen;
            const angle = Math.atan2(ny, nx);
            context.beginPath();
            context.moveTo(tipX, tipY);
            context.lineTo(tipX - 5 * Math.cos(angle - 0.4), tipY - 5 * Math.sin(angle - 0.4));
            context.moveTo(tipX, tipY);
            context.lineTo(tipX - 5 * Math.cos(angle + 0.4), tipY - 5 * Math.sin(angle + 0.4));
            context.stroke();
          }
        }
      });

      // Draw edge labels (on top of everything)
      filteredEdges.forEach((edge: any) => {
        if (edge.label && hoveredEdgeIds.has(edge.id)) {
          const dx = edge.target.x - edge.source.x;
          const dy = edge.target.y - edge.source.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const offset = 12;

          let targetX = edge.target.x;
          let targetY = edge.target.y;

          if (distance > 0) {
            targetX = edge.source.x + (dx / distance) * (distance - offset);
            targetY = edge.source.y + (dy / distance) * (distance - offset);
          }

          const midX = (edge.source.x + targetX) / 2;
          const midY = (edge.source.y + targetY) / 2;

          // Measure text
          context.font =
            '10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          const textWidth = context.measureText(edge.label).width;
          const padding = 6;
          const rectWidth = textWidth + padding * 2;
          const rectHeight = 20;
          const rectX = midX - rectWidth / 2;
          const rectY = midY - rectHeight / 2;

          // Draw rounded rectangle background
          context.fillStyle = "rgba(9, 9, 11, 0.5)";
          context.beginPath();
          context.roundRect(rectX, rectY, rectWidth, rectHeight, 4);
          context.fill();

          // Draw text
          context.fillStyle = "#fafafa";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(edge.label, midX, midY);
        }
      });

      // Draw selected label (always shows if node is selected)
      if (selectedNodeRef.current) {
        const selectedNode = filteredNodes.find(
          (n: any) => n.id === selectedNodeRef.current,
        );
        if (selectedNode) {
          const lastDotIndex = selectedNode.id.lastIndexOf(".");
          const symbolPart = selectedNode.id.substring(lastDotIndex + 1);

          // Measure symbol part with bold font
          context.font =
            'bold 10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          const symbolWidth = context.measureText(symbolPart).width;

          const totalWidth = symbolWidth;
          const startX = selectedNode.x - totalWidth / 2;
          const padding = 6;
          const rectWidth = totalWidth + padding * 2;
          const rectHeight = 20;
          const rectX = startX - padding;
          const rectY = selectedNode.y - 12 - rectHeight;
          const textY = rectY + rectHeight / 2 + 3; // Center text vertically with slight offset for baseline

          // Draw rounded rectangle background (zinc-950 transparent)
          context.fillStyle = "rgba(9, 9, 11, 0.5)";
          context.beginPath();
          context.roundRect(rectX, rectY, rectWidth, rectHeight, 4);
          context.fill();

          // Draw symbol (bold, white)
          context.font =
            'bold 10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          context.fillStyle = "#fafafa"; // neutral-50
          context.fillText(symbolPart, startX, textY);
        }
      }

      // Draw hover label (shows if hovering directly on canvas and different from selected)
      if (
        hoveredNodeRef.current &&
        !Array.isArray(hoveredNodeRef.current) &&
        hoveredNodeRef.current.id !== selectedNodeRef.current &&
        !hoverFromTreeRef.current
      ) {
        const lastDotIndex = hoveredNodeRef.current.id.lastIndexOf(".");
        const symbolPart = hoveredNodeRef.current.id.substring(
          lastDotIndex + 1,
        );

        // Measure symbol part with bold font
        context.font =
          'bold 10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const symbolWidth = context.measureText(symbolPart).width;

        const totalWidth = symbolWidth;
        const startX = hoveredNodeRef.current.x - totalWidth / 2;
        const padding = 6;
        const rectWidth = totalWidth + padding * 2;
        const rectHeight = 20;
        const rectX = startX - padding;
        const rectY = hoveredNodeRef.current.y - 10 - rectHeight;
        const textY = rectY + rectHeight / 2 + 3; // Center text vertically with slight offset for baseline

        // Draw rounded rectangle background (zinc-950 transparent)
        context.fillStyle = "rgba(9, 9, 11, 0.5)";
        context.beginPath();
        context.roundRect(rectX, rectY, rectWidth, rectHeight, 4);
        context.fill();

        // Draw symbol (bold, white)
        context.font =
          'bold 10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        context.fillStyle = "#fafafa"; // neutral-50
        context.fillText(symbolPart, startX, textY);
      }

      context.restore();
    }

    drawRef.current = draw;

    // Combined mousemove handler for hover, drag, and pan
    const handleMouseMove = (event: MouseEvent) => {
      // Handle pan
      if (isPanning) {
        const dx = event.clientX - panStart.x;
        const dy = event.clientY - panStart.y;
        transformRef.current.x += dx;
        transformRef.current.y += dy;
        panStart = { x: event.clientX, y: event.clientY };
        draw();
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const mouseX =
        (event.clientX - rect.left - transformRef.current.x) /
        transformRef.current.k;
      const mouseY =
        (event.clientY - rect.top - transformRef.current.y) /
        transformRef.current.k;
      mousePositionRef.current = { x: mouseX, y: mouseY };

      // Handle drag
      if (draggedEmptyModule) {
        const anchor = emptyModulePositionsRef.current.get(draggedEmptyModule);
        if (anchor && draggedEmptyOffset) {
          anchor.x = mouseX + draggedEmptyOffset.x;
          anchor.y = mouseY + draggedEmptyOffset.y;
          const s = 15;
          polyBlocksRectsRef.current.rects.set(draggedEmptyModule, { x0: anchor.x - s, y0: anchor.y - s, x1: anchor.x + s, y1: anchor.y + s });
        }
        draw();
        return;
      }
      if (draggedGroup) {
        draggedGroup.forEach((n: any) => {
          if (n._dragOffset) {
            n.x = mouseX + n._dragOffset.x;
            n.y = mouseY + n._dragOffset.y;
          }
        });
        draw();
        return;
      }
      if (draggedNode) {
        if (draggedNode._dragOffset) {
          draggedNode.fx = mouseX + draggedNode._dragOffset.x;
          draggedNode.fy = mouseY + draggedNode._dragOffset.y;
        } else {
          draggedNode.fx = mouseX;
          draggedNode.fy = mouseY;
        }
        draw();
        return;
      }

      // Handle hover
      const hoverRadius = viewMode === "poly-blocks" ? 225 : 100;
      let found = null;
      for (const node of filteredNodes) {
        const dx = mouseX - node.x;
        const dy = mouseY - node.y;
        if (dx * dx + dy * dy < hoverRadius) {
          found = node;
          break;
        }
      }

      // Empty module hover (poly-blocks): pointer cursor over an empty block
      let hoveredEmptyModule = false;
      if (!found && viewMode === "poly-blocks") {
        const pad = 15;
        for (const [key, r] of polyBlocksRectsRef.current.rects) {
          if (
            emptyModulePositionsRef.current.has(key) &&
            mouseX >= r.x0 - pad && mouseX <= r.x1 + pad &&
            mouseY >= r.y0 - pad && mouseY <= r.y1 + pad
          ) {
            hoveredEmptyModule = true;
            break;
          }
        }
      }

      // Check for edge hover (only in non-grouping mode — grouping mode draws file-level edges)
      let hoveredEdgesList = [];
      const isEdgeMode =
        viewMode !== "circles" &&
        viewMode !== "boxes" &&
        viewMode !== "para-fillet" &&
        viewMode !== "para-bezier" &&
        viewMode !== "para-subdiv" &&
        viewMode !== "expand-poly" &&
        viewMode !== "circle-poly" &&
        viewMode !== "ellipse-wrap" &&
        viewMode !== "oriented-rect" &&
        viewMode !== "oriented-rect-rounded" &&
        viewMode !== "oriented-rect-roundpoly" &&
        viewMode !== "oriented-rect-roundpoly2" &&
        viewMode !== "poly-solid" &&
        viewMode !== "poly-blocks";
      if (!found && isEdgeMode) {
        for (const edge of filteredEdges) {
          const dx = edge.target.x - edge.source.x;
          const dy = edge.target.y - edge.source.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance === 0) continue;

          // Calculate distance from point to line segment
          const t = Math.max(
            0,
            Math.min(
              1,
              ((mouseX - edge.source.x) * dx + (mouseY - edge.source.y) * dy) /
                (distance * distance),
            ),
          );
          const projX = edge.source.x + t * dx;
          const projY = edge.source.y + t * dy;
          const distToLine = Math.sqrt(
            (mouseX - projX) ** 2 + (mouseY - projY) ** 2,
          );

          if (distToLine < 5) {
            hoveredEdgesList.push(edge);
          }
        }
      } else if (!found && !isEdgeMode) {
        // Grouping mode: check proximity to file-level centroid-to-centroid edges
        for (const flEdge of fileLevelEdgesRef.current) {
          const dx = flEdge.tx - flEdge.sx;
          const dy = flEdge.ty - flEdge.sy;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance === 0) continue;

          const t = Math.max(
            0,
            Math.min(
              1,
              ((mouseX - flEdge.sx) * dx + (mouseY - flEdge.sy) * dy) /
                (distance * distance),
            ),
          );
          const projX = flEdge.sx + t * dx;
          const projY = flEdge.sy + t * dy;
          const distToLine = Math.sqrt(
            (mouseX - projX) ** 2 + (mouseY - projY) ** 2,
          );

          if (distToLine < 5) {
            hoveredEdgesList.push({ id: flEdge.key });
          }
        }
      }

      if (found !== hoveredNodeRef.current) {
        hoverFromTreeRef.current = false;
        hoveredNodeRef.current = found;
        canvas.style.cursor = found
          ? "pointer"
          : hoveredEmptyModule
            ? "pointer"
            : hoveredEdgesList.length > 0
              ? "pointer"
              : "default";
        draw();
      }

      // Clear edge hover if node is hovered
      if (found) {
        setHoveredEdges([]);
        draw();
      } else if (hoveredEmptyModule) {
        setHoveredEdges([]);
        canvas.style.cursor = "pointer";
        draw();
      } else {
        setHoveredEdges(hoveredEdgesList);
        if (hoveredEdgesList.length > 0) {
          canvas.style.cursor = "pointer";
          draw();
        } else {
          canvas.style.cursor = "default";
          draw();
        }
      }
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseenter", () => {
      mouseOverCanvasRef.current = true;
    });

    const handleMouseDown = (event: MouseEvent) => {
      // Check if middle mouse button or shift key for panning
      if (event.button === 1 || event.shiftKey) {
        isPanning = true;
        panStart = { x: event.clientX, y: event.clientY };
        event.preventDefault();
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const mouseX =
        (event.clientX - rect.left - transformRef.current.x) /
        transformRef.current.k;
      const mouseY =
        (event.clientY - rect.top - transformRef.current.y) /
        transformRef.current.k;

      const pickRadius = viewMode === "poly-blocks" ? 225 : 100;

      // Check for node click (selection)
      let nodeClicked = false;
      for (const node of filteredNodes) {
        const dx = mouseX - node.x;
        const dy = mouseY - node.y;
        if (dx * dx + dy * dy < pickRadius) {
          handleSelectSymbol(node.id);
          nodeClicked = true;
          draw();
          break;
        }
      }

      // Deselect if clicking on empty space
      if (!nodeClicked) {
        setSelectedNodeId(null);
        draw();
      }

      // Check for node hit → single drag
      for (const node of filteredNodes) {
        const dx = mouseX - node.x;
        const dy = mouseY - node.y;
        if (dx * dx + dy * dy < pickRadius) {
          draggedNode = node;
          if (!simulationLockedRef.current && simulationRef.current) {
            simulationRef.current.alpha(0.3).restart();
          }
          node._snapTarget = null;
          node._dragOffset = { x: node.x - mouseX, y: node.y - mouseY };
          draggedNode.fx = node.x;
          draggedNode.fy = node.y;
          break;
        }
      }

      // Poly-blocks: if no node hit, check for click within a group's treemap rect
      if (viewMode === "poly-blocks" && !draggedNode) {
        const rects = polyBlocksRectsRef.current.rects;
        const pad = 15;
        for (const [fileKey, r] of rects) {
          if (mouseX >= r.x0 - pad && mouseX <= r.x1 + pad && mouseY >= r.y0 - pad && mouseY <= r.y1 + pad) {
            draggedGroup = filteredNodes.filter((n: any) => {
              const f = n.data?.file;
              const d = n.data?.folder || "";
              const k = f ? (d ? `${d}/${f}` : f) : "";
              return k === fileKey;
            });
            if (draggedGroup.length > 0) {
              draggedGroup.forEach((n: any) => {
                n._snapTarget = null;
                n._dragOffset = { x: n.x - mouseX, y: n.y - mouseY };
              });
            } else {
              draggedGroup = null;
              // Empty module: drag its anchor position instead
              const anchor = emptyModulePositionsRef.current.get(fileKey);
              if (anchor) {
                draggedEmptyModule = fileKey;
                draggedEmptyOffset = { x: anchor.x - mouseX, y: anchor.y - mouseY };
              }
            }
            break;
          }
        }
      }
    };

    canvas.addEventListener("mousedown", handleMouseDown);

    const snapToGrid = (node: any) => {
      if (viewMode !== "poly-blocks") return;
      const gx = Math.round(node.x / 40) * 40;
      const gy = Math.round(node.y / 40) * 40;
      if (gx === node.x && gy === node.y) return;

      const file = node.data?.file;
      const folder = node.data?.folder || "";
      const nodeKey = file ? (folder ? `${folder}/${file}` : file) : "";
      if (!nodeKey) { node._snapTarget = { x: gx, y: gy }; return; }

      const boxes = new Map<string, { minX: number; maxX: number; minY: number; maxY: number }>();
      filteredNodes.forEach((n: any) => {
        const f = n.data?.file;
        const d = n.data?.folder || "";
        const k = f ? (d ? `${d}/${f}` : f) : "";
        if (!k) return;
        if (!boxes.has(k)) boxes.set(k, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
        const b = boxes.get(k)!;
        if (n.x < b.minX) b.minX = n.x; if (n.x > b.maxX) b.maxX = n.x;
        if (n.y < b.minY) b.minY = n.y; if (n.y > b.maxY) b.maxY = n.y;
      });

      type Box = { minX: number; maxX: number; minY: number; maxY: number };
      const inside = (bx: Box, x: number, y: number) => x >= bx.minX && x <= bx.maxX && y >= bx.minY && y <= bx.maxY;
      const occ = new Set<string>();
      filteredNodes.forEach((o: any) => {
        if (o === node) return;
        if (o._snapTarget) {
          occ.add(`${Math.round(o._snapTarget.x / 40) * 40},${Math.round(o._snapTarget.y / 40) * 40}`);
        } else {
          occ.add(`${Math.round(o.x / 40) * 40},${Math.round(o.y / 40) * 40}`);
        }
      });

      const inForeign = (x: number, y: number) => {
        let result = false;
        boxes.forEach((bx, k) => { if (k !== nodeKey && inside(bx, x, y)) result = true; });
        return result;
      };

      if (!inForeign(gx, gy) && !occ.has(`${gx},${gy}`)) { node._snapTarget = { x: gx, y: gy }; return; }
      const own = boxes.get(nodeKey);
      const cx = own ? (own.minX + own.maxX) / 2 : 0;
      const cy = own ? (own.minY + own.maxY) / 2 : 0;
      for (let ring = 0; ring < 30; ring++) {
        for (let dx = -ring; dx <= ring; dx++) {
          for (let dy = -ring; dy <= ring; dy++) {
            if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
            const sx = Math.round((cx + dx * 40) / 40) * 40;
            const sy = Math.round((cy + dy * 40) / 40) * 40;
            if (inForeign(sx, sy)) continue;
            if (!occ.has(`${sx},${sy}`)) { node._snapTarget = { x: sx, y: sy }; return; }
          }
        }
      }
    };

    const restartSim = () => {
      if (!simulationLockedRef.current && simulationRef.current && simulationRef.current.alpha() < 0.001) {
        simulationRef.current.alpha(0.3).restart();
      }
    };

    const handleMouseUp = () => {
      isPanning = false;
      if (draggedEmptyModule) {
        const anchor = emptyModulePositionsRef.current.get(draggedEmptyModule);
        if (anchor) {
          anchor.x = Math.round(anchor.x / 40) * 40;
          anchor.y = Math.round(anchor.y / 40) * 40;
          const s = 15;
          polyBlocksRectsRef.current.rects.set(draggedEmptyModule, { x0: anchor.x - s, y0: anchor.y - s, x1: anchor.x + s, y1: anchor.y + s });
        }
        if (viewMode === "poly-blocks") savePolyBlocksPositions(filteredNodes);
        draggedEmptyModule = null;
        draggedEmptyOffset = null;
        draw();
      } else if (draggedGroup) {
        draggedGroup.forEach((n: any) => {
          n._dragOffset = undefined;
          snapToGrid(n);
        });
        if (viewMode === "poly-blocks") savePolyBlocksPositions(filteredNodes);
        draggedGroup = null;
        draggedNode = null;
        if (!simulationLockedRef.current && simulationRef.current) {
          simulationRef.current.alphaTarget(0);
          restartSim();
        }
      } else if (draggedNode) {
        draggedNode.fx = null;
        draggedNode.fy = null;
        snapToGrid(draggedNode);
        if (viewMode === "poly-blocks") savePolyBlocksPositions(filteredNodes);
        draggedNode = null;
        if (!simulationLockedRef.current && simulationRef.current) {
          simulationRef.current.alphaTarget(0);
          restartSim();
        }
      }
    };

    canvas.addEventListener("mouseup", handleMouseUp);

    const handleMouseLeave = () => {
      mouseOverCanvasRef.current = false;
      isPanning = false;
      hoveredNodeRef.current = null;
      setHoveredEdges([]);
      if (draggedEmptyModule) {
        const anchor = emptyModulePositionsRef.current.get(draggedEmptyModule);
        if (anchor) {
          anchor.x = Math.round(anchor.x / 40) * 40;
          anchor.y = Math.round(anchor.y / 40) * 40;
          const s = 15;
          polyBlocksRectsRef.current.rects.set(draggedEmptyModule, { x0: anchor.x - s, y0: anchor.y - s, x1: anchor.x + s, y1: anchor.y + s });
        }
        if (viewMode === "poly-blocks") savePolyBlocksPositions(filteredNodes);
        draggedEmptyModule = null;
        draggedEmptyOffset = null;
      } else if (draggedGroup) {
        draggedGroup.forEach((n: any) => {
          n._dragOffset = undefined;
          snapToGrid(n);
        });
        draggedGroup = null;
        draggedNode = null;
        restartSim();
        if (!simulationLockedRef.current && simulationRef.current) {
          simulationRef.current.alphaTarget(0);
        }
      } else if (draggedNode) {
        draggedNode.fx = null;
        draggedNode.fy = null;
        snapToGrid(draggedNode);
        draggedNode = null;
        restartSim();
        if (!simulationLockedRef.current && simulationRef.current) {
          simulationRef.current.alphaTarget(0);
        }
      }
      draw();
    };

    canvas.addEventListener("mouseleave", handleMouseLeave);

    const handleContextMenu = (event: Event) => {
      event.preventDefault();
    };

    canvas.addEventListener("contextmenu", handleContextMenu);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [
    filteredNodes,
    filteredEdges,
    folderMap,
    colorScale,
    hiddenPaths,
    edgeOpacity,
    viewMode,
  ]);

  // Apply saved poly-blocks positions when data becomes available
  useEffect(() => {
    if (viewMode === "poly-blocks" && filteredNodes.length > 0 && parsedData) {
      applySavedPositions(filteredNodes);
      savePolyBlocksPositions(filteredNodes);
    }
  }, [parsedData, viewMode, filteredNodes]);

  // Handle sidebar resize without re-initializing simulation
  useEffect(() => {
    sidebarOpenRef.current = sidebarOpen;
    localStorage.setItem("sidebarOpen", JSON.stringify(sidebarOpen));
    if (resizeRef.current) {
      resizeRef.current();
    }
  }, [sidebarOpen]);

  // Handle right sidebar resize without re-initializing simulation
  useEffect(() => {
    rightSidebarOpenRef.current = rightSidebarOpen;
    localStorage.setItem("rightSidebarOpen", JSON.stringify(rightSidebarOpen));
    if (resizeRef.current) {
      resizeRef.current();
    }
  }, [rightSidebarOpen]);

  // Persist hiddenPaths to localStorage
  useEffect(() => {
    localStorage.setItem(
      "hiddenPaths",
      JSON.stringify(Array.from(hiddenPaths)),
    );
  }, [hiddenPaths]);

  // Persist D3 parameters to localStorage
  useEffect(() => {
    localStorage.setItem("chargeStrength", JSON.stringify(chargeStrength));
  }, [chargeStrength]);

  useEffect(() => {
    localStorage.setItem("linkDistance", JSON.stringify(linkDistance));
  }, [linkDistance]);

  useEffect(() => {
    localStorage.setItem("alphaDecayValue", JSON.stringify(alphaDecayValue));
  }, [alphaDecayValue]);

  useEffect(() => {
    localStorage.setItem("edgeOpacity", JSON.stringify(edgeOpacity));
  }, [edgeOpacity]);

  useEffect(() => {
    localStorage.setItem("groupCohesionStrength", JSON.stringify(groupCohesionStrength));
  }, [groupCohesionStrength]);

  useEffect(() => {
    localStorage.setItem("collisionStrength", JSON.stringify(collisionStrength));
  }, [collisionStrength]);

  useEffect(() => {
    localStorage.setItem("repelStrength", JSON.stringify(repelStrength));
  }, [repelStrength]);

  useEffect(() => {
    localStorage.setItem("crossFileEdgeStrength", JSON.stringify(crossFileEdgeStrength));
  }, [crossFileEdgeStrength]);

  // Update simulation forces when D3 parameters change
  useEffect(() => {
    if (simulationRef.current) {
      const linkForce = simulationRef.current.force("link");
      if (linkForce) {
        (linkForce as any).distance(linkDistance);
      }
      simulationRef.current.alpha(0.3).restart();
    }
  }, [linkDistance]);

  // Update charge strength for legacy modes
  useEffect(() => {
    if (simulationRef.current) {
      const chargeForce = simulationRef.current.force("charge");
      if (chargeForce) {
        (chargeForce as any).strength(chargeStrength);
        simulationRef.current.alpha(0.3).restart();
      }
    }
  }, [chargeStrength]);

  // Update group cohesion / collision strength when parameters change
  useEffect(() => {
    if (simulationRef.current) {
      const existingGroup = simulationRef.current.force("group");
      const existingTwoLevel = simulationRef.current.force("twoLevel");
      if (existingGroup) {
        simulationRef.current.force("group", null);
        simulationRef.current.force("group", groupCohesionForce(groupCohesionStrength, collisionStrength, repelStrength, viewMode === "oriented-rect-roundpoly" || viewMode === "oriented-rect-roundpoly2"));
        simulationRef.current.alpha(1).restart();
      }
      if (existingTwoLevel) {
        simulationRef.current.force("twoLevel", null);
        simulationRef.current.force("twoLevel", twoLevelLayoutForce(filteredEdges as any, {
          groupStrength: groupCohesionStrength,
          crossFileStrength: crossFileEdgeStrength,
          collisionStrength,
          repelStrength,
        }, viewMode === "poly-blocks" ? 40 : 0));
        simulationRef.current.alpha(1).restart();
      }
    }
  }, [groupCohesionStrength, collisionStrength, repelStrength, crossFileEdgeStrength, filteredEdges]);

  // Update cross-file edge strength when parameter changes
  useEffect(() => {
    if (simulationRef.current) {
      const existingCrossFile = simulationRef.current.force("crossFile");
      const existingTwoLevel = simulationRef.current.force("twoLevel");
      if (existingCrossFile) {
        simulationRef.current.force("crossFile", null);
        simulationRef.current.force("crossFile", crossFileEdgeForce(filteredEdges as any, crossFileEdgeStrength, viewMode === "oriented-rect-roundpoly" || viewMode === "oriented-rect-roundpoly2"));
        simulationRef.current.alpha(1).restart();
      }
      if (existingTwoLevel) {
        simulationRef.current.force("twoLevel", null);
        simulationRef.current.force("twoLevel", twoLevelLayoutForce(filteredEdges as any, {
          groupStrength: groupCohesionStrength,
          crossFileStrength: crossFileEdgeStrength,
          collisionStrength,
          repelStrength,
        }, viewMode === "poly-blocks" ? 40 : 0));
        simulationRef.current.alpha(1).restart();
      }
    }
  }, [crossFileEdgeStrength, filteredEdges]);

  // Update simulation forces when view mode changes
  useEffect(() => {
    if (simulationRef.current) {
      const isGroupingMode = viewMode !== "edges";
      const isLegacy = viewMode === "oriented-rect-roundpoly" || viewMode === "oriented-rect-roundpoly2";
      const existingLink = simulationRef.current.force("link");
      const existingGroup = simulationRef.current.force("group");
      const existingCrossFile = simulationRef.current.force("crossFile");
      const existingCollide = simulationRef.current.force("collide");
      const existingCharge = simulationRef.current.force("charge");
      const existingX = simulationRef.current.force("x");
      const existingY = simulationRef.current.force("y");
      const existingTwoLevel = simulationRef.current.force("twoLevel");
      if (viewMode === "poly-blocks") {
        if (existingLink) simulationRef.current.force("link", null);
        if (existingGroup) simulationRef.current.force("group", null);
        if (existingCrossFile) simulationRef.current.force("crossFile", null);
        if (existingCollide) simulationRef.current.force("collide", null);
        if (existingCharge) simulationRef.current.force("charge", null);
        if (existingX) simulationRef.current.force("x", null);
        if (existingY) simulationRef.current.force("y", null);
        if (existingTwoLevel) simulationRef.current.force("twoLevel", null);
        const needsInit = filteredNodes.length > 0 && (
          polyBlocksDataRef.current !== generatedNodes ||
          Math.abs(filteredNodes[0].x % 40) > 0.1
        );
        if (needsInit) {
          initPolyBlocksNodes(filteredNodes, 40, polyBlocksRectsRef.current, emptyGroupsRef.current.map((g) => g.key));
        }
        applySavedPositions(filteredNodes);
        rebuildPolyBlocksRects();
        polyBlocksDataRef.current = generatedNodes;
      } else if (isGroupingMode) {
        if (existingLink) simulationRef.current.force("link", null);
        if (existingTwoLevel && !isLegacy) {
          simulationRef.current.force("twoLevel", null);
        }
        if (isLegacy) {
          if (existingGroup) simulationRef.current.force("group", null);
          if (existingCrossFile) simulationRef.current.force("crossFile", null);
          if (existingCharge) simulationRef.current.force("charge", null);
          if (existingX) simulationRef.current.force("x", null);
          if (existingY) simulationRef.current.force("y", null);
          if (!existingTwoLevel) {
            simulationRef.current.force("twoLevel", twoLevelLayoutForce(filteredEdges as any, {
              groupStrength: groupCohesionStrength,
              crossFileStrength: crossFileEdgeStrength,
              collisionStrength,
              repelStrength,
            }, 0));
          }
        } else {
          if (existingTwoLevel) simulationRef.current.force("twoLevel", null);
          if (!existingGroup) {
            simulationRef.current.force("group", groupCohesionForce(groupCohesionStrength, collisionStrength, repelStrength, isLegacy));
          }
          if (!existingCrossFile) {
            simulationRef.current.force("crossFile", crossFileEdgeForce(filteredEdges as any, crossFileEdgeStrength, isLegacy));
          }
          if (existingCharge) {
            simulationRef.current.force("charge", null);
            simulationRef.current.force("x", null);
            simulationRef.current.force("y", null);
          }
        }
        if (!existingCollide) {
          simulationRef.current.force("collide", d3.forceCollide(15));
        }
      } else {
        if (existingGroup) simulationRef.current.force("group", null);
        if (existingCrossFile) simulationRef.current.force("crossFile", null);
        if (existingCollide) simulationRef.current.force("collide", null);
        if (existingCharge) simulationRef.current.force("charge", null);
        if (existingX) simulationRef.current.force("x", null);
        if (existingY) simulationRef.current.force("y", null);
        if (existingTwoLevel) simulationRef.current.force("twoLevel", null);
        if (!existingLink) {
          simulationRef.current.force(
            "link",
            d3
              .forceLink(filteredEdges as any)
              .id((d: any) => d.id)
              .distance(linkDistance),
          );
        }
      }
      simulationRef.current.alpha(1).restart();
    }
  }, [viewMode, filteredEdges, linkDistance, groupCohesionStrength, collisionStrength, repelStrength, chargeStrength, crossFileEdgeStrength]);

  // Update alpha decay when parameter changes
  useEffect(() => {
    if (simulationRef.current) {
      simulationRef.current.alphaDecay(forcesEnabled ? 0 : alphaDecayValue);
      simulationRef.current.alpha(0.3).restart();
    }
  }, [alphaDecayValue, forcesEnabled]);

  // Handle simulation lock state
  useEffect(() => {
    simulationLockedRef.current = simulationLocked;
    if (simulationRef.current) {
      if (simulationLocked) {
        simulationRef.current.stop();
      } else {
        simulationRef.current.alpha(0.3).restart();
      }
    }
  }, [simulationLocked]);

  // Update simulation when data changes
  useEffect(() => {
    if (simulationRef.current && filteredNodes.length > 0) {
      simulationRef.current.nodes(filteredNodes as any);
      const linkForce = simulationRef.current.force("link");
      if (linkForce) {
        (linkForce as any).links(filteredEdges as any);
      }
      const isGroupingMode = viewMode !== "edges";
      const isLegacy = viewMode === "oriented-rect-roundpoly" || viewMode === "oriented-rect-roundpoly2";
      if (viewMode === "poly-blocks") {
        simulationRef.current.force("group", null);
        simulationRef.current.force("crossFile", null);
        simulationRef.current.force("charge", null);
        simulationRef.current.force("x", null);
        simulationRef.current.force("y", null);
        simulationRef.current.force("twoLevel", null);
        simulationRef.current.force("collide", null);
        const needsInit = filteredNodes.length > 0 && (
          polyBlocksDataRef.current !== generatedNodes ||
          Math.abs(filteredNodes[0].x % 40) > 0.1
        );
        if (needsInit) {
          initPolyBlocksNodes(filteredNodes, 40, polyBlocksRectsRef.current, emptyGroupsRef.current.map((g) => g.key));
        }
        applySavedPositions(filteredNodes);
        rebuildPolyBlocksRects();
        polyBlocksDataRef.current = generatedNodes;
      } else if (isGroupingMode) {
        if (isLegacy) {
          simulationRef.current.force("group", null);
          simulationRef.current.force("crossFile", null);
          simulationRef.current.force("charge", null);
          simulationRef.current.force("x", null);
          simulationRef.current.force("y", null);
          simulationRef.current.force("twoLevel", null);
          simulationRef.current.force("twoLevel", twoLevelLayoutForce(filteredEdges as any, {
            groupStrength: groupCohesionStrength,
            crossFileStrength: crossFileEdgeStrength,
            collisionStrength,
            repelStrength,
          }));
        } else {
          simulationRef.current.force("twoLevel", null);
          simulationRef.current.force("group", null);
          simulationRef.current.force("group", groupCohesionForce(groupCohesionStrength, collisionStrength, repelStrength, isLegacy));
          simulationRef.current.force("crossFile", null);
          simulationRef.current.force("crossFile", crossFileEdgeForce(filteredEdges as any, crossFileEdgeStrength, isLegacy));
          simulationRef.current.force("charge", null);
          simulationRef.current.force("x", null);
          simulationRef.current.force("y", null);
        }
        simulationRef.current.force("collide", null);
        simulationRef.current.force("collide", d3.forceCollide(15));
      } else {
        simulationRef.current.force("twoLevel", null);
        simulationRef.current.force("group", null);
        simulationRef.current.force("crossFile", null);
        simulationRef.current.force("collide", null);
        simulationRef.current.force("charge", null);
        simulationRef.current.force("x", null);
        simulationRef.current.force("y", null);
      }
      simulationRef.current.alpha(1).restart();
    }
  }, [filteredNodes, filteredEdges, groupCohesionStrength, collisionStrength, repelStrength, chargeStrength, crossFileEdgeStrength, viewMode]);

  return (
    <div className="h-screen w-screen bg-neutral-900 flex overflow-hidden">
      {/* Sidebar */}
      <div
        className={`bg-neutral-900 overflow-hidden flex flex-col h-full ${sidebarOpen ? "border-r border-neutral-700" : ""}`}
        style={{ width: sidebarOpen ? "300px" : "0px" }}
      >
        <div className="p-4 flex-shrink-0">
          <div
            className="flex items-center gap-2 cursor-pointer hover:bg-neutral-800 p-2 rounded-lg select-none"
            onClick={() => setSidebarOpen(false)}
            style={{ maxWidth: "fit-content" }}
          >
            <Menu size={24} className="text-neutral-50" />
            <h1 className="font-semibold text-neutral-50">Symbol Explorer</h1>
          </div>
        </div>
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex flex-col h-full">
            <div className="pr-4 flex justify-end gap-1 mb-2 flex-shrink-0">
              <div>
                <Tooltip content="Open Directory">
                  <button
                    ref={folderButtonRef}
                    onClick={handleToggleDropdown}
                    disabled={isLoading}
                    className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    <FolderOpen size={16} />
                  </button>
                </Tooltip>
              </div>
              <Tooltip content="Refresh">
                <button
                  onClick={handleRefresh}
                  disabled={isLoading || !directoryHandle}
                  className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={16} />
                </button>
              </Tooltip>
            </div>
            {directoryHandle && (
              <div className="flex flex-col flex-1 min-h-0">
                <div className="pr-4 flex justify-end gap-1 shrink-0">
                  <Tooltip content="Show All">
                    <button
                      onClick={showAll}
                      className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded-lg cursor-pointer"
                    >
                      <EyeOpen size={16} />
                    </button>
                  </Tooltip>
                  <Tooltip content="Hide All">
                    <button
                      onClick={hideAll}
                      className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded-lg cursor-pointer"
                    >
                      <EyeOff size={16} />
                    </button>
                  </Tooltip>
                  <Tooltip content="Expand All">
                    <button
                      onClick={expandAllModules}
                      className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded-lg cursor-pointer"
                    >
                      <CopyPlus size={16} />
                    </button>
                  </Tooltip>
                  <Tooltip content="Collapse All">
                    <button
                      onClick={collapseAllModules}
                      className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded-lg cursor-pointer"
                    >
                      <CopyMinus size={16} />
                    </button>
                  </Tooltip>
                </div>
                <div className="p-2 pb-6 overflow-y-scroll flex-1 min-h-0">
                  <Tree nodes={treeData} config={treeConfig} />
                </div>
                <div className="h-[22px] border-t border-neutral-700 flex items-center px-2 text-xs text-neutral-500 shrink-0">
                  {/* Footer content */}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 relative">
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
          {!sidebarOpen && (
            <div
              className="flex items-center gap-2 cursor-pointer p-2 rounded-lg select-none"
              style={{ maxWidth: "fit-content" }}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={24} className="text-neutral-50" />
              <h1 className="font-semibold text-neutral-50">Symbol Explorer</h1>
            </div>
          )}
        </div>
        <div className="absolute top-6 right-6 z-10">
          {!rightSidebarOpen && (
            <div
              onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
              className="cursor-pointer select-none"
            >
              <Settings size={24} className="text-neutral-400" />
            </div>
          )}
        </div>
        <canvas ref={canvasRef} width="100%" height="100%" />
        {generatedNodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <FolderOpen size={64} className="text-neutral-600 mx-auto mb-4" />
              <p className="text-neutral-400 text-lg mb-2">No data loaded</p>
              <p className="text-neutral-500 text-sm">
                Click the folder icon in the sidebar to import a directory
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Directory dropdown portal */}
      {showDirectoryDropdown &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed w-64 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl z-50"
            style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
          >
            <div className="p-2 border-b border-neutral-700">
              <button
                onClick={handleDirectoryPicker}
                disabled={!supportsFileSystemAccess}
                className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-700 rounded flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-default"
              >
                <FolderGit2 size={14} />
                <span>Connect Folder</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                {...({ webkitdirectory: true } as any)}
                multiple
                onChange={handleFallbackFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-700 rounded cursor-pointer flex items-center gap-2"
              >
                <FolderOpen size={14} />
                <span>Open Folder</span>
              </button>
            </div>
            {savedDirectories.length > 0 && (
              <>
                <div className="px-3 py-2 text-xs text-neutral-500 font-medium">
                  Recent directories
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {savedDirectories.map((dir) => (
                    <div
                      key={dir.id}
                      className="px-3 py-2 hover:bg-neutral-700 cursor-pointer flex items-center justify-between group"
                    >
                      <button
                        onClick={() => {
                          handleLoadSavedDirectory(dir.id);
                          setShowDirectoryDropdown(false);
                        }}
                        className="flex-1 text-left text-sm text-neutral-300 truncate cursor-pointer"
                      >
                        {dir.name}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveDirectory(dir.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-neutral-600 rounded text-neutral-400 hover:text-neutral-200"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
            {savedDirectories.length === 0 && (
              <div className="p-3 text-sm text-neutral-500 text-center">
                No saved directories
              </div>
            )}
          </div>,
          document.body,
        )}

      {/* Right sidebar */}
      <div
        className={`bg-neutral-900 flex flex-col h-full ${rightSidebarOpen ? "border-l border-neutral-700" : ""}`}
        style={{ width: rightSidebarOpen ? "300px" : "0px" }}
      >
        <div className="p-4 flex-shrink-0">
          <div className="p-2 flex items-center justify-between">
            <h1 className="font-semibold text-neutral-50">Settings</h1>
            <div
              onClick={() => setRightSidebarOpen(false)}
              className="cursor-pointer select-none"
            >
              <Settings size={24} className="text-neutral-400" />
            </div>
          </div>
        </div>
        <div className="px-4 pb-4 flex-1 overflow-y-auto min-h-0">
          <div className="flex justify-end gap-1">
            <Tooltip content="Lock Simulation">
              <button
                onClick={() => !simulationLocked && toggleSimulationLock()}
                disabled={simulationLocked}
                className={`p-2 rounded-lg cursor-pointer ${simulationLocked ? "text-neutral-600 cursor-not-allowed" : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"}`}
              >
                <Lock size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Unlock Simulation">
              <button
                onClick={() => simulationLocked && toggleSimulationLock()}
                disabled={!simulationLocked}
                className={`p-2 rounded-lg cursor-pointer ${!simulationLocked ? "text-neutral-600 cursor-not-allowed" : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"}`}
              >
                <Unlock size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Run Forces">
              <button
                onClick={() => !forcesEnabled && toggleForces()}
                disabled={forcesEnabled}
                className={`p-2 rounded-lg cursor-pointer ${forcesEnabled ? "text-neutral-600 cursor-not-allowed" : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"}`}
              >
                <Play size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Stop Forces">
              <button
                onClick={() => forcesEnabled && toggleForces()}
                disabled={!forcesEnabled}
                className={`p-2 rounded-lg cursor-pointer ${!forcesEnabled ? "text-neutral-600 cursor-not-allowed" : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"}`}
              >
                <Pause size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Reset Graph">
              <button
                onClick={resetGraph}
                className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded-lg cursor-pointer"
              >
                <RefreshCw size={16} />
              </button>
            </Tooltip>
          </div>
          <div className="space-y-4 mt-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-2">
              View Mode
            </label>
            <div className="flex flex-wrap gap-2">
              <ViewModeButton
                mode="oriented-rect-roundpoly"
                label="Polygon"
                currentViewMode={viewMode}
                onClick={() => setViewMode("oriented-rect-roundpoly")}
              />
              <ViewModeButton
                mode="poly-blocks"
                label="Poly Blocks"
                currentViewMode={viewMode}
                onClick={() => setViewMode("poly-blocks")}
              />
              <ViewModeButton
                mode="edges"
                label="Edges"
                currentViewMode={viewMode}
                onClick={() => setViewMode("edges")}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-neutral-500 mb-2 text-xs uppercase tracking-wide">
              Experimental
            </label>
            <div className="flex flex-wrap gap-2">
              <ViewModeButton
                mode="ellipse-wrap"
                label="Ellipse"
                currentViewMode={viewMode}
                onClick={() => setViewMode("ellipse-wrap")}
              />
              <ViewModeButton
                mode="circles"
                label="Circles"
                currentViewMode={viewMode}
                onClick={() => setViewMode("circles")}
              />
              <ViewModeButton
                mode="boxes"
                label="Blocks"
                currentViewMode={viewMode}
                onClick={() => setViewMode("boxes")}
              />
              <ViewModeButton
                mode="oriented-rect"
                label="Rectangles"
                currentViewMode={viewMode}
                onClick={() => setViewMode("oriented-rect")}
              />
              <ViewModeButton
                mode="oriented-rect-rounded"
                label="Capsules"
                currentViewMode={viewMode}
                onClick={() => setViewMode("oriented-rect-rounded")}
              />
              <ViewModeButton
                mode="para-fillet"
                label="Fillet"
                currentViewMode={viewMode}
                onClick={() => setViewMode("para-fillet")}
              />
              <ViewModeButton
                mode="para-bezier"
                label="Bezier"
                currentViewMode={viewMode}
                onClick={() => setViewMode("para-bezier")}
              />
              <ViewModeButton
                mode="para-subdiv"
                label="Subdiv"
                currentViewMode={viewMode}
                onClick={() => setViewMode("para-subdiv")}
              />
              <ViewModeButton
                mode="expand-poly"
                label="ExpPoly"
                currentViewMode={viewMode}
                onClick={() => setViewMode("expand-poly")}
              />
              <ViewModeButton
                mode="circle-poly"
                label="CirPoly"
                currentViewMode={viewMode}
                onClick={() => setViewMode("circle-poly")}
              />
              <ViewModeButton
                mode="oriented-rect-roundpoly2"
                label="Polygon2"
                currentViewMode={viewMode}
                onClick={() => setViewMode("oriented-rect-roundpoly2")}
              />
              <ViewModeButton
                mode="poly-solid"
                label="PolySolid"
                currentViewMode={viewMode}
                onClick={() => setViewMode("poly-solid")}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-2">
              Charge Strength
            </label>
            <input
              type="number"
              value={chargeStrength}
              onChange={(e) => setChargeStrength(Number(e.target.value))}
              className="w-full bg-neutral-800 text-neutral-50 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-2">
              Link Distance
            </label>
            <input
              type="number"
              value={linkDistance}
              onChange={(e) => setLinkDistance(Number(e.target.value))}
              className="w-full bg-neutral-800 text-neutral-50 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-2">
              Alpha Decay
            </label>
            <input
              type="number"
              step="0.0001"
              value={alphaDecayValue}
              onChange={(e) => setAlphaDecayValue(Number(e.target.value))}
              className="w-full bg-neutral-800 text-neutral-50 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-2">
              Edge Opacity
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={edgeOpacity}
              onChange={(e) => setEdgeOpacity(Number(e.target.value))}
              className="w-full bg-neutral-800 text-neutral-50 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-2">
              Group Cohesion
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={groupCohesionStrength}
              onChange={(e) => setGroupCohesionStrength(Number(e.target.value))}
              className="w-full bg-neutral-800 text-neutral-50 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-2">
              Collision Strength
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="5"
              value={collisionStrength}
              onChange={(e) => setCollisionStrength(Number(e.target.value))}
              className="w-full bg-neutral-800 text-neutral-50 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-2">
              Repel Strength
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={repelStrength}
              onChange={(e) => setRepelStrength(Number(e.target.value))}
              className="w-full bg-neutral-800 text-neutral-50 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-2">
              Cross-File Edge Strength
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={crossFileEdgeStrength}
              onChange={(e) => setCrossFileEdgeStrength(Number(e.target.value))}
              className="w-full bg-neutral-800 text-neutral-50 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

export default App;
