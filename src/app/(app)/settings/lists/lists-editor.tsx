"use client";

import { SortableList } from "@/components/settings/sortable-list";
import { LIST_LABELS, type ListTable } from "@/lib/validation/settings";
import { addListItem, renameListItem, reorderList, setListItemActive } from "@/server/actions/settings";
import type { ListItem } from "@/server/queries/lists";

export function ListsEditor(props: {
  niches: ListItem[];
  channels: ListItem[];
  sources: ListItem[];
  lostReasons: ListItem[];
}) {
  const sets: [ListTable, ListItem[]][] = [
    ["niches", props.niches],
    ["channels", props.channels],
    ["lead_sources", props.sources],
    ["lost_reasons", props.lostReasons],
  ];
  return (
    <>
      <p className="prose-width mb-4 text-small text-ink-muted">
        Hidden items disappear from dropdowns but stay on old records and in reports.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        {sets.map(([table, items]) => (
          <SortableList
            key={table}
            title={LIST_LABELS[table].title}
            singular={LIST_LABELS[table].singular}
            items={items}
            onAdd={(name) => addListItem({ table, name })}
            onRename={(id, name) => renameListItem({ table, id, name })}
            onToggle={(id, active) => setListItemActive({ table, id, active })}
            onReorder={(ids) => reorderList({ table, ids })}
          />
        ))}
      </div>
    </>
  );
}
