"use client";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { TaskStatus } from "@/db/schema";
import { STATUS_LABEL, STATUS_ORDER, checkTransition } from "@/lib/tasks/transitions";
import { cn } from "@/lib/utils";
import { moveTask, reorderColumn } from "@/server/actions/tasks";
import { BlockReasonDialog } from "./block-reason-dialog";
import { TaskCard } from "./task-card";
import type { BoardCard } from "./types";

type Columns = Record<TaskStatus, BoardCard[]>;

function group(cards: BoardCard[]): Columns {
  const cols = Object.fromEntries(STATUS_ORDER.map((s) => [s, [] as BoardCard[]])) as Columns;
  for (const c of cards) cols[c.status].push(c);
  for (const s of STATUS_ORDER) cols[s].sort((a, b) => a.position - b.position || a.number - b.number);
  return cols;
}

export function Kanban({ cards, slug, workspaceId, role, showSubtasks }: { cards: BoardCard[]; slug: string; workspaceId: string; role: "owner" | "dev"; showSubtasks: boolean }) {
  const router = useRouter();
  const visible = useMemo(() => (showSubtasks ? cards : cards.filter((c) => !c.parent)), [cards, showSubtasks]);
  // Local, optimistic column state; re-derived whenever the server sends new cards.
  const [state, setState] = useState<{ source: BoardCard[]; cols: Columns }>(() => ({ source: visible, cols: group(visible) }));
  const cols = state.source === visible ? state.cols : group(visible);
  const setCols = (next: Columns | ((prev: Columns) => Columns)) =>
    setState((prev) => {
      const base = prev.source === visible ? prev.cols : group(visible);
      return { source: visible, cols: typeof next === "function" ? next(base) : next };
    });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingBlock, setPendingBlock] = useState<{ card: BoardCard; index: number; snapshot: Columns } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findColumn = (id: string, c: Columns = cols): TaskStatus | null => {
    if (STATUS_ORDER.includes(id as TaskStatus)) return id as TaskStatus;
    for (const s of STATUS_ORDER) if (c[s].some((k) => k.id === id)) return s;
    return null;
  };
  const activeCard = activeId ? cards.find((c) => c.id === activeId) ?? null : null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const from = findColumn(String(active.id));
    const to = findColumn(String(over.id));
    if (!from || !to || from === to) return;
    setCols((prev) => {
      const moving = prev[from].find((c) => c.id === active.id);
      if (!moving) return prev;
      const next = { ...prev, [from]: prev[from].filter((c) => c.id !== active.id) };
      const overIndex = prev[to].findIndex((c) => c.id === over.id);
      const insertAt = overIndex >= 0 ? overIndex : prev[to].length;
      const target = [...prev[to]];
      target.splice(insertAt, 0, moving);
      next[to] = target;
      return next;
    });
  };

  const commit = async (card: BoardCard, to: TaskStatus, index: number, snapshot: Columns, order: string[], reason?: string) => {
    const res = await moveTask(card.id, { status: to, position: index, blockedReason: reason });
    if (!res.ok) {
      toast.error(res.error);
      setCols(snapshot);
      return;
    }
    if (!order.includes(card.id)) order.splice(index, 0, card.id);
    await reorderColumn(workspaceId, order);
    router.refresh();
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const card = cards.find((c) => c.id === active.id);
    if (!card) return;
    const from = card.status; // persisted status
    const to = findColumn(String(over.id)) ?? from;
    const snapshot = group(visible);

    let nextCols = cols;
    const list = cols[to];
    const oldIndex = list.findIndex((c) => c.id === active.id);
    const newIndex = list.findIndex((c) => c.id === over.id);
    if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
      nextCols = { ...cols, [to]: arrayMove(list, oldIndex, newIndex) };
      setCols(nextCols);
    }
    const index = Math.max(0, nextCols[to].findIndex((c) => c.id === active.id));
    const order = nextCols[to].map((c) => c.id);

    if (to !== from) {
      const check = checkTransition({ from, to, role, blockedReason: to === "blocked" ? "pending" : undefined });
      if (!check.ok) {
        toast.error(check.reason);
        setCols(snapshot);
        return;
      }
      if (to === "blocked") {
        setPendingBlock({ card, index, snapshot });
        return;
      }
    } else if (oldIndex === newIndex) {
      return;
    }
    await commit(card, to, index, snapshot, order);
  };

  return (
    <>
      <DndContext
        id="board-dnd"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setCols(group(visible));
        }}
      >
        <div className="grid gap-3 grid-cols-[repeat(5,minmax(220px,1fr))] overflow-x-auto pb-4 -mx-5 px-5">
          {STATUS_ORDER.map((status) => (
            <Column key={status} status={status} cards={cols[status]} slug={slug} role={role} />
          ))}
        </div>
        <DragOverlay>{activeCard ? <TaskCard card={activeCard} slug={slug} dragging /> : null}</DragOverlay>
      </DndContext>
      <BlockReasonDialog
        open={!!pendingBlock}
        taskLabel={pendingBlock ? `T-${pendingBlock.card.number}` : ""}
        onCancel={() => {
          if (pendingBlock) setCols(pendingBlock.snapshot);
          setPendingBlock(null);
        }}
        onConfirm={async (reason) => {
          const p = pendingBlock;
          setPendingBlock(null);
          if (p) await commit(p.card, "blocked", p.index, p.snapshot, cols.blocked.map((c) => c.id), reason);
        }}
      />
    </>
  );
}

function Column({ status, cards, slug, role }: { status: TaskStatus; cards: BoardCard[]; slug: string; role: "owner" | "dev" }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const locked = status === "done" && role !== "owner";
  return (
    <div ref={setNodeRef} className={cn("flex flex-col rounded-lg bg-muted/40 border border-transparent min-h-[60vh]", isOver && "border-foreground/20 bg-muted/70")}>
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          {STATUS_LABEL[status]}
          <span className="text-[11px] font-normal">{cards.length}</span>
        </div>
        {locked ? <span className="text-[10px] text-muted-foreground" title="Only the owner can move tasks here">owner only</span> : null}
      </div>
      <SortableContext id={status} items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 flex flex-col gap-2 px-2 pb-2">
          {cards.map((c) => (
            <SortableCard key={c.id} card={c} slug={slug} />
          ))}
          {cards.length === 0 ? <div className="text-xs text-muted-foreground/70 text-center py-6">Drop here</div> : null}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableCard({ card, slug }: { card: BoardCard; slug: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn("touch-none cursor-grab active:cursor-grabbing", isDragging && "opacity-40")}
    >
      <TaskCard card={card} slug={slug} />
    </div>
  );
}
