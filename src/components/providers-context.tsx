"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  loadProviders,
  saveProviders,
  getSelectedProviderId,
  setSelectedProviderId,
  getSelectedModelId,
  setSelectedModelId,
  getSelectedRefineProviderId,
  setSelectedRefineProviderId,
  getSelectedRefineModelId,
  setSelectedRefineModelId,
  getSelectedChatProviderId,
  setSelectedChatProviderId,
  getSelectedChatModelId,
  setSelectedChatModelId,
  getSelectedEffort,
  setSelectedEffort,
  getSelectedRefineEffort,
  setSelectedRefineEffort,
  getSelectedChatEffort,
  setSelectedChatEffort,
  getProviderById,
} from "@/lib/providers";
import type { Provider, Model } from "@/lib/providers";
import { isEffortSelection } from "@/lib/effort";
import type { EffortSelection } from "@/lib/effort";

interface ProvidersContextValue {
  providers: Provider[];
  setProviders: (p: Provider[]) => void;
  save: (next: Provider[]) => void;
  selectedProviderId: string;
  selectedModel: string;
  refineProviderId: string;
  refineModel: string;
  chatProviderId: string;
  chatModel: string;
  selectedEffort: EffortSelection;
  refineEffort: EffortSelection;
  chatEffort: EffortSelection;
  modelsCache: Record<string, Model[]>;
  loadingModelsFor: string | null;
  fetchModels: (provider: Provider) => Promise<void>;
  onSelectProvider: (id: string) => void;
  onSelectModel: (id: string) => void;
  onSelectRefineProvider: (id: string) => void;
  onSelectRefineModel: (id: string) => void;
  onSelectChatProvider: (id: string) => void;
  onSelectChatModel: (id: string) => void;
  onSelectEffort: (v: EffortSelection) => void;
  onSelectRefineEffort: (v: EffortSelection) => void;
  onSelectChatEffort: (v: EffortSelection) => void;
  selectedProvider: Provider | undefined;
  refineProvider: Provider | undefined;
  chatProvider: Provider | undefined;
}

const Ctx = React.createContext<ProvidersContextValue | null>(null);

