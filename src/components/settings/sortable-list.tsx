"use client";

import { useId, useState, useTransition } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/common/chips";
import type { ActionResult } from "@/server/result";

export type SortableItem = { id: string; name: string; is_active: boolean };

/**
 * Editable list: add, rename inline (Enter or blur saves, Esc cancels), drag to reorder
 * (keyboard: focus the handle, Space, arrows, Space), and a Hide/Show toggle.
 */
export function SortableList({
  title,
  singular,
  items: initial,
  onAdd,
  onRename,
  onToggle,
  onReorder,
}: {
  title: string;
  singular: string;
  items: SortableItem[];
  onAdd: (name: string) => Promise<ActionResult<{ id: string }>>;
  onRename: (id: string, name: string) => Promise<ActionResult>;
  onToggle: (id: string, active: boolean) => Promise<ActionResult>;
  onReorder: (ids: string[]) => Promise<ActionResult>;
}) {
  const [items, setItems] = useState(initial);
  const [synced, setSynced] = useState(initial);
  // Server refresh replaces local state (after revalidation).
  if (synced !== initial) {
    setSynced(initial);
    setItems(initial);
  }
  const dndId = useId();
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const before = items;
    const next = arrayMove(items, items.findIndex((i) => i.id === active.id), items.findIndex((i) => i.id === over.id));
    setItems(next);
    startTransition(async () => {
      const res = await onReorder(next.map((i) => i.id));
      if (!res.ok) {
        setItems(before);
        toast.error(res.error);
      }
    });
  };

  const addId = `add-${singular.replace(/\s+/g, "-")}`;
  return (
    <section className="rounded-lg border border-line bg-surface" aria-label={title}>
      <h2 className="border-b border-line px-4 py-3 text-section text-ink">{title}</h2>
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <Row
                key={item.id}
                item={item}
                onRename={async (name) => {
                  const before = items;
                  setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, name } : x)));
                  const res = await onRename(item.id, name);
                  if (!res.ok) {
                    setItems(before);
                    toast.error(res.fieldErrors?.name ?? res.error);
                  } else {
                    toast.success("Name saved");
                  }
                }}
                onToggle={() =>
                  startTransition(async () => {
                    const active = !item.is_active;
                    setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, is_active: active } : x)));
                    const res = await onToggle(item.id, active);
                    if (!res.ok) {
                      setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, is_active: !active } : x)));
                      toast.error(res.error);
                    } else {
                      toast.success(active ? `${item.name} shown` : `${item.name} hidden`);
                    }
                  })
                }
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <form
        className="flex items-start gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (!name) {
            setAddError("Enter a name.");
            return;
          }
          startTransition(async () => {
            const res = await onAdd(name);
            if (!res.ok) {
              setAddError(res.fieldErrors?.name ?? res.error);
              return;
            }
            setItems((xs) => [...xs, { id: res.data.id, name, is_active: true }]);
            setNewName("");
            setAddError(null);
            toast.success(`${name} added`);
          });
        }}
      >
        <div className="flex-1">
          <label htmlFor={addId} className="sr-only">
            New {singular}
          </label>
          <Input
            id={addId}
            value={newName}
            placeholder={`New ${singular}`}
            aria-invalid={!!addError}
            onChange={(e) => {
              setNewName(e.target.value);
              setAddError(null);
            }}
          />
          {addError && <p className="mt-1 text-small text-bad">{addError}</p>}
        </div>
        <Button type="submit" variant="secondary" size="form" disabled={pending}>
          Add {singular}
        </Button>
      </form>
    </section>
  );
}

function Row({
  item,
  onRename,
  onToggle,
}: {
  item: SortableItem;
  onRename: (name: string) => Promise<void>;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const [draft, setDraft] = useState(item.name);
  const [lastName, setLastName] = useState(item.name);
  if (lastName !== item.name) {
    setLastName(item.name);
    setDraft(item.name);
  }

  const commit = () => {
    const name = draft.trim();
    if (!name) {
      setDraft(item.name);
      return;
    }
    if (name !== item.name) void onRename(name);
  };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined, transition }}
      className={cn("flex items-center gap-2 bg-surface px-2 py-1.5", isDragging && "relative z-10 shadow-overlay")}
      data-testid={`list-item-${item.name}`}
    >
      <button
        type="button"
        className="flex size-7 cursor-grab items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink"
        aria-label={`Reorder ${item.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <Input
        aria-label={`Name of ${item.name}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(item.name);
            e.currentTarget.blur();
          }
        }}
        className={cn("h-8 border-transparent bg-transparent hover:border-line focus-visible:bg-surface", !item.is_active && "text-ink-muted")}
      />
      {!item.is_active && <Chip>Hidden</Chip>}
      <Button type="button" variant="ghost" size="sm" onClick={onToggle} aria-label={`${item.is_active ? "Hide" : "Show"} ${item.name}`}>
        {item.is_active ? "Hide" : "Show"}
      </Button>
    </li>
  );
}
