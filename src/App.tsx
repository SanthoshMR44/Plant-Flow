import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  useNodesState,
  useEdgesState,
  MarkerType
} from '@xyflow/react';
import type { Connection } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { usePlantState } from './hooks/usePlantState';
import { nodeTypes } from './components/graph/CustomNodes';
import { Header } from './components/Header';
import { Sidebar } from './components/panels/Sidebar';
import { DetailsPanel } from './components/panels/DetailsPanel';
import { GraphToolbar } from './components/toolbar/GraphToolbar';
import { AddNodeModal, AddParallelModal } from './components/modals/AddNodeModal';
import { CompositeModal } from './components/modals/CompositeModal';
import { ToastContainer } from './components/common/Toast';
import type { PlantNode, FlowType } from './types/plant';
import { ArrowLeft, GitBranch, Factory, ChevronRight } from 'lucide-react';
import dagre from '@dagrejs/dagre';

function FlowCanvas() {
  const {
    plants,
    currentPlantId,
    activePlant,
    drillDownPath,
    nestedViewMode,
    selectedNodeId,
    toasts,
    canUndo,
    canRedo,
    dismissToast,
    setNestedViewMode,
    setDrillDownPath,
    setSelectedNodeId,
    selectPlant,
    resetDemo,
    clearCanvas,
    getActiveGraph,
    updateNodePositions,
    persistPositions,
    addNode,
    editNode,
    duplicateNode,
    deleteNode,
    addParallelEquipment,
    addConnection,
    deleteConnection,
    undo,
    redo,
    importJSON,
    exportJSON,
    makeNodeComposite,
    updateCompositeProcessGraph,
  } = usePlantState();

  const { screenToFlowPosition } = useReactFlow();

  // Dialog open states
  const [isAddNodeOpen, setIsAddNodeOpen] = useState(false);
  const [isAddParallelOpen, setIsAddParallelOpen] = useState(false);
  const [isConnectingMode, setIsConnectingMode] = useState(false);

  // Approach A Modal State
  const [isSubprocessOpen, setIsSubprocessOpen] = useState(false);
  const [subprocessParent, setSubprocessParent] = useState<PlantNode | null>(null);

  // Connection flow selector state
  const [activeFlowType, setActiveFlowType] = useState<FlowType>('material');
  const [activeEdgeLabel, setActiveEdgeLabel] = useState('');

  // Dynamic Electron Window Title (Phase 13 requirement)
  useEffect(() => {
    if (window.desktopAPI && activePlant?.name) {
      window.desktopAPI.setWindowTitle(activePlant.name);
    }
  }, [activePlant]);

  // Desktop Keyboard Shortcuts (Phase 15 requirement)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toUpperCase();
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'n') {
          e.preventDefault();
          selectPlant('empty-plant');
        } else if (e.key.toLowerCase() === 'o') {
          e.preventDefault();
          importJSON();
        } else if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          exportJSON();
        } else if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectPlant, importJSON, exportJSON, undo, redo]);

  // Fetch the active graph (root or nested)
  const { nodes: activeNodes, edges: activeEdges } = getActiveGraph();

  // Local Nodes/Edges states for React Flow
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<any>([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<any>([]);

  // Layout tracking to prevent infinite loops
  const initialLayoutDoneRef = useRef<Record<string, boolean>>({});

  // Auto Layout implementation using Dagre (Phase 3 requirement)
  const onAutoLayout = useCallback(() => {
    if (activeNodes.length === 0) return;

    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', align: 'UL', ranksep: 75, nodesep: 55 });
    g.setDefaultEdgeLabel(() => ({}));

    activeNodes.forEach((node) => {
      const width = node.type === 'input' ? 208 : (node.type === 'storage' ? 240 : 256);
      const height = node.type === 'input' ? 80 : (node.type === 'storage' ? 140 : 130);
      g.setNode(node.id, { width, height });
    });

    activeEdges.forEach((edge) => {
      g.setEdge(edge.source, edge.target, { id: edge.id });
    });

    dagre.layout(g);

    const layoutedFlowNodes = activeNodes.map((node) => {
      const pos = g.node(node.id);
      const width = node.type === 'input' ? 208 : (node.type === 'storage' ? 240 : 256);
      const height = node.type === 'input' ? 80 : (node.type === 'storage' ? 140 : 130);
      return {
        id: node.id,
        x: pos ? Math.round(pos.x - width / 2) : (node.x || 100),
        y: pos ? Math.round(pos.y - height / 2) : (node.y || 100),
      };
    });

    updateNodePositions(layoutedFlowNodes);
  }, [activeNodes, activeEdges, updateNodePositions]);

  // Phase 3: Automatic Initial Layout Check on Load
  useEffect(() => {
    if (activeNodes.length === 0) return;
    const pathKey = `${currentPlantId}:${drillDownPath.join('>')}`;

    // If nodes lack x/y coordinates or initial layout has not been run for this graph path
    const needsInitialLayout = activeNodes.some((n) => typeof n.x !== 'number' || typeof n.y !== 'number');

    if (needsInitialLayout || !initialLayoutDoneRef.current[pathKey]) {
      initialLayoutDoneRef.current[pathKey] = true;
      if (needsInitialLayout) {
        onAutoLayout();
      }
    }
  }, [currentPlantId, drillDownPath, activeNodes, onAutoLayout]);

  // Synchronize React Flow local states with custom store (Phase 5 & 6)
  useEffect(() => {
    const formattedNodes = activeNodes.map((node) => ({
      id: node.id,
      type: node.type,
      data: {
        name: node.name,
        category: node.category,
        description: node.description,
        status: node.status,
        instanceId: node.instanceId,
        equipmentType: node.equipmentType,
        metadata: node.metadata,
        onViewSubprocess: (nodeId: string) => {
          const targetNode = activeNodes.find((n) => n.id === nodeId);
          if (!targetNode) return;
          
          if (nestedViewMode === 'expandable') {
            const compositeProcess = activePlant.compositeProcesses[nodeId];
            setSubprocessParent(targetNode);
            setIsSubprocessOpen(true);
            if (!compositeProcess) {
              updateCompositeProcessGraph(nodeId, [], []);
            }
          } else {
            setDrillDownPath((prev) => [...prev, nodeId]);
            setSelectedNodeId(null);
          }
        },
      },
      position: { x: node.x ?? 100, y: node.y ?? 100 },
    }));

    const formattedEdges = activeEdges.map((edge) => {
      let edgeColor = '#475569';
      if (edge.flowType === 'fuel') edgeColor = '#f97316';
      if (edge.flowType === 'air') edgeColor = '#0ea5e9';
      if (edge.flowType === 'alternative') edgeColor = '#a855f7';

      const isSpecialFlow = edge.flowType !== 'material';

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        type: 'default',
        animated: isSpecialFlow,
        className: isSpecialFlow ? 'edge-flow-animated' : '',
        style: { stroke: edgeColor, strokeWidth: 2.5 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeColor,
          width: 14,
          height: 14,
        },
      };
    });

    setFlowNodes(formattedNodes);
    setFlowEdges(formattedEdges);
  }, [
    activeNodes,
    activeEdges,
    nestedViewMode,
    activePlant,
    setDrillDownPath,
    setSelectedNodeId,
    setFlowNodes,
    setFlowEdges,
    updateCompositeProcessGraph
  ]);

  // Handle Drag Over Canvas (HTML5 DnD)
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Handle Drop on Canvas (HTML5 DnD)
  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();

    const dataStr = event.dataTransfer.getData('application/reactflow');
    if (!dataStr) return;

    try {
      const itemData = JSON.parse(dataStr);
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newId = addNode({
        type: itemData.type,
        name: itemData.name,
        category: itemData.category,
        description: itemData.description,
        status: 'running',
        isComposite: itemData.type === 'composite',
      });

      setTimeout(() => {
        updateNodePositions([{ id: newId, x: Math.round(position.x), y: Math.round(position.y) }]);
        persistPositions();
      }, 50);
    } catch (e) {
      console.error('Failed to drop item', e);
    }
  }, [screenToFlowPosition, addNode, updateNodePositions, persistPositions]);

  // Connection triggers
  const onConnect = useCallback((connection: Connection) => {
    if (connection.source && connection.target) {
      addConnection({
        source: connection.source,
        target: connection.target,
        flowType: activeFlowType,
        label: activeEdgeLabel,
      });
      setActiveEdgeLabel('');
    }
  }, [activeFlowType, activeEdgeLabel, addConnection]);

  // Phase 5: Keyboard Deletion handler for Nodes
  const onNodesDelete = useCallback((deletedNodes: any[]) => {
    deletedNodes.forEach((node) => {
      deleteNode(node.id);
    });
  }, [deleteNode]);

  // Phase 6: Keyboard Deletion handler for Edges
  const onEdgesDelete = useCallback((deletedEdges: any[]) => {
    deletedEdges.forEach((edge) => {
      deleteConnection(edge.id);
    });
  }, [deleteConnection]);

  // Handle node selection change
  const onNodeClick = useCallback((_: React.MouseEvent, node: any) => {
    setSelectedNodeId(node.id);
  }, [setSelectedNodeId]);

  // Handle node double click (Drill Down Shortcut)
  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: any) => {
    const targetNode = activeNodes.find((n) => n.id === node.id);
    if (targetNode?.type === 'composite') {
      if (nestedViewMode === 'drilldown') {
        setDrillDownPath((prev) => [...prev, node.id]);
        setSelectedNodeId(null);
      } else {
        setSubprocessParent(targetNode);
        setIsSubprocessOpen(true);
      }
    }
  }, [activeNodes, nestedViewMode, setDrillDownPath, setSelectedNodeId]);

  // Phase 13: Interactive Hierarchy Breadcrumbs
  const renderBreadcrumbHierarchy = () => {
    if (drillDownPath.length <= 1) return null;

    const pathItems: { id: string; name: string }[] = [{ id: 'root', name: activePlant.name || 'Plant Graph' }];

    // Resolve name for each nested level in drillDownPath
    for (let i = 1; i < drillDownPath.length; i++) {
      const parentId = drillDownPath[i];
      let name = 'Composite Process';
      
      // Search root nodes first, then composite processes
      const foundRoot = activePlant.nodes.find((n) => n.id === parentId);
      if (foundRoot) {
        name = foundRoot.name;
      } else {
        // Search inside parent composite processes
        for (const comp of Object.values(activePlant.compositeProcesses)) {
          const foundInner = comp.nodes.find((n) => n.id === parentId);
          if (foundInner) {
            name = foundInner.name;
            break;
          }
        }
      }
      pathItems.push({ id: parentId, name });
    }

    return (
      <div className="absolute top-20 left-6 z-10 flex items-center gap-1.5 p-2 bg-white/95 backdrop-blur border border-slate-200 shadow-md rounded-xl text-xs font-semibold text-slate-700">
        <button
          onClick={() => {
            setDrillDownPath((prev) => prev.slice(0, -1));
            setSelectedNodeId(null);
          }}
          className="flex items-center gap-1 px-2 py-1 hover:bg-slate-100 rounded-lg text-indigo-600 transition-colors mr-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>

        <span className="text-slate-300">|</span>

        {pathItems.map((item, idx) => {
          const isLast = idx === pathItems.length - 1;
          return (
            <React.Fragment key={`${item.id}-${idx}`}>
              {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-400" />}
              <button
                onClick={() => {
                  setDrillDownPath(drillDownPath.slice(0, idx + 1));
                  setSelectedNodeId(null);
                }}
                disabled={isLast}
                className={`px-2 py-1 rounded-md transition-all ${
                  isLast
                    ? 'text-indigo-600 font-extrabold bg-indigo-50 border border-indigo-100'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                {item.name}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  // Drag and drop helper to directly append to state positions
  const onNodesDragStop = useCallback((_: any, nodesList: any[]) => {
    updateNodePositions(nodesList);
    persistPositions();
  }, [updateNodePositions, persistPositions]);

  const handleAddNodeDirectly = (data: {
    type: string;
    name: string;
    category: string;
    description: string;
    status: any;
    isComposite?: boolean;
  }) => {
    addNode(data as any);
  };

  // Retrieve composite process info for active expandable view modal
  const selectedCompositeProcess = useMemo(() => {
    if (!subprocessParent) return null;
    return activePlant.compositeProcesses[subprocessParent.id] || null;
  }, [subprocessParent, activePlant]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      {/* Top Header */}
      <Header
        plants={plants}
        currentPlantId={currentPlantId}
        onSelectPlant={selectPlant}
        onSaveLocally={persistPositions}
        onResetDemo={resetDemo}
        onClearCanvas={clearCanvas}
        onExportJSON={exportJSON}
        onImportJSON={importJSON}
        nestedViewMode={nestedViewMode}
        onSetNestedViewMode={setNestedViewMode}
        drillDownPath={drillDownPath}
      />

      {/* Main workspace */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Library Sidebar */}
        <Sidebar onAddNode={handleAddNodeDirectly} />

        {/* Central Graph Workspace */}
        <div className="flex-1 flex flex-col relative bg-slate-50">
          {/* Phase 13: Interactive Nested Hierarchy Breadcrumbs */}
          {renderBreadcrumbHierarchy()}

          {/* Floating Flow Connection Selector (Appears during Connection Mode) */}
          {isConnectingMode && (
            <div className="absolute top-20 right-6 z-10 p-3 bg-white/95 backdrop-blur border border-amber-200 shadow-md rounded-xl w-60 space-y-2.5">
              <div className="flex items-center gap-1.5 text-amber-700 font-bold text-xs">
                <GitBranch className="w-4 h-4" />
                <span>Link Settings</span>
              </div>
              
              <div className="space-y-1.5 text-[10px]">
                <label className="block text-slate-400 font-bold uppercase tracking-wider">
                  Select Flow Type
                </label>
                <div className="grid grid-cols-2 gap-1 font-semibold">
                  {[
                    { type: 'material', label: 'Material' },
                    { type: 'fuel', label: 'Fuel' },
                    { type: 'air', label: 'Air' },
                    { type: 'alternative', label: 'Alt Mat' },
                  ].map((flow) => (
                    <button
                      key={flow.type}
                      type="button"
                      onClick={() => setActiveFlowType(flow.type as FlowType)}
                      className={`py-1 border rounded-lg transition-all ${
                        activeFlowType === flow.type
                          ? flow.type === 'fuel'
                            ? 'bg-orange-50 border-orange-500 text-orange-700'
                            : flow.type === 'air'
                            ? 'bg-sky-50 border-sky-500 text-sky-700'
                            : flow.type === 'alternative'
                            ? 'bg-purple-50 border-purple-500 text-purple-700'
                            : 'bg-slate-100 border-slate-600 text-slate-800'
                          : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      {flow.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1 text-[10px]">
                <label className="block text-slate-400 font-bold uppercase tracking-wider">
                  Link Label (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Coal Feed, 1450C Stream"
                  value={activeEdgeLabel}
                  onChange={(e) => setActiveEdgeLabel(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <p className="text-[9px] text-amber-600/90 leading-tight">
                Now drag links from a node's handle to another node. Click "Add Link" in toolbar to turn off.
              </p>
            </div>
          )}

          {/* Floating Graph Toolbar */}
          <GraphToolbar
            onAutoLayout={onAutoLayout}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            onAddNode={() => setIsAddNodeOpen(true)}
            onAddParallel={() => setIsAddParallelOpen(true)}
            onAddConnection={() => setIsConnectingMode((prev) => !prev)}
            isConnectingMode={isConnectingMode}
          />

          {/* React Flow Editor */}
          <div className="flex-1 w-full h-full" onDragOver={onDragOver} onDrop={onDrop}>
            {flowNodes.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 bg-slate-50 select-none">
                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-full text-indigo-600 mb-4 animate-bounce">
                  <Factory className="w-10 h-10" />
                </div>
                <h2 className="font-extrabold text-slate-800 text-base">Start building your plant</h2>
                <p className="text-slate-400 text-xs mt-1.5 max-w-sm leading-normal">
                  No equipment exists on the canvas. Drag items from the library on the left, or use the buttons below.
                </p>
                <div className="flex items-center gap-3 mt-5">
                  <button
                    onClick={() => setIsAddNodeOpen(true)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all"
                  >
                    Add Process Node
                  </button>
                  <button
                    onClick={() => setIsAddParallelOpen(true)}
                    className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl shadow-sm transition-all"
                  >
                    Add Parallel Equipment
                  </button>
                </div>
              </div>
            ) : (
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodesDelete={onNodesDelete}
                onEdgesDelete={onEdgesDelete}
                onNodeDragStop={onNodesDragStop}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onNodeDoubleClick={onNodeDoubleClick}
                nodeTypes={nodeTypes}
                fitView
                proOptions={{ hideAttribution: true }}
                className="select-none font-sans"
              >
                <Background color="#cbd5e1" gap={16} size={1} />
                <Controls className="!bg-white !border-slate-200 !shadow-md !rounded-lg" />
                <MiniMap 
                  className="!border-slate-200 !shadow-md !rounded-lg"
                  nodeColor={(node) => {
                    if (node.type === 'composite') return '#8b5cf6';
                    if (node.type === 'storage') return '#475569';
                    if (node.type === 'input') return '#f97316';
                    return '#3b82f6';
                  }}
                />
              </ReactFlow>
            )}
          </div>
        </div>

        {/* Right Node Details Panel */}
        <DetailsPanel
          selectedNodeId={selectedNodeId}
          nodes={activeNodes}
          edges={activeEdges}
          onClose={() => setSelectedNodeId(null)}
          onEdit={editNode}
          onDelete={deleteNode}
          onDuplicate={duplicateNode}
          onMakeComposite={makeNodeComposite}
          onViewSubprocess={(nodeId) => {
            const targetNode = activeNodes.find((n) => n.id === nodeId);
            if (!targetNode) return;
            if (nestedViewMode === 'expandable') {
              setSubprocessParent(targetNode);
              setIsSubprocessOpen(true);
            } else {
              setDrillDownPath((prev) => [...prev, nodeId]);
              setSelectedNodeId(null);
            }
          }}
        />
      </div>

      {/* Dynamic Modal Windows */}
      <AddNodeModal
        isOpen={isAddNodeOpen}
        onClose={() => setIsAddNodeOpen(false)}
        onAdd={handleAddNodeDirectly}
      />

      <AddParallelModal
        isOpen={isAddParallelOpen}
        onClose={() => setIsAddParallelOpen(false)}
        onAdd={addParallelEquipment}
      />

      <CompositeModal
        isOpen={isSubprocessOpen}
        onClose={() => {
          setIsSubprocessOpen(false);
          setSubprocessParent(null);
        }}
        parentNode={subprocessParent}
        compositeProcess={selectedCompositeProcess}
        onUpdateSubprocess={updateCompositeProcessGraph}
      />

      {/* Toast Notification Bar */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}
