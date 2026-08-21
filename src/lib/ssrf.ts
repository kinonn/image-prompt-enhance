import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type IpRange = { min: string; max: string };

// Address families that make a provider endpoint a Server-Side Request Forgery
// target. Private/local network ranges (RFC1918, CGNAT, link-local, ULA) are
// intentionally NOT blocked so LLM providers on the local network work by IP.
// Only the cloud metadata endpoint (169.254.169.254), loopback, multicast,
// reserved, and unspecified addresses remain blocked.
const BLOCKED_IPV4: IpRange[] = [
  { min: "0.0.0.0", max: "0.255.255.255" }, // this network / unspecified
  { min: "127.0.0.0", max: "127.255.255.255" }, // loopback (DNS-resolved only; literal localhost short-circuits earlier)
  { min: "169.254.169.254", max: "169.254.169.254" }, // cloud metadata endpoint only
  { min: "224.0.0.0", max: "239.255.255.255" }, // multicast
  { min: "240.0.0.0", max: "255.255.255.255" }, // reserved
];

const BLOCKED_IPV6: IpRange[] = [
  { min: "::", max: "::" }, // unspecified
  { min: "::1", max: "::1" }, // loopback (DNS-resolved only)
  { min: "ff00::", max: "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff" }, // multicast
];

function ipv4ToNum(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

function ipv6ToBigInt(ip: string): bigint {
  const [head, tail] = ip.split("::");
  const headParts = head ? head.split(":").filter(Boolean) : [];
  const tailParts = tail ? tail.split(":").filter(Boolean) : [];
  const missing = Math.max(0, 8 - headParts.length - tailParts.length);
  const all = [...headParts, ...new Array(missing).fill("0"), ...tailParts];
  let n = BigInt(0);
  for (const part of all) {
    n = (n << BigInt(16)) | BigInt(parseInt(part, 16));
  }
  return n;
}

function inRange(addr: string, family: 4 | 6, range: IpRange): boolean {
  if (family === 4) {
    const a = ipv4ToNum(addr);
    return a >= ipv4ToNum(range.min) && a <= ipv4ToNum(range.max);
  }
  const a = ipv6ToBigInt(addr);
  return a >= ipv6ToBigInt(range.min) && a <= ipv6ToBigInt(range.max);
}

function isBlockedIp(addr: string): boolean {
  const family = isIP(addr);
  if (family === 4) return BLOCKED_IPV4.some((r) => inRange(addr, 4, r));
  if (family === 6) return BLOCKED_IPV6.some((r) => inRange(addr, 6, r));
  return false;
}

function getAllowedProviderHosts(): Set<string> {
  const raw = process.env.ALLOWED_PROVIDER_HOSTS || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isLoopback(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0:0:0:0:0:0:0:1";
}

// mDNS / Bonjour hostnames (e.g. "mac-mini.local") are inherently local-network
// names — they resolve to devices on the same LAN and can never point at a
// cloud metadata service. Allow them by default so local LLM servers (Ollama,
// LM Studio, LAN devices) work without extra configuration.
function isLocalNetworkHost(host: string): boolean {
  return host.endsWith(".local");
}

/**
 * Validates a provider base URL before the server fetches it. Throws when the
 * URL is not http(s) or resolves (directly or via DNS) to a blocked address.
 *
 * Private/local network addresses (RFC1918, CGNAT, link-local, ULA) and .local
 * (mDNS/Bonjour) hostnames are allowed so local LLM providers work. Only the
 * cloud metadata endpoint, loopback, multicast, reserved, and unspecified
 * addresses are refused.
 */
export async function assertSafeProviderUrl(baseUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("Provider base URL is not a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Provider base URL must use http or https");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) throw new Error("Provider base URL has no host");

  if (isLoopback(host)) return;
  if (getAllowedProviderHosts().has(host)) return;
  if (isLocalNetworkHost(host)) return;

  let addresses: string[];
  try {
    const res = await lookup(host, { all: true, verbatim: true });
    addresses = res.map((r) => r.address);
  } catch {
    throw new Error(`Cannot resolve provider host: ${host}`);
  }

  const blocked = addresses.find(isBlockedIp);
  if (blocked) {
    throw new Error(
      `Provider host ${host} resolves to a blocked address (${blocked}). ` +
        "Cloud metadata, loopback, multicast, reserved, and unspecified addresses are not allowed."
    );
  }
}
