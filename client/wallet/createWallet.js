// Wallet creation logic (browser-only). Seeds never leave the client.
import { loadXrpl } from "../utils/xrpl.js";

export async function createWallet() {
  const xrpl = await loadXrpl();

  // Generates a secure random seed and derived keys using the XRPL SDK.
  const wallet = xrpl.Wallet.generate();

  return {
    wallet,
    classicAddress: wallet.classicAddress,
    xAddress: wallet.getXAddress(false, true), // Testnet X-address
    seed: wallet.seed,
  };
}
