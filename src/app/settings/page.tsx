"use client";

import * as React from "react";
import { Settings, Plus, Trash2, TestTube, Eye, EyeOff, Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProviders } from "@/components/providers-context";
import { useSettingsOpen } from "@/components/AppShell";
import type { Provider } from "@/lib/providers";
import { toast } from "sonner";

export default function SettingsPage() {
  const { providers, modelsCache, fetchModels, save } = useProviders();
  const { setOpen } = useSettingsOpen();
  const [editing, setEditing] = React.useState<Provider | null>(null);
  const [isNew, setIsNew] = React.useState(false);
  const [showKey, setShowKey] = React.useState(false);
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [testResult, setTestResult] = React.useState<Record<string, { ok: boolean; msg: string }>>({});

  const emptyProvider = (): Provider => ({
    id: `custom-${Date.now()}`,
    name: "",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    type: "openai-compatible",
  });

  const handleSave = () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.baseUrl.trim()) {
      toast.error("Name and Base URL are required");
      return;
    }
    try {
      new URL(editing.baseUrl);
    } catch {
      toast.error("Base URL must be a valid URL");
      return;
    }
    const next = isNew ? [...providers, editing] : providers.map((p) => (p.id === editing.id ? editing : p));
    save(next);
    setEditing(null);
    toast.success(isNew ? "Provider added" : "Provider updated");
  };

  const handleDelete = (id: string) => {
    if (providers.length === 1) {
      toast.error("Keep at least one provider");
      return;
    }
    save(providers.filter((p) => p.id !== id));
    toast.success("Provider removed");
  };

  const handleTest = async (p: Provider) => {
    setTestingId(p.id);
    setTestResult((prev) => ({ ...prev, [p.id]: { ok: false, msg: "Testing..." } }));
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: p.baseUrl, apiKey: p.apiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const count = data.models?.length ?? 0;
      setTestResult((prev) => ({ ...prev, [p.id]: { ok: true, msg: `Connected — ${count} models` } }));
      await fetchModels(p);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestResult((prev) => ({ ...prev, [p.id]: { ok: false, msg } }));
    } finally {
      setTestingId(null);
    }
  };

  if (editing) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>← Back</Button>
        <h2 className="text-sm font-semibold">{isNew ? "Add provider" : "Edit provider"}</h2>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">Display name *</Label>
            <Input id="p-name" placeholder="e.g., OpenCode Go, OpenAI" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-url">Base URL *</Label>
            <Input id="p-url" placeholder="https://opencode.ai/zen/go/v1" value={editing.baseUrl} onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-key">API Key</Label>
            <div className="relative">
              <Input id="p-key" type={showKey ? "text" : "password"} placeholder="sk-... or leave empty for local models" value={editing.apiKey} onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })} className="pr-10" />
              <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
                {showKey ? <EyeOff className="h-4 w-4 text-zinc-500" /> : <Eye className="h-4 w-4 text-zinc-500" />}
              </button>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave}>{isNew ? "Add provider" : "Save changes"}</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5" />
        <h1 className="text-lg font-semibold">Settings</h1>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setOpen(true)}>Open providers dialog</Button>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Image &amp; refine models are chosen inline — at the bottom of the image box and under the Refine box. Manage providers here.
      </p>

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Configured providers</p>
        <Button size="sm" onClick={() => { setEditing(emptyProvider()); setIsNew(true); setShowKey(false); }}>
          <Plus className="h-4 w-4" /> Add provider
        </Button>
      </div>

      <div className="space-y-3">
        {providers.map((p) => (
          <Card key={p.id} className="overflow-hidden">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-sm font-semibold truncate">{p.name || "Unnamed"}</CardTitle>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate flex items-center gap-1.5 mt-1">
                    <span className="truncate">{p.baseUrl}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">openai-compatible</Badge>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1 font-mono">Key: {p.apiKey ? "••••••••" + p.apiKey.slice(-4) : "— not set —"}</p>
                  {testResult[p.id] && (
                    <p className={`text-xs mt-1.5 flex items-center gap-1 ${testResult[p.id].ok ? "text-green-600" : "text-red-500"}`}>
                      {testResult[p.id].ok ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}{testResult[p.id].msg}
                    </p>
                  )}
                  {modelsCache[p.id]?.length ? <p className="text-xs text-zinc-500 mt-1">{modelsCache[p.id].length} models cached</p> : null}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => handleTest(p)} disabled={testingId === p.id} className="h-8 px-2.5">
                    {testingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />} Test
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setEditing({ ...p }); setIsNew(false); setShowKey(false); }} className="h-8 px-2.5">Edit</Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)} className="h-8 w-8 text-red-500 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
        <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
          <strong>Tip:</strong> Default is <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-900/50 rounded">OpenCode Go</code> at <code className="break-all">https://opencode.ai/zen/go/v1</code>.
        </p>
      </div>
    </div>
  );
}
