'use client';

/**
 * Custom drag-time connection line for the workflow canvas.
 *
 * ReactFlow's default connection line is a single grey curve with no clue
 * whether the drop target is legal. The "Filter can only have 1 input" toast
 * came from the user releasing into a saturated port. This component
 * pre-evaluates the same `isValidConnection` predicate during the drag and
 * colours the line green / red so the user knows before they let go.
 *
 * Used via `connectionLineComponent` prop on <ReactFlow>.
 */
import { useMemo } from 'react';
import { ConnectionLineComponentProps, getSmoothStepPath, Position, useStore, type Edge, type Node } from 'reactflow';

interface Props extends ConnectionLineComponentProps {
  isValid?: (sourceId: string, targetId: string) => boolean;
}

/** Build a smooth step path for the live drag, with a fallback to bezier. */
function buildPath({ fromX, fromY, toX, toY }: { fromX: number; fromY: number; toX: number; toY: number }) {
  const [path] = getSmoothStepPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: Position.Right,
    targetX: toX,
    targetY: toY,
    targetPosition: Position.Left,
    borderRadius: 12,
  });
  return path;
}

export default function CustomConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  fromNode,
  isValid,
}: Props) {
  // ReactFlow doesn't tell the connection-line component which node the
  // cursor is over; we read the live node positions from the store and
  // hit-test ourselves. Cheap (≈ N nodes, dragged frame already paints).
  const nodes = useStore((s) => s.nodeInternals);
  const edges = useStore((s) => s.edges as Edge[]);

  const hoverTarget = useMemo<Node | null>(() => {
    let best: Node | null = null;
    for (const n of nodes.values()) {
      if (!n.positionAbsolute) continue;
      const w = n.width ?? 220;
      const h = n.height ?? 80;
      const x = n.positionAbsolute.x;
      const y = n.positionAbsolute.y;
      if (toX >= x && toX <= x + w && toY >= y && toY <= y + h) {
        best = n as Node;
        break;
      }
    }
    return best;
  }, [nodes, toX, toY]);

  const validity = useMemo<'valid' | 'invalid' | 'idle'>(() => {
    if (!hoverTarget || !fromNode) return 'idle';
    if (hoverTarget.id === fromNode.id) return 'invalid'; // no self-loop
    const dup = edges.some((e) => e.source === fromNode.id && e.target === hoverTarget.id);
    if (dup) return 'invalid';
    if (isValid && !isValid(fromNode.id, hoverTarget.id)) return 'invalid';
    return 'valid';
  }, [hoverTarget, fromNode, edges, isValid]);

  const stroke =
    validity === 'valid' ? '#10b981' :
    validity === 'invalid' ? '#ef4444' :
    '#94a3b8';
  const label =
    validity === 'valid' ? 'Release to connect' :
    validity === 'invalid' ? 'Can’t connect here' :
    null;

  const path = buildPath({ fromX, fromY, toX, toY });

  return (
    <g>
      {/* Glow halo for the line — wider, low opacity, same colour */}
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={10}
        strokeOpacity={0.18}
        strokeLinecap="round"
      />
      {/* Main line */}
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={2.5}
        strokeDasharray={validity === 'invalid' ? '6 4' : undefined}
        strokeLinecap="round"
        style={{ filter: validity === 'valid' ? 'drop-shadow(0 0 6px rgba(16,185,129,0.5))' : undefined }}
      />
      {/* Tip dot */}
      <circle cx={toX} cy={toY} r={4} fill={stroke} stroke="white" strokeWidth={1.5} />
      {/* Floating label near the cursor — only when over a node */}
      {label && (
        <foreignObject x={toX + 12} y={toY - 28} width={160} height={24} style={{ overflow: 'visible' }}>
          <div
            // eslint-disable-next-line react/no-unknown-property
            xmlns="http://www.w3.org/1999/xhtml"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 600,
              color: 'white',
              background: stroke,
              boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {validity === 'invalid' ? '⛔' : '✓'} {label}
          </div>
        </foreignObject>
      )}
    </g>
  );
}
