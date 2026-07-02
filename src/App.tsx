import { useEffect, useRef, useState, useMemo, useCallback, memo } from 'react';
import * as d3 from 'd3';
import {
  Folder,
  File,
  Box,
  Eye,
  EyeOff,
  CopyMinus,
  CopyPlus,
  Menu,
  Eye as EyeOpen,
  Lock,
  Unlock,
  Play,
  Pause,
  RefreshCw,
  Settings,
  FolderOpen,
} from 'lucide-react';
import './index.css';
import { buildSymbolGraphFromFiles } from './browserParser';

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
      className={`px-3 py-2 rounded text-sm cursor-pointer ${currentViewMode === mode ? 'bg-neutral-700 text-neutral-50' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
    >
      {label}
    </button>
  );
}

function Tooltip({ children, content }: { children: React.ReactNode; content: string }) {
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
            transform: 'translateX(-50%)',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          {content}
        </div>
      )}
    </>
  );
}

function TreeNode({
  data,
  path,
  expandedFolders,
  toggleFolder,
  hiddenPaths,
  togglePathVisibility,
  hiddenNodes,
  toggleNodeVisibility,
  colorScale,
  onHoverSymbol,
  onHoverFile,
  onHoverFolder,
  hoveredSymbolId,
  onSelectSymbol,
  selectedNodeId,
}: any) {
  // Helper to check if a path or any of its parents is hidden
  const isPathOrParentHidden = (itemPath: string): boolean => {
    if (hiddenPaths.has(itemPath)) return true;
    const parts = itemPath.split('/');
    for (let i = 0; i < parts.length - 1; i++) {
      const parentPath = parts.slice(0, i + 1).join('/');
      if (hiddenPaths.has(parentPath)) return true;
    }
    return false;
  };

  return (
    <>
      {Object.entries(data)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, item]: [string, any]) => {
          const fullPath = path ? `${path}/${name}` : name;
          const isExpanded = expandedFolders.has(fullPath);
          const isFolder = item.type === 'folder';
          const isHidden = hiddenPaths.has(fullPath.replace('.ts', ''));
          const isParentHidden = isPathOrParentHidden(fullPath);
          const folderColor = isFolder ? (colorScale(fullPath) as string) : (colorScale(path || 'root') as string);

          return (
            <div key={fullPath} className="mb-1">
              <div
                onClick={() => toggleFolder(fullPath)}
                className="w-full text-left px-2 py-1 text-sm font-medium text-neutral-300 hover:bg-neutral-700 rounded flex items-center justify-between cursor-pointer group"
                style={{ opacity: isHidden || isParentHidden ? 0.5 : 1 }}
                onMouseEnter={() => {
                  if (isFolder) onHoverFolder(fullPath);
                  else onHoverFile(fullPath);
                }}
                onMouseLeave={() => {
                  if (isFolder) onHoverFolder(null);
                  else onHoverFile(null);
                }}
              >
                <div className="flex items-center gap-1">
                  {isFolder ? (
                    <Folder size={16} style={{ color: folderColor }} />
                  ) : (
                    <File size={16} style={{ color: folderColor }} />
                  )}
                  <span className="truncate" style={{ color: folderColor }}>
                    {name}
                  </span>
                  {isFolder && <span className="text-neutral-500 text-sm">({item.totalSymbols || 0})</span>}
                  {!isFolder && <span className="text-neutral-500 text-sm">({item.symbols.length})</span>}
                </div>
                <Tooltip content={isHidden ? 'Show' : 'Hide'}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePathVisibility(fullPath);
                    }}
                    className={`${isHidden ? '' : 'hidden group-hover:block'} cursor-pointer text-neutral-300`}
                  >
                    {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </Tooltip>
              </div>
              {isExpanded && isFolder && (
                <div className="ml-4 mt-1">
                  <TreeNode
                    data={item.children}
                    path={fullPath}
                    expandedFolders={expandedFolders}
                    toggleFolder={toggleFolder}
                    hiddenPaths={hiddenPaths}
                    togglePathVisibility={togglePathVisibility}
                    hiddenNodes={hiddenNodes}
                    toggleNodeVisibility={toggleNodeVisibility}
                    colorScale={colorScale}
                    onHoverSymbol={onHoverSymbol}
                    onHoverFile={onHoverFile}
                    onHoverFolder={onHoverFolder}
                    hoveredSymbolId={hoveredSymbolId}
                    onSelectSymbol={onSelectSymbol}
                    selectedNodeId={selectedNodeId}
                  />
                </div>
              )}
              {isExpanded && !isFolder && (
                <div className="ml-4 mt-1">
                  {item.symbols.sort().map((symbol: string) => {
                    const symbolId = `${fullPath}.${symbol}`;
                    const isHovered = hoveredSymbolId === symbolId;
                    const isSelected = selectedNodeId === symbolId;
                    const isNodeHidden = hiddenNodes.has(symbolId);
                    const isParentHidden = isPathOrParentHidden(fullPath);
                    return (
                      <div
                        key={symbol}
                        ref={
                          isSelected
                            ? (el: HTMLDivElement) => {
                                if (el) {
                                  requestAnimationFrame(() => {
                                    const scrollContainer = el.closest('.overflow-y-scroll') as HTMLElement;
                                    if (scrollContainer) {
                                      const containerRect = scrollContainer.getBoundingClientRect();
                                      const elementRect = el.getBoundingClientRect();
                                      const offsetTop = elementRect.top - containerRect.top + scrollContainer.scrollTop;
                                      const containerHeight = containerRect.height;

                                      // Center the element in the viewport
                                      const targetScroll = offsetTop - containerHeight / 2 + elementRect.height / 2;
                                      scrollContainer.scrollTop = targetScroll;
                                    }
                                  });
                                }
                              }
                            : null
                        }
                        className={`text-sm px-2 py-0.5 truncate cursor-pointer rounded flex items-center gap-1 group ${
                          isSelected ? 'bg-neutral-500' : isHovered ? 'bg-neutral-600' : 'hover:bg-neutral-700'
                        }`}
                        style={{ color: folderColor, opacity: isNodeHidden || isParentHidden ? 0.5 : 1 }}
                        onMouseEnter={() => {
                          onHoverSymbol(symbolId);
                        }}
                        onMouseLeave={() => {
                          onHoverSymbol(null);
                        }}
                        onClick={() => onSelectSymbol(symbolId)}
                      >
                        <Box size={16} className="shrink-0" style={{ color: folderColor }} />
                        <span className="truncate flex-1">{symbol}</span>
                        <Tooltip content={isNodeHidden ? 'Show' : 'Hide'}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleNodeVisibility(symbolId);
                            }}
                            className={`${isNodeHidden ? '' : 'hidden group-hover:block'} cursor-pointer text-neutral-300`}
                          >
                            {isNodeHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </Tooltip>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
    </>
  );
}

const MemoizedTreeNode = memo(TreeNode);

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resizeRef = useRef<(() => void) | null>(null);
  const sidebarOpenRef = useRef(false);
  const simulationRef = useRef<any>(null);
  const drawRef = useRef<(() => void) | null>(null);
  const hoveredNodeRef = useRef<any>(null);
  const mousePositionRef = useRef({ x: 0, y: 0 });
  const mouseOverCanvasRef = useRef(false);
  const selectedNodeRef = useRef<string | null>(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const dprRef = useRef(window.devicePixelRatio || 1);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('sidebarOpen');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [rightSidebarOpen, setRightSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('rightSidebarOpen');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const rightSidebarOpenRef = useRef(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [hiddenPaths, setHiddenPaths] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('hiddenPaths');
    return saved !== null ? new Set(JSON.parse(saved)) : new Set();
  });
  const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('hiddenNodes');
    return saved !== null ? new Set(JSON.parse(saved)) : new Set();
  });
  const [hoveredSymbolId, setHoveredSymbolId] = useState<string | null>(null);
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
    const saved = localStorage.getItem('chargeStrength');
    return saved !== null ? JSON.parse(saved) : -100;
  });
  const [linkDistance, setLinkDistance] = useState(() => {
    const saved = localStorage.getItem('linkDistance');
    return saved !== null ? JSON.parse(saved) : 30;
  });
  const [alphaDecayValue, setAlphaDecayValue] = useState(() => {
    const saved = localStorage.getItem('alphaDecayValue');
    return saved !== null ? JSON.parse(saved) : 0.0228;
  });
  const [edgeOpacity, setEdgeOpacity] = useState(() => {
    const saved = localStorage.getItem('edgeOpacity');
    return saved !== null ? JSON.parse(saved) : 0.5;
  });
  const [viewMode, setViewMode] = useState<
    | 'edges'
    | 'circles'
    | 'boxes'
    | 'para-fillet'
    | 'para-bezier'
    | 'para-subdiv'
    | 'expand-poly'
    | 'circle-poly'
    | 'ellipse-wrap'
    | 'oriented-rect'
    | 'oriented-rect-rounded'
    | 'oriented-rect-roundpoly'
    | 'oriented-rect-roundpoly2'
  >('oriented-rect-roundpoly');
  const [customData, setCustomData] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [directoryHandle, setDirectoryHandle] = useState<any>(null);

  const { nodes: generatedNodes, edges: generatedEdges } = useMemo(
    () => (customData ? customData : { nodes: [], edges: [] }),
    [customData]
  );

  // Filter nodes and edges based on hidden folders, files, and individual nodes
  const { filteredNodes, filteredEdges } = useMemo(() => {
    const hiddenSet = hiddenPaths;
    const hiddenNodeSet = hiddenNodes;

    const visibleNodes = generatedNodes.filter((node: any) => {
      // Check if this specific node is hidden
      if (hiddenNodeSet.has(node.id)) {
        return false;
      }

      const folder = node.data.folder || 'root';
      const file = node.data.file || '';

      // Check if this folder or any parent folder is hidden
      const folderParts = folder.split('/');
      for (let i = 0; i < folderParts.length; i++) {
        const parentPath = folderParts.slice(0, i + 1).join('/');
        if (hiddenSet.has(parentPath)) {
          return false;
        }
      }

      // Check if this specific file is hidden
      const filePath = file ? `${folder}/${file}` : folder;
      const filePathWithoutExt = filePath.replace('.ts', '');
      if (hiddenSet.has(filePathWithoutExt)) {
        return false;
      }

      return true;
    });

    const visibleNodeIds = new Set(visibleNodes.map((n: any) => n.id));

    const visibleEdges = generatedEdges.filter((edge: any) => {
      // Handle both string IDs and D3 node objects
      const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
      const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;
      return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
    });

    return { filteredNodes: visibleNodes, filteredEdges: visibleEdges };
  }, [generatedNodes, generatedEdges, hiddenPaths, hiddenNodes]);

  const handleHoverSymbol = useCallback(
    (nodeId: string | null) => {
      if (nodeId === null) {
        hoveredNodeRef.current = null;
      } else {
        const node = filteredNodes.find((n: any) => n.id === nodeId);
        hoveredNodeRef.current = node || null;
      }
      if (drawRef.current) {
        drawRef.current();
      }
    },
    [filteredNodes]
  );

  const handleHoverFile = useCallback(
    (filePath: string | null) => {
      // Update hovered nodes to include all nodes from this file
      if (filePath === null) {
        hoveredNodeRef.current = null;
      } else {
        const nodesInFile = filteredNodes.filter((n: any) => {
          const lastDotIndex = n.id.lastIndexOf('.');
          const nodeFilePath = n.id.substring(0, lastDotIndex);
          return nodeFilePath === filePath;
        });
        hoveredNodeRef.current = nodesInFile.length > 0 ? nodesInFile : null;
      }
      if (drawRef.current) {
        drawRef.current();
      }
    },
    [filteredNodes]
  );

  const handleHoverFolder = useCallback(
    (folderPath: string | null) => {
      // Update hovered nodes to include all nodes from this folder and subfolders
      if (folderPath === null) {
        hoveredNodeRef.current = null;
      } else {
        const nodesInFolder = filteredNodes.filter((n: any) => {
          const lastDotIndex = n.id.lastIndexOf('.');
          const nodeFilePath = n.id.substring(0, lastDotIndex);
          // Check if node's file path starts with the folder path
          return nodeFilePath.startsWith(folderPath + '/') || nodeFilePath === folderPath;
        });
        hoveredNodeRef.current = nodesInFolder.length > 0 ? nodesInFolder : null;
      }
      if (drawRef.current) {
        drawRef.current();
      }
    },
    [filteredNodes]
  );

  const handleSelectSymbol = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);

    // Expand the folder path for the selected node
    const lastDotIndex = nodeId.lastIndexOf('.');
    if (lastDotIndex !== -1) {
      const filePath = nodeId.substring(0, lastDotIndex);
      const pathParts = filePath.split('/');
      const pathsToExpand: string[] = [];

      let currentPath = '';
      for (const part of pathParts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        pathsToExpand.push(currentPath);
      }

      setExpandedFolders((prev) => {
        const next = new Set(prev);
        pathsToExpand.forEach((path) => next.add(path));
        return next;
      });
    }
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
      const folder = node.data.folder || 'root';
      map.set(node.id, folder);
    });

    const folderList = Array.from(new Set(Array.from(map.values())));
    const scale = d3.scaleOrdinal(d3.schemeSet3).domain(folderList);

    return { folderMap: map, colorScale: scale };
  }, [generatedNodes]);

  // Build hierarchical folder/file tree structure (based on all nodes for sidebar)
  const treeStructure = useMemo(() => {
    const tree: Record<string, any> = {};

    generatedNodes.forEach((node: any) => {
      const lastDotIndex = node.id.lastIndexOf('.');
      if (lastDotIndex === -1) return;
      const filePath = node.id.substring(0, lastDotIndex);
      const symbolName = node.id.substring(lastDotIndex + 1);

      // Split path into parts
      const parts = filePath.split('/');
      let current = tree;

      parts.forEach((part: string, index: number) => {
        if (!current[part]) {
          current[part] = {
            type: index === parts.length - 1 ? 'file' : 'folder',
            children: {},
            symbols: [],
          };
        }
        if (index === parts.length - 1) {
          // This is a file, add the symbol
          current[part].symbols.push(symbolName);
        } else {
          // This is a folder, move to children
          current = current[part].children;
        }
      });
    });

    // Calculate total symbols for each folder recursively
    function calculateTotalSymbols(node: any): number {
      if (node.type === 'file') {
        return node.symbols.length;
      }
      let total = 0;
      for (const child of Object.values(node.children)) {
        total += calculateTotalSymbols(child);
      }
      node.totalSymbols = total;
      return total;
    }

    for (const key of Object.keys(tree)) {
      calculateTotalSymbols(tree[key]);
    }

    return tree;
  }, [generatedNodes]);

  const toggleFolder = useCallback((folder: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }
      return next;
    });
  }, []);

  const togglePathVisibility = useCallback((path: string) => {
    setHiddenPaths((prev: Set<string>) => {
      const next = new Set(prev);
      // Remove .ts extension for consistency with tree paths
      const normalizedPath = path.replace('.ts', '');
      if (next.has(normalizedPath)) {
        next.delete(normalizedPath);
      } else {
        next.add(normalizedPath);
      }
      return next;
    });
  }, []);

  const toggleNodeVisibility = useCallback((nodeId: string) => {
    setHiddenNodes((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedFolders(new Set());
  }, []);

  const showAll = useCallback(() => {
    setHiddenPaths(new Set());
    setHiddenNodes(new Set());
  }, []);

  const hideAll = useCallback(() => {
    const pathsToHide = new Set<string>();
    const nodesToHide = new Set<string>();

    function collectVisibleItems(node: any, currentPath: string = '') {
      Object.entries(node).forEach(([name, item]: [string, any]) => {
        const fullPath = currentPath ? `${currentPath}/${name}` : name;

        if (item.type === 'folder') {
          if (expandedFolders.has(fullPath)) {
            // Folder is expanded, hide its direct children
            Object.entries(item.children).forEach(([childName, childItem]: [string, any]) => {
              const childPath = `${fullPath}/${childName}`;
              if (childItem.type === 'folder') {
                pathsToHide.add(childPath);
              } else if (childItem.type === 'file') {
                pathsToHide.add(childPath);
                childItem.symbols.forEach((symbol: string) => {
                  nodesToHide.add(`${childPath}.${symbol}`);
                });
              }
            });
          } else {
            // Folder is collapsed, hide the folder itself
            pathsToHide.add(fullPath);
          }
        } else if (item.type === 'file') {
          // Files are only visible if their parent folder is expanded
          // If we reach a file, its parent must be expanded, so hide it
          pathsToHide.add(fullPath);
          item.symbols.forEach((symbol: string) => {
            nodesToHide.add(`${fullPath}.${symbol}`);
          });
        }
      });
    }

    collectVisibleItems(treeStructure);
    setHiddenPaths(pathsToHide);
    setHiddenNodes(nodesToHide);
  }, [treeStructure, expandedFolders]);

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
      // Reset all node positions with random positions around center
      filteredNodes.forEach((node: any) => {
        node.x = (Math.random() - 0.5) * 100;
        node.y = (Math.random() - 0.5) * 100;
        node.vx = 0;
        node.vy = 0;
      });
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

  const expandAll = useCallback(() => {
    const allPaths = new Set<string>();
    function collectPaths(node: any, currentPath: string = '') {
      Object.entries(node).forEach(([name, item]: [string, any]) => {
        const fullPath = currentPath ? `${currentPath}/${name}` : name;
        if (item.type === 'folder') {
          allPaths.add(fullPath);
          collectPaths(item.children, fullPath);
        } else if (item.type === 'file') {
          allPaths.add(fullPath);
        }
      });
    }
    collectPaths(treeStructure);
    setExpandedFolders(allPaths);
  }, [treeStructure]);

  const handleDirectoryPicker = useCallback(async () => {
    try {
      setIsLoading(true);
      const dirHandle = await (window as any).showDirectoryPicker();
      setDirectoryHandle(dirHandle);
      await loadDirectoryData(dirHandle);
    } catch (err) {
      console.error('Directory picker error:', err);
      if ((err as Error).name !== 'AbortError') {
        alert('Error picking directory: ' + (err as Error).message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadDirectoryData = useCallback(async (dirHandle: any) => {
    try {
      setIsLoading(true);
      const files: { path: string; content: string }[] = [];

      async function* getFiles(dirHandle: any, path: string = ''): AsyncGenerator<{ path: string; content: string }> {
        for await (const entry of dirHandle.values()) {
          const entryPath = path ? `${path}/${entry.name}` : entry.name;
          if (entry.kind === 'file' && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
            const file = await entry.getFile();
            const content = await file.text();
            yield { path: entryPath, content };
          } else if (entry.kind === 'directory') {
            yield* getFiles(entry, entryPath);
          }
        }
      }

      for await (const file of getFiles(dirHandle)) {
        files.push(file);
      }

      console.log(`Loaded ${files.length} TypeScript files`);

      // Parse the files to build the symbol graph
      const symbolData = buildSymbolGraphFromFiles(files);
      console.log(`Parsed ${symbolData.nodes.length} symbols and ${symbolData.edges.length} edges`);

      // Convert to the format expected by the graph
      const parsedData = {
        nodes: symbolData.nodes.map((node) => ({
          id: node.id,
          position: { x: 0, y: 0 },
          type: 'endpoint',
          data: {
            label: node.name,
            file: node.file,
            folder: node.folder,
            symbolType: node.type,
            hasUnknownDynamicImport: node.hasUnknownDynamicImport || false,
          },
        })),
        edges: symbolData.edges.map((edge, idx) => ({
          id: `e-${edge.source}-${edge.target}-${idx}`,
          source: edge.source,
          target: edge.target,
          type: edge.type,
          label: edge.label,
        })),
      };

      setCustomData(parsedData);
    } catch (err) {
      console.error('Error loading directory data:', err);
      alert('Error loading directory data: ' + (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!directoryHandle) {
      alert('No directory selected. Please select a directory first.');
      return;
    }
    // Save current visibility states
    const savedHiddenPaths = new Set(hiddenPaths);
    const savedHiddenNodes = new Set(hiddenNodes);
    const savedExpandedFolders = new Set(expandedFolders);

    await loadDirectoryData(directoryHandle);

    // Restore visibility states
    setHiddenPaths(savedHiddenPaths);
    setHiddenNodes(savedHiddenNodes);
    setExpandedFolders(savedExpandedFolders);
  }, [directoryHandle, loadDirectoryData, hiddenPaths, hiddenNodes, expandedFolders]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    const widthRef = {
      current: window.innerWidth - (sidebarOpenRef.current ? 300 : 0) - (rightSidebarOpenRef.current ? 300 : 0),
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

      width = window.innerWidth - (sidebarOpenRef.current ? 300 : 0) - (rightSidebarOpenRef.current ? 300 : 0);
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
      const newWidth = window.innerWidth - (sidebarOpenRef.current ? 300 : 0) - (rightSidebarOpenRef.current ? 300 : 0);
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

    window.addEventListener('resize', handleResize);

    // Initialize transform if not set
    if (transformRef.current.x === 0 && transformRef.current.y === 0) {
      transformRef.current = { x: width / 2, y: height / 2, k: 1 };
    }

    // Manual zoom/pan handling
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let draggedNode: any = null;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
      const newK = transformRef.current.k * zoomFactor;

      // Zoom towards mouse position
      transformRef.current.x = mouseX - (mouseX - transformRef.current.x) * (newK / transformRef.current.k);
      transformRef.current.y = mouseY - (mouseY - transformRef.current.y) * (newK / transformRef.current.k);
      transformRef.current.k = newK;

      draw();
    };

    canvas.addEventListener('wheel', handleWheel);

    const simulation = d3
      .forceSimulation(filteredNodes as any)
      .force(
        'link',
        d3
          .forceLink(filteredEdges as any)
          .id((d: any) => d.id)
          .distance(linkDistance)
      )
      .force('charge', d3.forceManyBody().strength(chargeStrength))
      .force('x', d3.forceX(0))
      .force('y', d3.forceY(0))
      .alphaDecay(forcesEnabled ? 0 : alphaDecayValue);

    simulationRef.current = simulation;

    simulation.on('tick', () => {
      draw();
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

      // Draw polygons/circles/boxes/offsets around nodes from the same file
      // Store hull paths for clipping edges inside groups
      const groupHulls = new Map<string, [number, number][]>();

      if (
        viewMode === 'circles' ||
        viewMode === 'boxes' ||
        viewMode === 'para-fillet' ||
        viewMode === 'para-bezier' ||
        viewMode === 'para-subdiv' ||
        viewMode === 'expand-poly' ||
        viewMode === 'circle-poly' ||
        viewMode === 'ellipse-wrap' ||
        viewMode === 'oriented-rect' ||
        viewMode === 'oriented-rect-rounded' ||
        viewMode === 'oriented-rect-roundpoly' ||
        viewMode === 'oriented-rect-roundpoly2'
      ) {
        const nodesByFile = new Map<string, any[]>();
        filteredNodes.forEach((node: any) => {
          const file = node.data.file;
          const folder = node.data.folder || '';
          const uniqueKey = folder ? `${folder}/${file}` : file;
          if (!nodesByFile.has(uniqueKey)) {
            nodesByFile.set(uniqueKey, []);
          }
          nodesByFile.get(uniqueKey)!.push(node);
        });

        nodesByFile.forEach((nodes, uniqueKey) => {
          // Get folder color for this group
          const folder = nodes[0].data.folder || 'root';
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

          if (viewMode === 'para-fillet') {
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

                const len1 = Math.sqrt(edge1[0] * edge1[0] + edge1[1] * edge1[1]);
                const len2 = Math.sqrt(edge2[0] * edge2[0] + edge2[1] * edge2[1]);
                const norm1 = [edge1[0] / len1, edge1[1] / len1];
                const norm2 = [edge2[0] / len2, edge2[1] / len2];

                const perp1 = [-norm1[1], norm1[0]];
                const perp2 = [-norm2[1], norm2[0]];

                const avgPerp = [(perp1[0] + perp2[0]) / 2, (perp1[1] + perp2[1]) / 2];
                const avgLen = Math.sqrt(avgPerp[0] * avgPerp[0] + avgPerp[1] * avgPerp[1]);
                const normalizedAvg = [avgPerp[0] / avgLen, avgPerp[1] / avgLen];

                offsetPoints.push([current[0] + normalizedAvg[0] * offset, current[1] + normalizedAvg[1] * offset] as [
                  number,
                  number,
                ]);
              }

              context.beginPath();

              for (let i = 0; i < offsetPoints.length; i++) {
                const current = offsetPoints[i];
                const prev = offsetPoints[(i - 1 + offsetPoints.length) % offsetPoints.length];
                const next = offsetPoints[(i + 1) % offsetPoints.length];

                const v1 = [prev[0] - current[0], prev[1] - current[1]];
                const v2 = [next[0] - current[0], next[1] - current[1]];

                const len1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1]);
                const len2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1]);
                const n1 = [v1[0] / len1, v1[1] / len1];
                const n2 = [v2[0] / len2, v2[1] / len2];

                const chamferDist = Math.min(chamferSize, Math.min(len1, len2) / 2);
                const chamferStart = [current[0] + n1[0] * chamferDist, current[1] + n1[1] * chamferDist];
                const chamferEnd = [current[0] + n2[0] * chamferDist, current[1] + n2[1] * chamferDist];

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
          } else if (viewMode === 'para-bezier') {
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

                const len1 = Math.sqrt(edge1[0] * edge1[0] + edge1[1] * edge1[1]);
                const len2 = Math.sqrt(edge2[0] * edge2[0] + edge2[1] * edge2[1]);
                const norm1 = [edge1[0] / len1, edge1[1] / len1];
                const norm2 = [edge2[0] / len2, edge2[1] / len2];

                const perp1 = [-norm1[1], norm1[0]];
                const perp2 = [-norm2[1], norm2[0]];

                const avgPerp = [(perp1[0] + perp2[0]) / 2, (perp1[1] + perp2[1]) / 2];
                const avgLen = Math.sqrt(avgPerp[0] * avgPerp[0] + avgPerp[1] * avgPerp[1]);
                const normalizedAvg = [avgPerp[0] / avgLen, avgPerp[1] / avgLen];

                offsetPoints.push([current[0] + normalizedAvg[0] * offset, current[1] + normalizedAvg[1] * offset] as [
                  number,
                  number,
                ]);
              }

              context.beginPath();

              for (let i = 0; i < offsetPoints.length; i++) {
                const current = offsetPoints[i];
                const prev = offsetPoints[(i - 1 + offsetPoints.length) % offsetPoints.length];
                const next = offsetPoints[(i + 1) % offsetPoints.length];

                if (i === 0) {
                  context.moveTo(current[0], current[1]);
                } else {
                  const cp1x = prev[0] + (current[0] - prev[0]) * smoothness;
                  const cp1y = prev[1] + (current[1] - prev[1]) * smoothness;
                  const cp2x = current[0] - (next[0] - current[0]) * smoothness;
                  const cp2y = current[1] - (next[1] - current[1]) * smoothness;
                  context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, current[0], current[1]);
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
          } else if (viewMode === 'para-subdiv') {
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

                const len1 = Math.sqrt(edge1[0] * edge1[0] + edge1[1] * edge1[1]);
                const len2 = Math.sqrt(edge2[0] * edge2[0] + edge2[1] * edge2[1]);
                const norm1 = [edge1[0] / len1, edge1[1] / len1];
                const norm2 = [edge2[0] / len2, edge2[1] / len2];

                const perp1 = [-norm1[1], norm1[0]];
                const perp2 = [-norm2[1], norm2[0]];

                const avgPerp = [(perp1[0] + perp2[0]) / 2, (perp1[1] + perp2[1]) / 2];
                const avgLen = Math.sqrt(avgPerp[0] * avgPerp[0] + avgPerp[1] * avgPerp[1]);
                const normalizedAvg = [avgPerp[0] / avgLen, avgPerp[1] / avgLen];

                offsetPoints.push([current[0] + normalizedAvg[0] * offset, current[1] + normalizedAvg[1] * offset] as [
                  number,
                  number,
                ]);
              }

              // Chaikin's subdivision
              let smoothed = [...offsetPoints];
              for (let iter = 0; iter < iterations; iter++) {
                const newPoints: [number, number][] = [];
                for (let i = 0; i < smoothed.length; i++) {
                  const current = smoothed[i];
                  const next = smoothed[(i + 1) % smoothed.length];
                  const q = [0.75 * current[0] + 0.25 * next[0], 0.75 * current[1] + 0.25 * next[1]] as [
                    number,
                    number,
                  ];
                  const r = [0.25 * current[0] + 0.75 * next[0], 0.25 * current[1] + 0.75 * next[1]] as [
                    number,
                    number,
                  ];
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
          } else if (viewMode === 'expand-poly') {
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
                basePoints.push([centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius]);
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
                basePoints.push([p1.x + dx / 2 + rotatedX, p1.y + dy / 2 + rotatedY]);
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
          } else if (viewMode === 'circle-poly') {
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
                basePoints.push([centerX + Math.cos(angle) * circleRadius, centerY + Math.sin(angle) * circleRadius]);
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
                basePoints.push([p1.x + dx / 2 + rotatedX, p1.y + dy / 2 + rotatedY]);
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
          } else if (viewMode === 'ellipse-wrap') {
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
              const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
              const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;

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
          } else if (viewMode === 'oriented-rect') {
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
              const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
              const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;

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
            context.roundRect(-width / 2, -height / 2, width, height, cornerRadius);
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
              return [centerX + rotatedX, centerY + rotatedY] as [number, number];
            });
            groupHulls.set(uniqueKey, rectHull);
          } else if (viewMode === 'oriented-rect-rounded') {
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
              const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
              const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;

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
            context.roundRect(-width / 2, -height / 2, width, height, adaptiveCornerRadius);
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
              return [centerX + rotatedX, centerY + rotatedY] as [number, number];
            });
            groupHulls.set(uniqueKey, rectHull2);
          } else if (viewMode === 'oriented-rect-roundpoly') {
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
              context.roundRect(-width / 2, -height / 2, width, height, adaptiveCornerRadius);
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
                const perpendicular = (v: [number, number]): [number, number] => {
                  return [-v[1], v[0]];
                };

                context.beginPath();

                // Process each vertex of the hull
                for (let i = 0; i < hull.length; i++) {
                  const current = hull[i];
                  const prev = hull[(i - 1 + hull.length) % hull.length];
                  const next = hull[(i + 1) % hull.length];

                  // Edge vectors (pointing away from current)
                  const edge1 = [prev[0] - current[0], prev[1] - current[1]] as [number, number];
                  const edge2 = [next[0] - current[0], next[1] - current[1]] as [number, number];

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
                  const toCenter: [number, number] = [centroid[0] - current[0], centroid[1] - current[1]];

                  if (perp1[0] * toCenter[0] + perp1[1] * toCenter[1] > 0) {
                    perp1[0] = -perp1[0];
                    perp1[1] = -perp1[1];
                  }
                  if (perp2[0] * toCenter[0] + perp2[1] * toCenter[1] > 0) {
                    perp2[0] = -perp2[0];
                    perp2[1] = -perp2[1];
                  }

                  // Compute offset edge lines
                  const offsetEdge1_p1 = [prev[0] + perp1[0] * offset, prev[1] + perp1[1] * offset] as [number, number];
                  const offsetEdge1_p2 = [current[0] + perp1[0] * offset, current[1] + perp1[1] * offset] as [
                    number,
                    number,
                  ];

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

                  context.arc(current[0], current[1], radius, startAngle, endAngle, cross < 0);
                }

                context.closePath();
                context.fillStyle = fillColor;
                context.fill();
                context.strokeStyle = strokeColor;
                context.lineWidth = 1;
                context.stroke();
              }
            }
          } else if (viewMode === 'oriented-rect-roundpoly2') {
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
              context.roundRect(-width / 2, -height / 2, width, height, adaptiveCornerRadius);
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
                const perpendicular = (v: [number, number]): [number, number] => {
                  return [-v[1], v[0]];
                };

                context.beginPath();

                // Process each vertex of the hull
                for (let i = 0; i < hull.length; i++) {
                  const current = hull[i];
                  const prev = hull[(i - 1 + hull.length) % hull.length];
                  const next = hull[(i + 1) % hull.length];

                  // Edge vectors (pointing away from current)
                  const edge1 = [prev[0] - current[0], prev[1] - current[1]] as [number, number];
                  const edge2 = [next[0] - current[0], next[1] - current[1]] as [number, number];

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
                  const toCenter: [number, number] = [centroid[0] - current[0], centroid[1] - current[1]];

                  if (perp1[0] * toCenter[0] + perp1[1] * toCenter[1] > 0) {
                    perp1[0] = -perp1[0];
                    perp1[1] = -perp1[1];
                  }
                  if (perp2[0] * toCenter[0] + perp2[1] * toCenter[1] > 0) {
                    perp2[0] = -perp2[0];
                    perp2[1] = -perp2[1];
                  }

                  // Compute offset edge lines
                  const offsetEdge1_p1 = [prev[0] + perp1[0] * offset, prev[1] + perp1[1] * offset] as [number, number];
                  const offsetEdge1_p2 = [current[0] + perp1[0] * offset, current[1] + perp1[1] * offset] as [
                    number,
                    number,
                  ];

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

                  context.arc(current[0], current[1], radius, startAngle, endAngle, cross < 0);
                }

                context.closePath();
                context.fillStyle = fillColor;
                context.fill();
                context.strokeStyle = strokeColor;
                context.lineWidth = 1;
                context.stroke();
              }
            }
          } else if (viewMode === 'circles') {
            // Circle enclosure for circles mode
            if (nodes.length < 1) return;

            // Calculate centroid
            const sumX = nodes.reduce((sum, n) => sum + n.x, 0);
            const sumY = nodes.reduce((sum, n) => sum + n.y, 0);
            const centerX = sumX / nodes.length;
            const centerY = sumY / nodes.length;

            // Calculate max distance from centroid
            const maxDistance = Math.max(...nodes.map((n) => Math.sqrt((n.x - centerX) ** 2 + (n.y - centerY) ** 2)));

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
              circleHull.push([centerX + radius * Math.cos(theta), centerY + radius * Math.sin(theta)]);
            }
            groupHulls.set(uniqueKey, circleHull);
          } else if (viewMode === 'boxes') {
            // Bounding box with rounded corners for boxes mode
            if (nodes.length < 1) return;

            const padding = 15;
            const minX = Math.min(...nodes.map((n) => n.x)) - padding;
            const maxX = Math.max(...nodes.map((n) => n.x)) + padding;
            const minY = Math.min(...nodes.map((n) => n.y)) - padding;
            const maxY = Math.max(...nodes.map((n) => n.y)) + padding;
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
      }

      // Draw edges
      const hoveredNodes = hoveredNodeRef.current;
      const hoveredNodeId = Array.isArray(hoveredNodes) ? hoveredNodes[0]?.id : hoveredNodes?.id;
      const selectedNodeId = selectedNodeRef.current;

      // Check if we're in a grouping mode
      const isGroupingMode =
        viewMode === 'circles' ||
        viewMode === 'boxes' ||
        viewMode === 'para-fillet' ||
        viewMode === 'para-bezier' ||
        viewMode === 'para-subdiv' ||
        viewMode === 'expand-poly' ||
        viewMode === 'circle-poly' ||
        viewMode === 'ellipse-wrap' ||
        viewMode === 'oriented-rect' ||
        viewMode === 'oriented-rect-rounded' ||
        viewMode === 'oriented-rect-roundpoly' ||
        viewMode === 'oriented-rect-roundpoly2';

      if (isGroupingMode) {
        // Group edges by file-to-file connections for namespace imports
        const fileToNodes = new Map<string, any[]>();
        filteredNodes.forEach((node: any) => {
          const file = node.data.file;
          const folder = node.data.folder || '';
          const uniqueKey = folder ? `${folder}/${file}` : file;
          if (!fileToNodes.has(uniqueKey)) {
            fileToNodes.set(uniqueKey, []);
          }
          fileToNodes.get(uniqueKey)!.push(node);
        });

        // Calculate centroids for each file
        const fileCentroids = new Map<string, { x: number; y: number }>();
        fileToNodes.forEach((nodes, file) => {
          const sumX = nodes.reduce((sum, n) => sum + n.x, 0);
          const sumY = nodes.reduce((sum, n) => sum + n.y, 0);
          fileCentroids.set(file, { x: sumX / nodes.length, y: sumY / nodes.length });
        });

        // Separate edge types for polygon view:
        // - Wildcard imports: source file centroid -> target file centroid
        // - Named imports: source file centroid -> target symbol node
        // - Symbol-level dynamic imports: source symbol node -> target file centroid
        const fileConnections = new Map<string, Map<string, { count: number; types: Set<string> }>>();
        const namedImportEdges: any[] = []; // source file -> target symbol
        const symbolLevelEdges: any[] = []; // source symbol -> target file
        const processedEdges = new Set<string>();

        filteredEdges.forEach((edge: any) => {
          // Skip intra-file edges in grouping modes
          const sourceFolder = edge.source.data.folder || '';
          const targetFolder = edge.target.data.folder || '';
          const sourceKey = sourceFolder ? `${sourceFolder}/${edge.source.data.file}` : edge.source.data.file;
          const targetKey = targetFolder ? `${targetFolder}/${edge.target.data.file}` : edge.target.data.file;

          if (sourceKey === targetKey) {
            return;
          }

          // Symbol-level: dynamic imports from specific functions
          if (edge.sourceSymbolType === 'function') {
            symbolLevelEdges.push(edge);
            processedEdges.add(edge.id);
          }
          // Named imports: source file -> target symbol (not wildcard, not symbol-level)
          else if (edge.type === 'import' || edge.type === 're-export') {
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
              targetMap.set(targetKey, { count: 0, types: new Set() });
            }
            const connection = targetMap.get(targetKey)!;
            connection.count++;
            connection.types.add(edge.type);
            processedEdges.add(edge.id);
          }
        });

        // Draw single edges for file-to-file connections between file centroids
        fileConnections.forEach((targetMap, sourceFile) => {
          const sourceCentroid = fileCentroids.get(sourceFile);
          if (!sourceCentroid) return;

          // Get folder color for the source file
          const sourcePathParts = sourceFile.split('/');
          const sourceFolder = sourcePathParts.slice(0, -1).join('/') || 'root';
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
            const targetCentroid = fileCentroids.get(targetFile);
            if (!targetCentroid) return;

            // Use line width based on edge count (min 2, max 8)
            const lineWidth = Math.min(8, Math.max(2, Math.log2(connection.count) + 2));
            const isWildcard = connection.types.has('wildcard');

            context.beginPath();
            context.moveTo(sourceCentroid.x, sourceCentroid.y);
            context.lineTo(targetCentroid.x, targetCentroid.y);
            context.strokeStyle = edgeColor;
            context.lineWidth = isWildcard ? 5 : lineWidth;
            context.globalAlpha = edgeOpacity;
            context.stroke();
            context.globalAlpha = 1;
          });
        });

        // Draw named import edges from source file centroid to target symbol node
        namedImportEdges.forEach((edge: any) => {
          const sourceFolder = edge.source.data.folder || '';
          const sourceKey = sourceFolder ? `${sourceFolder}/${edge.source.data.file}` : edge.source.data.file;
          const sourceCentroid = fileCentroids.get(sourceKey);

          if (!sourceCentroid) return;

          const dx = edge.target.x - sourceCentroid.x;
          const dy = edge.target.y - sourceCentroid.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const offset = 12;

          let targetX = edge.target.x;
          let targetY = edge.target.y;

          if (distance > 0) {
            targetX = sourceCentroid.x + (dx / distance) * (distance - offset);
            targetY = sourceCentroid.y + (dy / distance) * (distance - offset);
          }

          context.beginPath();
          context.moveTo(sourceCentroid.x, sourceCentroid.y);
          context.lineTo(targetX, targetY);
          context.strokeStyle = colorScale(folderMap.get(edge.source.id) || 'root') as string;
          context.lineWidth = 2;
          const isOutgoingFromHovered = hoveredNodeId && edge.source.id === hoveredNodeId;
          const isOutgoingFromSelected = selectedNodeId && edge.source.id === selectedNodeId;
          const isHoveredEdge = hoveredEdgesRef.current.some((e: any) => e.id === edge.id);
          context.globalAlpha = isOutgoingFromHovered || isOutgoingFromSelected || isHoveredEdge ? 1 : edgeOpacity;
          context.stroke();
          context.globalAlpha = 1;
        });

        // Draw symbol-level edges from specific symbol nodes to target file centroids
        symbolLevelEdges.forEach((edge: any) => {
          const targetFolder = edge.target.data.folder || '';
          const targetKey = targetFolder ? `${targetFolder}/${edge.target.data.file}` : edge.target.data.file;
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
          context.strokeStyle = colorScale(folderMap.get(edge.source.id) || 'root') as string;
          context.lineWidth = 2;
          const isOutgoingFromHovered = hoveredNodeId && edge.source.id === hoveredNodeId;
          const isOutgoingFromSelected = selectedNodeId && edge.source.id === selectedNodeId;
          const isHoveredEdge = hoveredEdgesRef.current.some((e: any) => e.id === edge.id);
          context.globalAlpha = isOutgoingFromHovered || isOutgoingFromSelected || isHoveredEdge ? 1 : edgeOpacity;
          context.stroke();
          context.globalAlpha = 1;
        });

        // Clip edges inside groups using destination-out compositing
        // Only apply clipping for Polygon2 (oriented-rect-roundpoly2), not for Polygon
        if (groupHulls.size > 0 && viewMode === 'oriented-rect-roundpoly2') {
          context.save();
          context.globalCompositeOperation = 'destination-out';

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
          context.strokeStyle = colorScale(folderMap.get(edge.source.id) || 'root') as string;
          context.lineWidth = 2;
          const isOutgoingFromHovered = hoveredNodeId && edge.source.id === hoveredNodeId;
          const isOutgoingFromSelected = selectedNodeId && edge.source.id === selectedNodeId;
          const isHoveredEdge = hoveredEdgesRef.current.some((e: any) => e.id === edge.id);
          context.globalAlpha = isOutgoingFromHovered || isOutgoingFromSelected || isHoveredEdge ? 1 : edgeOpacity;
          context.stroke();
          context.globalAlpha = 1;
        });
      }

      // Draw nodes
      filteredNodes.forEach((node: any) => {
        const isSelected = node.id === selectedNodeRef.current;
        const hoveredNodes = hoveredNodeRef.current;
        const isHovered = Array.isArray(hoveredNodes)
          ? hoveredNodes.some((n: any) => n.id === node.id)
          : hoveredNodes?.id === node.id;
        const isEdgeSource = hoveredEdgesRef.current.some((e: any) => node.id === e.source.id);
        const hasUnknownDynamicImport = node.data.hasUnknownDynamicImport;

        context.beginPath();
        context.arc(node.x, node.y, isSelected ? 7 : 5, 0, 2 * Math.PI);
        context.fillStyle = colorScale(folderMap.get(node.id) || 'root') as string;
        context.fill();

        // Use orange border for nodes with unknown dynamic imports
        if (hasUnknownDynamicImport && !isSelected) {
          context.strokeStyle = '#f97316'; // orange-500
          context.lineWidth = 2;
        } else {
          context.strokeStyle = isSelected ? '#ffffff' : '#171717';
          context.lineWidth = isSelected ? 2.5 : 1.5;
        }
        context.stroke();

        // Draw hover overlay (50% opacity neutral-50) on top of border
        if ((isHovered || isEdgeSource) && !isSelected) {
          context.beginPath();
          context.arc(node.x, node.y, 8, 0, 2 * Math.PI);
          context.fillStyle = 'rgba(250, 250, 250, 0.5)';
          context.fill();
        }

        // Draw warning indicator for unknown dynamic imports
        if (hasUnknownDynamicImport) {
          context.beginPath();
          context.arc(node.x + 4, node.y - 4, 3, 0, 2 * Math.PI);
          context.fillStyle = '#f97316';
          context.fill();
        }
      });

      // Draw edge labels (on top of everything)
      filteredEdges.forEach((edge: any) => {
        const isHoveredEdge = hoveredEdgesRef.current.some((e: any) => e.id === edge.id);
        if (edge.label && isHoveredEdge) {
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
          context.font = '10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          const textWidth = context.measureText(edge.label).width;
          const padding = 6;
          const rectWidth = textWidth + padding * 2;
          const rectHeight = 20;
          const rectX = midX - rectWidth / 2;
          const rectY = midY - rectHeight / 2;

          // Draw rounded rectangle background
          context.fillStyle = 'rgba(9, 9, 11, 0.5)';
          context.beginPath();
          context.roundRect(rectX, rectY, rectWidth, rectHeight, 4);
          context.fill();

          // Draw text
          context.fillStyle = '#fafafa';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(edge.label, midX, midY);
        }
      });

      // Draw selected label (always shows if node is selected)
      if (selectedNodeRef.current) {
        const selectedNode = filteredNodes.find((n: any) => n.id === selectedNodeRef.current);
        if (selectedNode) {
          const lastDotIndex = selectedNode.id.lastIndexOf('.');
          const pathPart = selectedNode.id.substring(0, lastDotIndex);
          const symbolPart = selectedNode.id.substring(lastDotIndex + 1);

          // Measure symbol part with bold font
          context.font = 'bold 10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          const symbolWidth = context.measureText(symbolPart).width;

          // Measure path part with normal font
          context.font = '10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          const pathWidth = context.measureText(` ${pathPart}`).width;

          const totalWidth = symbolWidth + pathWidth;
          const startX = selectedNode.x - totalWidth / 2;
          const padding = 6;
          const rectWidth = totalWidth + padding * 2;
          const rectHeight = 20;
          const rectX = startX - padding;
          const rectY = selectedNode.y - 12 - rectHeight;
          const textY = rectY + rectHeight / 2 + 3; // Center text vertically with slight offset for baseline

          // Draw rounded rectangle background (zinc-950 transparent)
          context.fillStyle = 'rgba(9, 9, 11, 0.5)';
          context.beginPath();
          context.roundRect(rectX, rectY, rectWidth, rectHeight, 4);
          context.fill();

          // Draw symbol (bold, white)
          context.font = 'bold 10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          context.fillStyle = '#fafafa'; // neutral-50
          context.fillText(symbolPart, startX, textY);

          // Draw path (normal, gray)
          context.font = '10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          context.fillStyle = '#fafafa'; // neutral-50
          context.fillText(` ${pathPart}`, startX + symbolWidth, textY);
        }
      }

      // Draw hover label (shows if hovering and different from selected)
      if (
        hoveredNodeRef.current &&
        !Array.isArray(hoveredNodeRef.current) &&
        hoveredNodeRef.current.id !== selectedNodeRef.current
      ) {
        const lastDotIndex = hoveredNodeRef.current.id.lastIndexOf('.');
        const pathPart = hoveredNodeRef.current.id.substring(0, lastDotIndex);
        const symbolPart = hoveredNodeRef.current.id.substring(lastDotIndex + 1);

        // Measure symbol part with bold font
        context.font = 'bold 10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const symbolWidth = context.measureText(symbolPart).width;

        // Measure path part with normal font
        context.font = '10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const pathWidth = context.measureText(` ${pathPart}`).width;

        const totalWidth = symbolWidth + pathWidth;
        const startX = hoveredNodeRef.current.x - totalWidth / 2;
        const padding = 6;
        const rectWidth = totalWidth + padding * 2;
        const rectHeight = 20;
        const rectX = startX - padding;
        const rectY = hoveredNodeRef.current.y - 10 - rectHeight;
        const textY = rectY + rectHeight / 2 + 3; // Center text vertically with slight offset for baseline

        // Draw rounded rectangle background (zinc-950 transparent)
        context.fillStyle = 'rgba(9, 9, 11, 0.5)';
        context.beginPath();
        context.roundRect(rectX, rectY, rectWidth, rectHeight, 4);
        context.fill();

        // Draw symbol (bold, white)
        context.font = 'bold 10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        context.fillStyle = '#fafafa'; // neutral-50
        context.fillText(symbolPart, startX, textY);

        // Draw path (normal, gray)
        context.font = '10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        context.fillStyle = '#fafafa'; // neutral-50
        context.fillText(` ${pathPart}`, startX + symbolWidth, textY);
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
      const mouseX = (event.clientX - rect.left - transformRef.current.x) / transformRef.current.k;
      const mouseY = (event.clientY - rect.top - transformRef.current.y) / transformRef.current.k;
      mousePositionRef.current = { x: mouseX, y: mouseY };

      // Handle drag
      if (draggedNode) {
        draggedNode.fx = mouseX;
        draggedNode.fy = mouseY;
        draw();
        return;
      }

      // Handle hover
      let found = null;
      for (const node of filteredNodes) {
        const dx = mouseX - node.x;
        const dy = mouseY - node.y;
        if (dx * dx + dy * dy < 100) {
          // 10px radius squared
          found = node;
          break;
        }
      }

      // Check for edge hover (collect all overlapping edges)
      let hoveredEdgesList = [];
      if (!found) {
        for (const edge of filteredEdges) {
          const dx = edge.target.x - edge.source.x;
          const dy = edge.target.y - edge.source.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance === 0) continue;

          // Calculate distance from point to line segment
          const t = Math.max(
            0,
            Math.min(1, ((mouseX - edge.source.x) * dx + (mouseY - edge.source.y) * dy) / (distance * distance))
          );
          const projX = edge.source.x + t * dx;
          const projY = edge.source.y + t * dy;
          const distToLine = Math.sqrt((mouseX - projX) ** 2 + (mouseY - projY) ** 2);

          if (distToLine < 5) {
            hoveredEdgesList.push(edge);
          }
        }
      }

      if (found !== hoveredNodeRef.current) {
        hoveredNodeRef.current = found;
        setHoveredSymbolId(found ? found.id : null);
        canvas.style.cursor = found ? 'pointer' : hoveredEdgesList.length > 0 ? 'pointer' : 'default';
        draw();
      }

      // Clear edge hover if node is hovered
      if (found) {
        setHoveredEdges([]);
        draw();
      } else {
        setHoveredEdges(hoveredEdgesList);
        if (hoveredEdgesList.length > 0) {
          canvas.style.cursor = 'pointer';
          draw();
        } else {
          canvas.style.cursor = 'default';
          draw();
        }
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseenter', () => {
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
      const mouseX = (event.clientX - rect.left - transformRef.current.x) / transformRef.current.k;
      const mouseY = (event.clientY - rect.top - transformRef.current.y) / transformRef.current.k;

      // Check for node click (selection)
      let nodeClicked = false;
      for (const node of filteredNodes) {
        const dx = mouseX - node.x;
        const dy = mouseY - node.y;
        if (dx * dx + dy * dy < 100) {
          // 10px radius squared
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

      for (const node of filteredNodes) {
        const dx = mouseX - node.x;
        const dy = mouseY - node.y;
        if (dx * dx + dy * dy < 100) {
          draggedNode = node;
          if (!simulationLockedRef.current && simulationRef.current) {
            simulationRef.current.alpha(0.3).restart();
          }
          draggedNode.fx = node.x;
          draggedNode.fy = node.y;
          break;
        }
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);

    const handleMouseUp = () => {
      isPanning = false;
      if (draggedNode) {
        draggedNode.fx = null;
        draggedNode.fy = null;
        draggedNode = null;
        if (!simulationLockedRef.current && simulationRef.current) {
          simulationRef.current.alphaTarget(0);
        }
      }
    };

    canvas.addEventListener('mouseup', handleMouseUp);

    const handleMouseLeave = () => {
      mouseOverCanvasRef.current = false;
      isPanning = false;
      hoveredNodeRef.current = null;
      setHoveredEdges([]);
      if (draggedNode) {
        draggedNode.fx = null;
        draggedNode.fy = null;
        draggedNode = null;
        if (!simulationLockedRef.current && simulationRef.current) {
          simulationRef.current.alphaTarget(0);
        }
      }
      draw();
    };

    canvas.addEventListener('mouseleave', handleMouseLeave);

    const handleContextMenu = (event: Event) => {
      event.preventDefault();
    };

    canvas.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [filteredNodes, filteredEdges, folderMap, colorScale, hiddenPaths, hiddenNodes, edgeOpacity, viewMode]);

  // Handle sidebar resize without re-initializing simulation
  useEffect(() => {
    sidebarOpenRef.current = sidebarOpen;
    localStorage.setItem('sidebarOpen', JSON.stringify(sidebarOpen));
    if (resizeRef.current) {
      resizeRef.current();
    }
  }, [sidebarOpen]);

  // Handle right sidebar resize without re-initializing simulation
  useEffect(() => {
    rightSidebarOpenRef.current = rightSidebarOpen;
    localStorage.setItem('rightSidebarOpen', JSON.stringify(rightSidebarOpen));
    if (resizeRef.current) {
      resizeRef.current();
    }
  }, [rightSidebarOpen]);

  // Persist hiddenPaths to localStorage
  useEffect(() => {
    localStorage.setItem('hiddenPaths', JSON.stringify(Array.from(hiddenPaths)));
  }, [hiddenPaths]);

  // Persist hiddenNodes to localStorage
  useEffect(() => {
    localStorage.setItem('hiddenNodes', JSON.stringify(Array.from(hiddenNodes)));
  }, [hiddenNodes]);

  // Persist D3 parameters to localStorage
  useEffect(() => {
    localStorage.setItem('chargeStrength', JSON.stringify(chargeStrength));
  }, [chargeStrength]);

  useEffect(() => {
    localStorage.setItem('linkDistance', JSON.stringify(linkDistance));
  }, [linkDistance]);

  useEffect(() => {
    localStorage.setItem('alphaDecayValue', JSON.stringify(alphaDecayValue));
  }, [alphaDecayValue]);

  useEffect(() => {
    localStorage.setItem('edgeOpacity', JSON.stringify(edgeOpacity));
  }, [edgeOpacity]);

  // Update simulation forces when D3 parameters change
  useEffect(() => {
    if (simulationRef.current) {
      simulationRef.current.force('charge').strength(chargeStrength);
      simulationRef.current.force('link').distance(linkDistance);
      simulationRef.current.alpha(0.3).restart();
    }
  }, [chargeStrength, linkDistance]);

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
      simulationRef.current.force('link').links(filteredEdges as any);
      simulationRef.current.alpha(1).restart();
    }
  }, [filteredNodes, filteredEdges]);

  return (
    <div className="h-screen w-screen bg-neutral-900 flex">
      {/* Sidebar */}
      <div
        className={`bg-neutral-900 overflow-hidden ${sidebarOpen ? 'border-r border-neutral-700' : ''}`}
        style={{ width: sidebarOpen ? '300px' : '0px' }}
      >
        <div className="p-4">
          <div
            className="flex items-center gap-2 cursor-pointer hover:bg-neutral-800 p-2 rounded-lg select-none"
            onClick={() => setSidebarOpen(false)}
            style={{ maxWidth: 'fit-content' }}
          >
            <Menu size={24} className="text-neutral-50" />
            <h1 className="font-semibold text-neutral-50">Symbol Explorer</h1>
          </div>
        </div>
        <div>
          <div className="flex flex-col">
            <div className="pr-4 flex justify-end gap-1 mb-2">
              <Tooltip content="Open Directory">
                <button
                  onClick={handleDirectoryPicker}
                  disabled={isLoading}
                  className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  <FolderOpen size={16} />
                </button>
              </Tooltip>
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
              <>
                <div className="pr-4 flex justify-end gap-1">
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
                      onClick={expandAll}
                      className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded-lg cursor-pointer"
                    >
                      <CopyPlus size={16} />
                    </button>
                  </Tooltip>
                  <Tooltip content="Collapse All">
                    <button
                      onClick={collapseAll}
                      className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded-lg cursor-pointer"
                    >
                      <CopyMinus size={16} />
                    </button>
                  </Tooltip>
                </div>
                <div className="p-2 overflow-y-scroll" style={{ height: 'calc(100vh - 180px)' }}>
                  <MemoizedTreeNode
                    data={treeStructure}
                    path=""
                    expandedFolders={expandedFolders}
                    toggleFolder={toggleFolder}
                    hiddenPaths={hiddenPaths}
                    togglePathVisibility={togglePathVisibility}
                    hiddenNodes={hiddenNodes}
                    toggleNodeVisibility={toggleNodeVisibility}
                    colorScale={colorScale}
                    onHoverSymbol={handleHoverSymbol}
                    onHoverFile={handleHoverFile}
                    onHoverFolder={handleHoverFolder}
                    hoveredSymbolId={hoveredSymbolId}
                    onSelectSymbol={handleSelectSymbol}
                    selectedNodeId={selectedNodeId}
                  />
                </div>
              </>
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
              style={{ maxWidth: 'fit-content' }}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={24} className="text-neutral-50" />
              <h1 className="font-semibold text-neutral-50">Symbol Explorer</h1>
            </div>
          )}
        </div>
        <div className="absolute top-6 right-6 z-10">
          {!rightSidebarOpen && (
            <div onClick={() => setRightSidebarOpen(!rightSidebarOpen)} className="cursor-pointer select-none">
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
              <p className="text-neutral-500 text-sm">Click the folder icon in the sidebar to import a directory</p>
            </div>
          </div>
        )}
      </div>

      {/* Right sidebar */}
      <div
        className={`bg-neutral-900 overflow-hidden ${rightSidebarOpen ? 'border-l border-neutral-700' : ''}`}
        style={{ width: rightSidebarOpen ? '300px' : '0px' }}
      >
        <div className="p-4">
          <div className="p-2 flex items-center justify-between">
            <h1 className="font-semibold text-neutral-50">Settings</h1>
            <div onClick={() => setRightSidebarOpen(false)} className="cursor-pointer select-none">
              <Settings size={24} className="text-neutral-400" />
            </div>
          </div>
        </div>
        <div className="px-4 pb-4">
          <div className="flex justify-end gap-1">
            <Tooltip content="Lock Simulation">
              <button
                onClick={() => !simulationLocked && toggleSimulationLock()}
                disabled={simulationLocked}
                className={`p-2 rounded-lg cursor-pointer ${simulationLocked ? 'text-neutral-600 cursor-not-allowed' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700'}`}
              >
                <Lock size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Unlock Simulation">
              <button
                onClick={() => simulationLocked && toggleSimulationLock()}
                disabled={!simulationLocked}
                className={`p-2 rounded-lg cursor-pointer ${!simulationLocked ? 'text-neutral-600 cursor-not-allowed' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700'}`}
              >
                <Unlock size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Run Forces">
              <button
                onClick={() => !forcesEnabled && toggleForces()}
                disabled={forcesEnabled}
                className={`p-2 rounded-lg cursor-pointer ${forcesEnabled ? 'text-neutral-600 cursor-not-allowed' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700'}`}
              >
                <Play size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Stop Forces">
              <button
                onClick={() => forcesEnabled && toggleForces()}
                disabled={!forcesEnabled}
                className={`p-2 rounded-lg cursor-pointer ${!forcesEnabled ? 'text-neutral-600 cursor-not-allowed' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700'}`}
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
        </div>
        <div className="px-4 pb-4 space-y-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-2">View Mode</label>
            <div className="flex flex-wrap gap-2">
              <ViewModeButton
                mode="oriented-rect-roundpoly"
                label="Polygon"
                currentViewMode={viewMode}
                onClick={() => setViewMode('oriented-rect-roundpoly')}
              />
              <ViewModeButton
                mode="edges"
                label="Edges"
                currentViewMode={viewMode}
                onClick={() => setViewMode('edges')}
              />
              <ViewModeButton
                mode="ellipse-wrap"
                label="Ellipse"
                currentViewMode={viewMode}
                onClick={() => setViewMode('ellipse-wrap')}
              />
              <ViewModeButton
                mode="circles"
                label="Circles"
                currentViewMode={viewMode}
                onClick={() => setViewMode('circles')}
              />
              <ViewModeButton
                mode="boxes"
                label="Blocks"
                currentViewMode={viewMode}
                onClick={() => setViewMode('boxes')}
              />
              <ViewModeButton
                mode="oriented-rect"
                label="Rectangles"
                currentViewMode={viewMode}
                onClick={() => setViewMode('oriented-rect')}
              />
              <ViewModeButton
                mode="oriented-rect-rounded"
                label="Capsules"
                currentViewMode={viewMode}
                onClick={() => setViewMode('oriented-rect-rounded')}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-neutral-500 mb-2 text-xs uppercase tracking-wide">Experimental</label>
            <div className="flex flex-wrap gap-2">
              <ViewModeButton
                mode="para-fillet"
                label="Fillet"
                currentViewMode={viewMode}
                onClick={() => setViewMode('para-fillet')}
              />
              <ViewModeButton
                mode="para-bezier"
                label="Bezier"
                currentViewMode={viewMode}
                onClick={() => setViewMode('para-bezier')}
              />
              <ViewModeButton
                mode="para-subdiv"
                label="Subdiv"
                currentViewMode={viewMode}
                onClick={() => setViewMode('para-subdiv')}
              />
              <ViewModeButton
                mode="expand-poly"
                label="ExpPoly"
                currentViewMode={viewMode}
                onClick={() => setViewMode('expand-poly')}
              />
              <ViewModeButton
                mode="circle-poly"
                label="CirPoly"
                currentViewMode={viewMode}
                onClick={() => setViewMode('circle-poly')}
              />
              <ViewModeButton
                mode="oriented-rect-roundpoly2"
                label="Polygon2"
                currentViewMode={viewMode}
                onClick={() => setViewMode('oriented-rect-roundpoly2')}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-2">Charge Strength</label>
            <input
              type="number"
              value={chargeStrength}
              onChange={(e) => setChargeStrength(Number(e.target.value))}
              className="w-full bg-neutral-800 text-neutral-50 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-2">Link Distance</label>
            <input
              type="number"
              value={linkDistance}
              onChange={(e) => setLinkDistance(Number(e.target.value))}
              className="w-full bg-neutral-800 text-neutral-50 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-2">Alpha Decay</label>
            <input
              type="number"
              step="0.0001"
              value={alphaDecayValue}
              onChange={(e) => setAlphaDecayValue(Number(e.target.value))}
              className="w-full bg-neutral-800 text-neutral-50 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-2">Edge Opacity</label>
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
        </div>
      </div>
    </div>
  );
}

export default App;
