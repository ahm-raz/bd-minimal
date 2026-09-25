"use client";

import { SortableList } from "@/components/settings/sortable-list";
import { LIST_LABELS } from "@/lib/validation/settings";
import { addListItem, renameListItem, reorderList, setListItemActive } from "@/server/actions/settings";
import type { ListItem } from "@/server/queries/lists";

/** Content pillars (docs/09 section 2): a label list like niches. */
export function PillarsEditor({ pillars }: { pillars: ListItem[] }) {
  const table = "content_pillars" as const;
  return (
    <>
      <p className="prose-width mb-4 text-small text-ink-muted">
        The themes posts are about. Hidden pillars disappear from dropdowns but stay on old posts and in reports.
      </p>
      <div className="max-w-xl">
        <SortableList
          title={LIST_LABELS[table].title}
          singular={LIST_LABELS[table].singular}
          items={pillars}
          onAdd={(name) => addListItem({ table, name })}
          onRename={(id, name) => renameListItem({ table, id, name })}
          onToggle={(id, active) => setListItemActive({ table, id, active })}
          onReorder={(ids) => reorderList({ table, ids })}
        />
      </div>
    </>
  );
}
