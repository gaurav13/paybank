// Fetch and parse recent transactions for a wallet with endpoint fallback.
// Uses delivered_amount to reflect the actual amount that arrived (XRPL best practice).
import { loadXrpl, getEndpointCandidates, connectClientToEndpoint } from "../utils/xrpl.js";

export async function fetchPaymentHistory(address, maxTx = 20, network, options = {}) {
  const xrpl = await loadXrpl();
  const endpoints = await getEndpointCandidates(network);
  const includeNonPayments = options.includeNonPayments || false;
  const includeTokens = options.includeTokens || false;

  // Try endpoints in order until we successfully fetch results.
  for (const endpoint of endpoints) {
    console.info(`[History] Trying endpoint ${endpoint} for ${network}`);
    const { client, disconnect } = await connectClientToEndpoint(endpoint);

    try {
      let marker = null;
      const results = [];

      // Paginate until we gather up to maxTx records or no more marker.
      while (results.length < maxTx) {
        const req = {
          command: "account_tx",
          account: address,
          ledger_index_min: -1,
          ledger_index_max: -1,
          binary: false,
          limit: Math.max(maxTx, 20),
          forward: false,
        };
        if (marker) {
          // Marker should include ledger + seq when provided by server.
          req.marker = marker;
        }

        const response = await client.request(req);
        console.info("[History] account_tx response", {
          endpoint,
          markerSent: marker,
          markerReturned: response.result.marker,
          txCount: response.result.transactions?.length || 0,
        });

        const txs = response.result.transactions || [];
        for (const item of txs) {
          if (!item?.tx || !item?.meta) continue; // guard malformed entries
          if (!includeNonPayments && item.tx.TransactionType !== "Payment") continue;
          const tx = item.tx;
          const meta = item.meta;

          // delivered_amount (lowercase) is authoritative; fall back to DeliveredAmount or Amount if needed.
          const deliveredRaw = meta?.delivered_amount ?? meta?.DeliveredAmount ?? tx.Amount;
          const { amount, isToken } = normalizeDelivered(deliveredRaw);
          if (amount === null) continue; // skip malformed
          if (isToken && !includeTokens) continue; // skip issued currencies unless requested

          const direction =
            tx.Account?.toLowerCase() === address.toLowerCase() ? "Sent" : "Received";
          const counterparty = direction === "Sent" ? tx.Destination : tx.Account;
          const status = meta?.TransactionResult || "Unknown";
          const date = rippleTimeToDate(tx.date);

          results.push({
            hash: tx.hash,
            direction,
            amount,
            counterparty,
            status,
            date,
            network,
            isToken,
          });

          if (results.length >= maxTx) break;
        }

        marker = response.result.marker;
        if (!marker || results.length >= maxTx) break;
      }

      console.info(`[History] Success from ${endpoint}, returning ${results.length} items`);
      return results;
    } catch (error) {
      console.warn(`[History] Endpoint failed ${endpoint}`, error);
      // actNotFound = unfunded/new account; return empty history quietly.
      if (error?.data?.error === "actNotFound" || error?.message?.includes("actNotFound")) {
        await disconnect();
        return [];
      }
      // Try next endpoint on marker/other server errors.
    } finally {
      await disconnect();
    }
  }

  // If all endpoints failed, return empty to avoid crashing UI.
  return [];
}

function rippleTimeToDate(rippleTime) {
  if (typeof rippleTime !== "number") return null;
  // Ripple epoch starts at 2000-01-01T00:00:00Z (Unix 946684800).
  const unix = rippleTime + 946684800;
  return new Date(unix * 1000);
}

// Normalize delivered amount; returns amount (number) and isToken flag.
function normalizeDelivered(delivered) {
  if (!delivered) return { amount: null, isToken: false };

  // XRP Payments normally return a string in drops.
  if (typeof delivered === "string") {
    const num = Number(delivered);
    if (!Number.isFinite(num)) return { amount: null, isToken: false };
    return { amount: num / 1_000_000, isToken: false };
  }

  // Sometimes delivered can be an object with value/currency.
  if (typeof delivered === "object") {
    if (delivered.currency && delivered.currency !== "XRP") {
      const val = Number(delivered.value);
      return Number.isFinite(val) ? { amount: val, isToken: true } : { amount: null, isToken: true };
    }
    if (delivered.value) {
      const num = Number(delivered.value);
      return Number.isFinite(num) ? { amount: num, isToken: false } : { amount: null, isToken: false };
    }
  }

  return { amount: null, isToken: false };
}