export function ProvidersProvider({ children }: { children: React.ReactNode }) {
  const [providers, setProviders] = React.useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderIdState] = React.useState("");
  const [selectedModel, setSelectedModel] = React.useState("");
  const [refineProviderId, setRefineProviderIdState] = React.useState("");
  const [refineModel, setRefineModel] = React.useState("");
  const [chatProviderId, setChatProviderIdState] = React.useState("");
  const [chatModel, setChatModel] = React.useState("");
  const [selectedEffort, setSelectedEffortState] = React.useState<EffortSelection>("");
  const [refineEffort, setRefineEffort] = React.useState<EffortSelection>("");
  const [chatEffort, setChatEffort] = React.useState<EffortSelection>("");
  const [modelsCache, setModelsCache] = React.useState<Record<string, Model[]>>({});
  const [loadingModelsFor, setLoadingModelsFor] = React.useState<string | null>(null);

  const sanitizeEffort = (v: string | null): EffortSelection => (isEffortSelection(v) ? v : "");

  React.useEffect(() => {
    const p = loadProviders();
    setProviders(p);
    const selP = getSelectedProviderId() || p[0]?.id || "";
    setSelectedProviderIdState(selP);
    setSelectedModel(getSelectedModelId() || "");
    const selRP = getSelectedRefineProviderId() || selP;
    setRefineProviderIdState(selRP);
    setRefineModel(getSelectedRefineModelId() || "");
    const selCP = getSelectedChatProviderId() || selP;
    setChatProviderIdState(selCP);
    setChatModel(getSelectedChatModelId() || "");
    setSelectedEffortState(sanitizeEffort(getSelectedEffort()));
    setRefineEffort(sanitizeEffort(getSelectedRefineEffort()));
    setChatEffort(sanitizeEffort(getSelectedChatEffort()));
  }, []);

  const save = (next: Provider[]) => {
    setProviders(next);
    saveProviders(next);
    if (!next.find((p) => p.id === selectedProviderId)) {
      const fb = next[0]?.id || "";
      setSelectedProviderIdState(fb);
      setSelectedProviderId(fb);
      setSelectedModel("");
      setSelectedModelId("");
    }
    if (!next.find((p) => p.id === refineProviderId)) {
      const fb = next.find((p) => p.id === selectedProviderId)?.id || next[0]?.id || "";
      setRefineProviderIdState(fb);
      setSelectedRefineProviderId(fb);
      setRefineModel("");
      setSelectedRefineModelId("");
    }
    if (!next.find((p) => p.id === chatProviderId)) {
      const fb = next.find((p) => p.id === selectedProviderId)?.id || next[0]?.id || "";
      setChatProviderIdState(fb);
      setSelectedChatProviderId(fb);
      setChatModel("");
      setSelectedChatModelId("");
    }
  };

  const selectedProvider = getProviderById(providers, selectedProviderId);
  const refineProvider = getProviderById(providers, refineProviderId);
  const chatProvider = getProviderById(providers, chatProviderId);

  const fetchModels = React.useCallback(async (provider: Provider) => {
    setLoadingModelsFor(provider.id);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: provider.baseUrl, apiKey: provider.apiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch models");
      const models: Model[] = data.models || [];
      setModelsCache((prev) => ({ ...prev, [provider.id]: models }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to fetch models: ${msg}`);
    } finally {
      setLoadingModelsFor(null);
    }
  }, []);

  React.useEffect(() => {
    if (selectedProvider && !modelsCache[selectedProvider.id]) fetchModels(selectedProvider);
    if (refineProvider && !modelsCache[refineProvider.id]) fetchModels(refineProvider);
    if (chatProvider && !modelsCache[chatProvider.id]) fetchModels(chatProvider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProviderId, refineProviderId, chatProviderId]);

  const onSelectProvider = (id: string) => {
    setSelectedProviderIdState(id);
    setSelectedProviderId(id);
    if (!modelsCache[id]?.length) setSelectedModel("");
  };
  const onSelectModel = (id: string) => {
    setSelectedModel(id);
    setSelectedModelId(id);
  };
  const onSelectRefineProvider = (id: string) => {
    setRefineProviderIdState(id);
    setSelectedRefineProviderId(id);
    if (!modelsCache[id]?.length) setRefineModel("");
  };
  const onSelectRefineModel = (id: string) => {
    setRefineModel(id);
    setSelectedRefineModelId(id);
  };
  const onSelectChatProvider = (id: string) => {
    setChatProviderIdState(id);
    setSelectedChatProviderId(id);
    if (!modelsCache[id]?.length) setChatModel("");
  };
  const onSelectChatModel = (id: string) => {
    setChatModel(id);
    setSelectedChatModelId(id);
  };
  const onSelectEffort = (v: EffortSelection) => {
    setSelectedEffortState(v);
    setSelectedEffort(v);
  };
  const onSelectRefineEffort = (v: EffortSelection) => {
    setRefineEffort(v);
    setSelectedRefineEffort(v);
  };
  const onSelectChatEffort = (v: EffortSelection) => {
    setChatEffort(v);
    setSelectedChatEffort(v);
  };

  React.useEffect(() => {
    const dm = modelsCache[selectedProviderId];
    if (dm?.length && !dm.some((m) => m.id === selectedModel)) {
      const pick = dm.find((m) => /vision|gpt-4o|claude|gemini/i.test(m.id))?.id || dm[0].id;
      setSelectedModel(pick);
      setSelectedModelId(pick);
    }
    const rm = modelsCache[refineProviderId];
    if (rm?.length && !rm.some((m) => m.id === refineModel)) {
      const pick = rm.find((m) => /claude|gpt-4|gemini|deepseek|qwen/i.test(m.id))?.id || rm[0].id;
      setRefineModel(pick);
      setSelectedRefineModelId(pick);
    }
    const cm = modelsCache[chatProviderId];
    if (cm?.length && !cm.some((m) => m.id === chatModel)) {
      const pick = cm.find((m) => /claude|gpt-4|gemini|deepseek|qwen/i.test(m.id))?.id || cm[0].id;
      setChatModel(pick);
      setSelectedChatModelId(pick);
    }
  }, [modelsCache, selectedProviderId, selectedModel, refineProviderId, refineModel, chatProviderId, chatModel]);

  const value: ProvidersContextValue = {
    providers,
    setProviders,
    save,
    selectedProviderId,
    selectedModel,
    refineProviderId,
    refineModel,
    chatProviderId,
    chatModel,
    selectedEffort,
    refineEffort,
    chatEffort,
    modelsCache,
    loadingModelsFor,
    fetchModels,
    onSelectProvider,
    onSelectModel,
    onSelectRefineProvider,
    onSelectRefineModel,
    onSelectChatProvider,
    onSelectChatModel,
    onSelectEffort,
    onSelectRefineEffort,
    onSelectChatEffort,
    selectedProvider,
    refineProvider,
    chatProvider,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProviders() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useProviders must be used within ProvidersProvider");
  return v;
}
