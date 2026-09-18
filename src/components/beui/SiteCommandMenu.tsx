"use client";
// Renders BEUI's CommandPalette as a client-only island (no SSR, so it never
// pulls in Astro's `astro:jsx` SSR virtual module). The header trigger button
// lives in CommandMenu.astro as plain SSR HTML and opens this palette by
// dispatching a `open-site-command-menu` window event.
//
// The ⌘K / Ctrl+K shortcut is deliberately NOT handled here: CommandPalette
// already owns it internally and toggles the same `open` state, so a second
// listener would just race the palette's own handler for no gain.

import { useEffect, useState } from "react";
import { CommandPalette, type CommandItem } from "./command-palette";
import {
  Home,
  FileText,
  Tags,
  Archive,
  User,
  BookOpen,
  Newspaper,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  id: string;
  label: string;
  group: string;
  href: string;
  icon: string;
};

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  posts: FileText,
  tags: Tags,
  archive: Archive,
  about: User,
  column: BookOpen,
  recent: Newspaper,
};

export interface SiteCommandMenuProps {
  nav?: NavItem[];
  recent?: { label: string; href: string }[];
  /** Group heading for the latest posts (localised upstream). */
  recentGroup?: string;
  placeholder?: string;
  emptyMessage?: string;
}

export function SiteCommandMenu({
  nav = [],
  recent = [],
  recentGroup = "Recent",
  placeholder,
  emptyMessage,
}: SiteCommandMenuProps) {
  const [open, setOpen] = useState(false);

  // Route through a temporary anchor instead of assigning `location.href`: the
  // site runs Astro's ClientRouter, which intercepts clicks on same-origin
  // links, so a synthesised click keeps the soft navigation (and its view
  // transition). A bare `location.href` reloads the whole document.
  const go = (href: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.style.display = "none";
    document.body.append(a);
    a.click();
    a.remove();
  };

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("open-site-command-menu", onOpen);
    return () => {
      window.removeEventListener("open-site-command-menu", onOpen);
    };
  }, []);

  const items: CommandItem[] = [
    ...nav.map((n) => ({
      id: n.id,
      label: n.label,
      group: n.group,
      icon: ICONS[n.icon] ?? ICONS.posts,
      onSelect: () => go(n.href),
    })),
    ...recent.map((r, i) => ({
      id: `recent-${i}`,
      label: r.label,
      group: recentGroup,
      icon: ICONS.recent,
      onSelect: () => go(r.href),
    })),
  ];

  return (
    <CommandPalette
      items={items}
      open={open}
      onOpenChange={setOpen}
      placeholder={placeholder}
      emptyMessage={emptyMessage}
    />
  );
}
