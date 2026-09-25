"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Columns3, FileText, ListChecks, Plus, Search, User } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { useApp } from "./app-provider";
import { useProfile } from "./profile-provider";
import { searchEverything, type SearchResults } from "@/server/actions/search";

const EMPTY: SearchResults = { leads: [], contacts: [], opportunities: [] };

const PAGES = [
  { href: "/my-day", label: "My Day", founderOnly: false },
  { href: "/leads", label: "Leads", founderOnly: false },
  { href: "/pipeline", label: "Pipeline", founderOnly: false },
  { href: "/tasks", label: "Tasks", founderOnly: false },
  { href: "/feed", label: "Feed", founderOnly: true },
  { href: "/performance", label: "Performance", founderOnly: false },
  { href: "/team", label: "Team", founderOnly: true },
  { href: "/settings", label: "Settings", founderOnly: true },
  { href: "/profile", label: "Profile", founderOnly: false },
];

/** Ctrl/Cmd+K: search leads, contacts and opportunities, plus actions and pages (docs/07 section 14). */
export function CommandMenu() {
  const router = useRouter();
  const { openNewLead, openLogActivity } = useApp();
  const { role } = useProfile();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [pickLead, setPickLead] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      void searchEverything({ q }).then((r) => live && r.ok && setResults(r.data));
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  const close = () => {
    setOpen(false);
    setQ("");
    setResults(EMPTY);
    setPickLead(false);
  };
  const go = (href: string) => {
    close();
    router.push(href);
  };
  const searching = q.trim().length >= 2;
  const shown = searching ? results : EMPTY;
  const needle = q.trim().toLowerCase();
  const match = (label: string) => !needle || label.toLowerCase().includes(needle);

  const actions = [
    { label: "New lead", icon: Plus, shortcut: "N", run: () => (close(), openNewLead()) },
    {
      label: "Log activity",
      icon: FileText,
      shortcut: "L",
      run: () => {
        setPickLead(true);
        setQ("");
      },
    },
    ...(role === "founder" ? [{ label: "New task", icon: ListChecks, shortcut: "T", run: () => go("/tasks?new=1") }] : []),
  ].filter((a) => match(a.label));
  const pages = PAGES.filter((p) => (!p.founderOnly || role === "founder") && match(`Go to ${p.label}`));

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => (o ? setOpen(true) : close())}
      title="Command menu"
      description="Search leads, contacts and opportunities, or run an action."
    >
      <Command shouldFilter={false}>
        <CommandInput
          // remount (and autofocus) when switching to "which lead?", so typing continues in the box
          key={pickLead ? "pick-lead" : "search"}
          autoFocus
          placeholder={pickLead ? "Which lead? Type a company name" : "Search leads, contacts, opportunities, or type a command"}
          value={q}
          onValueChange={setQ}
        />
        <CommandList>
          <CommandEmpty>{searching ? "No matches. Try a company, contact name or email." : "Type at least 2 letters to search."}</CommandEmpty>
          {!pickLead && actions.length > 0 && (
            <CommandGroup heading="Actions">
              {actions.map((a) => (
                <CommandItem key={a.label} value={`action ${a.label}`} onSelect={a.run}>
                  <a.icon aria-hidden /> {a.label}
                  <CommandShortcut>{a.shortcut}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {shown.leads.length > 0 && (
            <CommandGroup heading="Leads">
              {shown.leads.map((l) => (
                <CommandItem
                  key={l.id}
                  value={`lead ${l.id}`}
                  onSelect={() => {
                    if (pickLead) {
                      close();
                      openLogActivity({ leadId: l.id });
                    } else go(`/leads/${l.id}`);
                  }}
                >
                  <Building2 aria-hidden /> {l.label}
                  {l.hint && <span className="ml-auto text-small text-ink-muted">{l.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {shown.contacts.length > 0 && (
            <CommandGroup heading="Contacts">
              {shown.contacts.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`contact ${c.id}`}
                  onSelect={() => {
                    if (pickLead) {
                      close();
                      openLogActivity({ leadId: c.leadId, contactId: c.id });
                    } else go(`/leads/${c.leadId}`);
                  }}
                >
                  <User aria-hidden /> {c.label}
                  <span className="ml-auto truncate text-small text-ink-muted">{c.hint}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!pickLead && shown.opportunities.length > 0 && (
            <CommandGroup heading="Opportunities">
              {shown.opportunities.map((o) => (
                <CommandItem key={o.id} value={`opp ${o.id}`} onSelect={() => go(`/leads/${o.leadId}`)}>
                  <Columns3 aria-hidden /> {o.label}
                  <span className="ml-auto text-small text-ink-muted">{o.hint}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!pickLead && pages.length > 0 && (
            <CommandGroup heading="Go to">
              {pages.map((p) => (
                <CommandItem key={p.href} value={`page ${p.href}`} onSelect={() => go(p.href)}>
                  <Search aria-hidden /> {p.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
