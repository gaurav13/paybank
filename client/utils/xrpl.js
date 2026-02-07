// XRPL helpers shared across the client. Everything stays in-browser.
// XRPL endpoints are read from env (or a runtime global) to avoid hardcoding.

let xrplPromise;
let envPromise;

// Lazy-load the SDK once from a CDN so it works with Vite or a static server.
export async function loadXrpl() {
  if (!xrplPromise) {
    // esm.sh bundles dependencies when using ?bundle, avoiding missing sub-deps in the browser.
    xrplPromise = import("https://esm.sh/xrpl@4.5.0?bundle");
  }
  return xrplPromise;
}

// Resolve env, supporting Vite (import.meta.env) and a fallback global for non-bundled static serving.
function getEnvSync() {
  // In ESM-capable browsers, import.meta is always defined inside modules.
  if (typeof import.meta !== "undefined" && import.meta.env) {
    return import.meta.env;
  }
  if (typeof window !== "undefined" && window.__XRPL_ENV) {
    return window.__XRPL_ENV;
  }
  return {};
}

// If env vars are not provided by Vite or window, try reading a local .env file (useful when served by live-server).
async function loadEnvFileFallback() {
  if (envPromise) return envPromise;
  envPromise = (async () => {
    const candidates = ["./env.config.json", "./.env", "/client/.env", "/.env"];
    for (const url of candidates) {
      try {
        const res = await fetch(url, { cache: "no-cache" });
        if (!res.ok) continue;
        const env = {};
        if (url.endsWith(".json")) {
          Object.assign(env, await res.json());
        } else {
          const text = await res.text();
          const lines = text.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
            const [key, ...rest] = trimmed.split("=");
            env[key] = rest.join("=").trim();
          }
        }
        if (Object.keys(env).length) {
          console.info(`[XRPL] Loaded env from ${url} (static server fallback)`);
          return env;
        }
      } catch (err) {
        // keep trying other paths
      }
    }
    console.warn("[XRPL] Unable to load .env via fallback paths");
    return {};
  })();
  return envPromise;
}

async function resolveEndpoint(networkOverride) {
  // First check injected env, then fallback to loading .env when using static hosting.
  let env = getEnvSync();
  if (!env.VITE_XRPL_TESTNET_WSS && !env.VITE_XRPL_MAINNET_WSS) {
    const fallbackEnv = await loadEnvFileFallback();
    env = { ...fallbackEnv, ...env }; // explicit env wins over fallback
  }

  const network = (networkOverride || env.VITE_XRPL_NETWORK || "testnet").toLowerCase();
  const testnet = env.VITE_XRPL_TESTNET_WSS;
  const mainnet = env.VITE_XRPL_MAINNET_WSS;

  const endpoint = network === "mainnet" ? mainnet : testnet;

  if (!endpoint) {
    throw new Error("XRPL endpoint missing. Check VITE_XRPL_TESTNET_WSS / VITE_XRPL_MAINNET_WSS in your .env");
  }

  return { endpoint, network };
}

// Create a fresh client per call (avoids stale connections and honors selected network).
export async function connectClient(networkOverride) {
  const xrpl = await loadXrpl();
  const { endpoint, network } = await resolveEndpoint(networkOverride);

  const client = new xrpl.Client(endpoint);
  await client.connect();
  console.info(`[XRPL] Connected to ${network} at ${endpoint}`);

  const disconnect = async () => {
    try {
      await client.disconnect();
    } catch (_) {
      /* ignore disconnect errors */
    }
  };

  return { client, disconnect, network };
}

// Return endpoint candidates (primary + fallbacks) for a given network.
export async function getEndpointCandidates(networkOverride) {
  const { endpoint, network } = await resolveEndpoint(networkOverride);
  const list = [endpoint];
  if (network === "mainnet") {
    list.push("wss://xrplcluster.com", "wss://s2.ripple.com");
  } else {
    list.push("wss://s.altnet.rippletest.net:51233", "wss://testnet.xrpl-labs.com");
  }
  // Deduplicate while preserving order.
  return Array.from(new Set(list));
}

// Connect to a specific endpoint (used for fallback attempts).
export async function connectClientToEndpoint(endpoint) {
  const xrpl = await loadXrpl();
  const client = new xrpl.Client(endpoint);
  await client.connect();
  const disconnect = async () => {
    try {
      await client.disconnect();
    } catch (_) {
      /* ignore */
    }
  };
  return { client, disconnect };
}

// Fetch XRP balance for an address. If the account is unfunded, return 0 safely.
export async function fetchXrpBalance(address, networkOverride) {
  await loadXrpl();
  const { client, disconnect } = await connectClient(networkOverride);

  try {
    const response = await client.request({
      command: "account_info",
      account: address,
      ledger_index: "validated",
    });

    const drops = response.result.account_data.Balance;
    return Number(drops) / 1_000_000;
  } catch (error) {
    // Unfunded wallets return actNotFound; treat as zero balance without surfacing raw errors to users.
    if (error?.data?.error === "actNotFound" || error?.message?.includes("actNotFound")) {
      return 0;
    }
    throw error;
  } finally {
    await disconnect();
  }
}

export function explorerUrlForAccount(address, network = "testnet") {
  const base = network === "mainnet" ? "https://livenet.xrpl.org/accounts" : "https://testnet.xrpl.org/accounts";
  return `${base}/${address}`;
}

export function explorerUrlForTx(hash, network = "testnet") {
  const base = network === "mainnet" ? "https://livenet.xrpl.org/transactions" : "https://testnet.xrpl.org/transactions";
  return `${base}/${hash}`;
}
