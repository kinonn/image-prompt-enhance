import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { baseUrl, apiKey } = await req.json();

    if (!baseUrl) {
      return NextResponse.json({ error: "Missing baseUrl" }, { status: 400 });
    }

    const url = baseUrl.replace(/\/$/, "") + "/models";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      // Some providers also accept x-api-key
      headers["x-api-key"] = apiKey;
    }

    const res = await fetch(url, { headers, cache: "no-store" });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Provider returned ${res.status}: ${text.slice(0, 500)}` },
        { status: res.status }
      );
    }

    const data = await res.json();

    // Normalize: OpenAI returns { data: [{id, ...}] }, some return { models: [...] }
    let models: { id: string; name?: string }[] = [];
    if (Array.isArray(data.data)) {
      models = data.data.map((m: { id: string; object?: string; name?: string }) => ({
        id: m.id,
        name: m.name || m.id,
      }));
    } else if (Array.isArray(data.models)) {
      models = data.models.map((m: { id: string; name?: string }) => ({
        id: m.id,
        name: m.name || m.id,
      }));
    } else if (Array.isArray(data)) {
      models = data.map((m: { id: string; name?: string }) => ({
        id: typeof m === "string" ? m : m.id,
        name: typeof m === "string" ? m : m.name || m.id,
      }));
    } else {
      // fallback: return raw keys
      models = Object.keys(data).map((k) => ({ id: k, name: k }));
      // If we couldn't parse, return raw for debugging
      if (models.length === 0) {
        return NextResponse.json({ models: [], raw: data });
      }
    }

    return NextResponse.json({ models });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
