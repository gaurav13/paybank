// Payment signing and submission. All signing remains in-browser using the seed in memory.
import { loadXrpl, connectClient } from "../utils/xrpl.js";

export async function sendPayment({ seed, destination, amountXrp, network }) {
  const xrpl = await loadXrpl();
  validateInputs({ xrpl, seed, destination, amountXrp });

  const { client, disconnect } = await connectClient(network);
  const wallet = xrpl.Wallet.fromSeed(seed); // Seed never leaves the browser.

  // Build basic payment transaction.
  const payment = {
    TransactionType: "Payment",
    Account: wallet.classicAddress,
    Destination: destination,
    Amount: xrpl.xrpToDrops(amountXrp), // Convert to drops.
  };

  // Autofill fee, sequence, and LastLedgerSequence.
  const prepared = await client.autofill(payment);

  // Sign locally.
  const signed = wallet.sign(prepared);

  // Submit and wait for validation.
  try {
    const result = await client.submitAndWait(signed.tx_blob);

    // Check result for success.
    const meta = result?.result?.meta;
    if (meta?.TransactionResult !== "tesSUCCESS") {
      throw new Error(meta?.TransactionResult || "Transaction failed");
    }

    return {
      hash: signed.hash,
      result: meta.TransactionResult,
    };
  } finally {
    await disconnect();
  }
}

function validateInputs({ xrpl, seed, destination, amountXrp }) {
  if (!seed) {
    throw new Error("Missing wallet seed.");
  }
  if (!destination || !xrpl.isValidClassicAddress(destination)) {
    throw new Error("Destination address is invalid.");
  }
  const amountNum = Number(amountXrp);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new Error("Amount must be greater than zero.");
  }
}
