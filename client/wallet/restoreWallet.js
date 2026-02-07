// Restore wallet from seed (client-side only).
import { loadXrpl } from "../utils/xrpl.js";

export async function restoreWalletFromSeed(seed) {
  const xrpl = await loadXrpl();
  try {
    const wallet = xrpl.Wallet.fromSeed(seed);
    return {
      wallet,
      classicAddress: wallet.classicAddress,
      xAddress: wallet.getXAddress(false, true),
      seed: wallet.seed,
    };
  } catch (err) {
    throw new Error("Invalid seed format. Please check and try again.");
  }
}
