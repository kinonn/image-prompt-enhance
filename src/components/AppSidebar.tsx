"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Moon, Sun, Settings } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, NAV_SETTINGS_ITEM } from "@/lib/nav";

const STORAGE_KEY = "sidebar-collapsed";

interface AppSidebarProps {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

export function AppSidebar({ collapsed, setCollapsed }: AppSidebarProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {}
  };

  const widthClass = collapsed ? "w-[64px]" : "w-[240px]";

  const NavLink = ({ href, label, icon: Icon, match }: { href: string; label: string; icon: React.ElementType; match: (p: string) => boolean }) => {
    const active = match(pathname);
    return (
      <Link
        href={href}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
          collapsed && "justify-center px-2"
        )}
        title={collapsed ? label : undefined}
      >
        <Icon className="h-4.5 w-4.5 shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    );
  };

  const inner = (
    <div className="flex h-full flex-col">
      {/* Brand + collapse */}
      <div className={cn("flex h-[64px] items-center gap-2 border-b border-zinc-200 px-3 dark:border-zinc-800", collapsed && "justify-center px-2")}>
        {!collapsed && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shrink-0">
            <span className="text-[11px] font-bold tracking-tight">IP</span>
          </div>
        )}
        {!collapsed && <span className="text-sm font-semibold truncate">Image Prompt</span>}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} match={item.match} />
        ))}
      </nav>

      <div className="border-t border-zinc-200 p-2 dark:border-zinc-800 space-y-1">
        {/* Settings page */}
        <Link
          href={NAV_SETTINGS_ITEM.href}
          onClick={() => setMobileOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors",
            NAV_SETTINGS_ITEM.match(pathname)
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
            collapsed && "justify-center px-2"
          )}
          title={collapsed ? NAV_SETTINGS_ITEM.label : undefined}
        >
          <Settings className="h-4.5 w-4.5 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>

        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
            collapsed && "justify-center px-2"
          )}
          title={collapsed ? "Theme" : undefined}
        >
          {mounted ? (
            <>
              <Sun className="h-4.5 w-4.5 shrink-0 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4.5 w-4.5 shrink-0 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </>
          ) : (
            <Sun className="h-4.5 w-4.5 shrink-0" />
          )}
          {!collapsed && <span>Theme</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside
        className={cn(
          "hidden md:flex shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 transition-[width] duration-200 sticky top-0 h-screen",
          widthClass
        )}
        aria-label="Sidebar"
      >
        {inner}
      </aside>

      {/* Mobile: hamburger handled by layout header; overlay sheet */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[280px] bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 shadow-xl">
            {inner}
          </div>
        </div>
      )}

      {/* Expose mobile toggle via custom event so header can open it without prop drilling */}
      <span className="hidden" data-mobile-open={mobileOpen ? "1" : "0"} />
      {/* Provide a global opener for mobile — header button dispatches this event */}
      <MobileOpenerBridge setMobileOpen={setMobileOpen} />
    </>
  );
}

function MobileOpenerBridge({ setMobileOpen }: { setMobileOpen: (v: boolean) => void }) {
  React.useEffect(() => {
    const h = () => setMobileOpen(true);
    window.addEventListener("open-mobile-sidebar", h);
    return () => window.removeEventListener("open-mobile-sidebar", h);
  }, [setMobileOpen]);
  return null;
}

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = React.useState(false);
  React.useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "1") setCollapsed(true);
    } catch {}
  }, []);
  return [collapsed, setCollapsed] as const;
}
