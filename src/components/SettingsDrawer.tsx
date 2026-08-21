"use client";

import * as React from "react";
import { Settings, Plus, Trash2, TestTube, Eye, EyeOff, Loader2, Check, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { Provider, Model } from "@/lib/providers";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface SettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers: Provider[];
  onSaveProviders: (providers: Provider[]) => void;
  modelsCache: Record<string, Model[]>;
  onRefreshModels: (provider: Provider) => Promise<void>;
  loadingModelsFor?: string | null;
  selectedProviderId: string;
  onSelectProvider: (id: string) => void;
  selectedModel: string;
  onSelectModel: (id: string) => void;
}

export function SettingsDrawer({
  open,
  onOpenChange,
  providers,
  onSaveProviders,
  modelsCache,
  onRefreshModels,
  loadingModelsFor,
  selectedProviderId,
  onSelectProvider,
  selectedModel,
  onSelectModel,
}: SettingsDrawerProps) {
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

  const handleAdd = () => {
    setEditing(emptyProvider());
    setIsNew(true);
    setShowKey(false);
  };

  const handleEdit = (p: Provider) => {
    setEditing({ ...p });
    setIsNew(false);
    setShowKey(false);
  };

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

    let next: Provider[];
    if (isNew) {
      next = [...providers, editing];
    } else {
      next = providers.map((p) => (p.id === editing.id ? editing : p));
    }
    onSaveProviders(next);
    setEditing(null);
    toast.success(isNew ? "Provider added" : "Provider updated");
  };

  const handleDelete = (id: string) => {
    if (providers.length === 1) {
      toast.error("Keep at least one provider");
      return;
    }
    const next = providers.filter((p) => p.id !== id);
    onSaveProviders(next);
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
      // trigger refresh outside too
      await onRefreshModels(p);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestResult((prev) => ({ ...prev, [p.id]: { ok: false, msg } }));
    } finally {
      setTestingId(null);
    }
  };

  const selectedProvider = providers.find((p) => p.id === selectedProviderId);
  const selectedModels = modelsCache[selectedProviderId] || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Providers & Models
          </DialogTitle>
          <DialogDescription>Configure LLM providers. Keys are stored locally and proxied securely via Next.js.</DialogDescription>
        </DialogHeader>

        {!editing ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-200 p-4 space-y-3 dark:border-zinc-800">
              <p className="text-sm font-medium">Active provider &amp; model</p>

              <div className="space-y-1.5">
                <Label htmlFor="sel-provider">Provider</Label>
                <Select
                  id="sel-provider"
                  value={selectedProviderId}
                  onChange={(e) => onSelectProvider(e.target.value)}
                  className="w-full"
                  placeholder="Select provider"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {new URL(p.baseUrl).hostname}
                    </option>
                  ))}
                </Select>
                {selectedProvider && !selectedProvider.apiKey && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">No API key set for this provider — add one below.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sel-model">Model</Label>
                  <button
                    type="button"
                    onClick={() => selectedProvider && onRefreshModels(selectedProvider)}
                    disabled={!selectedProvider || !!loadingModelsFor}
                    className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-50"
                  >
                    {loadingModelsFor === selectedProviderId ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Refresh
                  </button>
                </div>
                <Select
                  id="sel-model"
                  value={selectedModel}
                  onChange={(e) => onSelectModel(e.target.value)}
                  placeholder={loadingModelsFor ? "Loading..." : "Select model"}
                  disabled={!selectedProvider || selectedModels.length === 0}
                >
                  {selectedModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.id}
                    </option>
                  ))}
                  {selectedModels.length === 0 && <option value="">No models — refresh or check provider</option>}
                </Select>
                {selectedProvider && loadingModelsFor === selectedProvider.id && (
                  <p className="text-xs text-zinc-500 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Fetching models from provider...
                  </p>
                )}
              </div>

              {selectedProvider && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  Using <span className="font-medium text-zinc-700 dark:text-zinc-300">{selectedProvider.name}</span> at{" "}
                  <span className="font-mono text-xs">{selectedProvider.baseUrl}</span>
                  {selectedModel ? ` • ${selectedModel}` : ""}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Configured providers</p>
              <Button size="sm" onClick={handleAdd}>
                <Plus className="h-4 w-4" /> Add provider
              </Button>
            </div>

            <div className="space-y-3 max-h-[420px] overflow-auto pr-1">
              {providers.map((p) => (
                <Card key={p.id} className="overflow-hidden">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-sm font-semibold truncate">{p.name || "Unnamed"}</CardTitle>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate flex items-center gap-1.5 mt-1">
                          <span className="truncate">{p.baseUrl}</span>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            openai-compatible
                          </Badge>
                        </p>
                        <p className="text-xs text-zinc-400 mt-1 font-mono">
                          Key: {p.apiKey ? "••••••••" + p.apiKey.slice(-4) : "— not set —"}
                        </p>
                        {testResult[p.id] && (
                          <p className={`text-xs mt-1.5 flex items-center gap-1 ${testResult[p.id].ok ? "text-green-600" : "text-red-500"}`}>
                            {testResult[p.id].ok ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                            {testResult[p.id].msg}
                          </p>
                        )}
                        {modelsCache[p.id]?.length ? (
                          <p className="text-xs text-zinc-500 mt-1">{modelsCache[p.id].length} models cached</p>
                        ) : null}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button variant="outline" size="sm" onClick={() => handleTest(p)} disabled={testingId === p.id} className="h-8 px-2.5">
                          {testingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
                          Test
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleEdit(p)} className="h-8 px-2.5">
                          Edit
                        </Button>
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
                <strong>Tip:</strong> Default is <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-900/50 rounded">OpenCode Go</code> at{" "}
                <code className="break-all">https://opencode.ai/zen/go/v1</code>. Models:{" "}
                <code className="break-all">https://opencode.ai/zen/go/v1/models</code>. For OpenCode Zen use{" "}
                <code>https://opencode.ai/zen/v1</code>. For OpenRouter{" "}
                <code>https://openrouter.ai/api/v1</code>, Ollama{" "}
                <code>http://localhost:11434/v1</code>.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                ← Back
              </Button>
              <span className="text-sm font-semibold">{isNew ? "Add provider" : "Edit provider"}</span>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="p-name">Display name *</Label>
                <Input
                  id="p-name"
                  placeholder="e.g., OpenCode Go, OpenCode Zen, OpenAI, Local Ollama"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="p-url">Base URL *</Label>
                <Input
                  id="p-url"
                  placeholder="https://opencode.ai/zen/go/v1"
                  value={editing.baseUrl}
                  onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })}
                />
                <p className="text-xs text-zinc-500">Must be OpenAI-compatible. No trailing slash needed.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="p-key">API Key</Label>
                <div className="relative">
                  <Input
                    id="p-key"
                    type={showKey ? "text" : "password"}
                    placeholder="sk-... or leave empty for local models"
                    value={editing.apiKey}
                    onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {showKey ? <EyeOff className="h-4 w-4 text-zinc-500" /> : <Eye className="h-4 w-4 text-zinc-500" />}
                  </button>
                </div>
                <p className="text-xs text-zinc-500">Stored in localStorage, sent via server proxy only.</p>
              </div>

              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  ID: <code className="font-mono text-xs">{editing.id}</code> • Type: openai-compatible
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button className="flex-1" onClick={handleSave}>
                  {isNew ? "Add provider" : "Save changes"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
