"use client";

import * as React from "react";
import { AppSidebar, useSidebarCollapsed } from "@/components/AppSidebar";
import { SettingsDrawer } from "@/components/SettingsDrawer";
import { useProviders } from "@/components/providers-context";
import { RetainedStateProvider } from "@/components/retained-state";

const SettingsOpenContext = React.createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null);

export function useSettingsOpen() {
  const v = React.useContext(SettingsOpenContext);
  if (!v) throw new Error("useSettingsOpen must be used within AppShell");
  return v;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const { providers, modelsCache, fetchModels, save: saveProviders } = useProviders();

  return (
    <SettingsOpenContext.Provider value={{ open: settingsOpen, setOpen: setSettingsOpen }}>
      <RetainedStateProvider>
        <div className="flex min-h-screen w-full bg-zinc-50 dark:bg-zinc-950">
          <AppSidebar collapsed={collapsed} setCollapsed={setCollapsed} />
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Mobile top bar */}
            <div className="flex h-12 items-center gap-2 border-b border-zinc-200 bg-white px-3 md:hidden dark:border-zinc-800 dark:bg-zinc-950">
              <button
                type="button"
                aria-label="Open navigation"
                onClick={() => window.dispatchEvent(new Event("open-mobile-sidebar"))}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800"
              >
                ☰
              </button>
              <span className="text-sm font-semibold">Image Prompt</span>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="ml-auto text-xs text-zinc-500"
              >
                Providers
              </button>
            </div>
            <div className="flex-1 min-w-0">{children}</div>
          </div>
        </div>
        <SettingsDrawer
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          providers={providers}
          onSaveProviders={saveProviders}
          modelsCache={modelsCache}
          onRefreshModels={fetchModels}
        />
      </RetainedStateProvider>
    </SettingsOpenContext.Provider>
  );
}
