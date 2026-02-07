import { loadXrpl } from "./utils/xrpl.js";

const onboardingView = document.getElementById("view-onboarding");
const selectionView = document.getElementById("view-selection");
const detailsView = document.getElementById("view-details");
const processingView = document.getElementById("view-processing");
const successView = document.getElementById("view-success");
const authorizeBtn = document.getElementById("authorize-btn");
const cardEl = document.querySelector(".pay-card");
const doneBtn = document.getElementById("done-btn");
const generateWalletBtn = document.getElementById("generate-wallet-btn");
const showImportBtn = document.getElementById("show-import-btn");
const importPanel = document.getElementById("import-panel");
const importSeedInput = document.getElementById("import-seed");
const importSubmitBtn = document.getElementById("import-submit-btn");
const walletAddressEl = document.getElementById("wallet-address");
const walletBalanceEl = document.getElementById("wallet-balance");
const walletExplorerLinkEl = document.getElementById("wallet-explorer-link");
const disconnectBtn = document.getElementById("disconnect-btn");
const bankStatusDot = document.getElementById("bank-status-dot");
const bankStatusText = document.getElementById("bank-status-text");
const amountDisplayEl = document.getElementById("amount-display");
const amountInputEl = document.getElementById("amount-input");
const editAmountBtn = document.getElementById("edit-amount-btn");
const payXrpBtn = document.getElementById("pay-xrp-btn");
const receiptTimeEl = document.getElementById("receipt-time");
const receiptToEl = document.getElementById("receipt-to");
const receiptFromEl = document.getElementById("receipt-from");
const receiptAmountEl = document.getElementById("receipt-amount");
const receiptFeeEl = document.getElementById("receipt-fee");
const receiptHashEl = document.getElementById("receipt-hash");
const receiptHashLinkEl = document.getElementById("receipt-hash-link");
const copyHashBtn = document.getElementById("copy-hash-btn");

const TESTNET_WSS = "wss://s.altnet.rippletest.net:51233";
const MERCHANT_ADDRESS = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
const PAYMENT_AMOUNT_XRP = "148.50";

let alertEl;
let walletBalanceXrp = null;
let currentAmountXrp = PAYMENT_AMOUNT_XRP;

function showView(view) {
  onboardingView.classList.add("d-none");
  selectionView.classList.add("d-none");
  detailsView.classList.add("d-none");
  processingView.classList.add("d-none");
  successView.classList.add("d-none");

  view.classList.remove("d-none");
}

function ensureAlert() {
  if (alertEl || !cardEl) return;
  alertEl = document.createElement("div");
  alertEl.className = "alert alert-danger d-none";
  alertEl.role = "alert";
  cardEl.prepend(alertEl);
}

function showError(message) {
  ensureAlert();
  if (!alertEl) return;
  alertEl.textContent = message;
  alertEl.classList.remove("d-none");
}

function clearError() {
  if (!alertEl) return;
  alertEl.textContent = "";
  alertEl.classList.add("d-none");
}

function getUserSeed() {
  return localStorage.getItem("xrpl_wallet_seed") || "";
}

function setUserSeed(seed) {
  localStorage.setItem("xrpl_wallet_seed", seed);
}

function clearUserSeed() {
  localStorage.removeItem("xrpl_wallet_seed");
}

function shortenAddress(address) {
  if (!address || address.length < 12) return address || "—";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function setBankStatus(isConnected) {
  if (isConnected) {
    bankStatusDot.classList.remove("bg-secondary");
    bankStatusDot.classList.add("bg-success");
    bankStatusText.textContent = "Connected";
  } else {
    bankStatusDot.classList.remove("bg-success");
    bankStatusDot.classList.add("bg-secondary");
    bankStatusText.textContent = "Disconnected";
  }
}

function setAmountDisplay(value) {
  currentAmountXrp = value;
  amountDisplayEl.textContent = `${value} XRP`;
  amountInputEl.value = value;
}

function showAmountInput(show) {
  if (show) {
    amountInputEl.classList.remove("d-none");
    amountDisplayEl.classList.add("d-none");
    editAmountBtn.textContent = "Use Default Amount";
    amountInputEl.focus();
    amountInputEl.select();
  } else {
    amountInputEl.classList.add("d-none");
    amountDisplayEl.classList.remove("d-none");
    editAmountBtn.textContent = "Edit Amount Manually";
  }
}

function formatXrpFromDrops(xrpl, drops) {
  try {
    return `${xrpl.dropsToXrp(drops)} XRP`;
  } catch (_) {
    return "—";
  }
}

function resetReceipt() {
  receiptTimeEl.textContent = "—";
  receiptToEl.textContent = "Army Store";
  receiptFromEl.textContent = "—";
  receiptAmountEl.textContent = "—";
  receiptFeeEl.textContent = "—";
  receiptHashEl.textContent = "—";
  receiptHashLinkEl.href = "#";
}

function resetWalletInfo() {
  walletAddressEl.textContent = "—";
  walletBalanceEl.textContent = "—";
  walletExplorerLinkEl.href = "#";
  setBankStatus(false);
  walletBalanceXrp = null;
}

async function refreshWalletInfo() {
  const seed = getUserSeed();
  if (!seed) {
    resetWalletInfo();
    return;
  }

  try {
    const xrpl = await loadXrpl();
    const wallet = xrpl.Wallet.fromSeed(seed);
    walletAddressEl.textContent = shortenAddress(wallet.classicAddress);
    walletExplorerLinkEl.href = `https://testnet.xrpl.org/accounts/${wallet.classicAddress}`;
    setBankStatus(true);

    const client = new xrpl.Client(TESTNET_WSS);
    await client.connect();
    try {
      const response = await client.request({
        command: "account_info",
        account: wallet.classicAddress,
        ledger_index: "validated",
      });
      const drops = response.result.account_data.Balance;
      walletBalanceXrp = Number(xrpl.dropsToXrp(drops));
      walletBalanceEl.textContent = `${walletBalanceXrp} XRP`;
    } catch (error) {
      if (error?.data?.error === "actNotFound" || error?.message?.includes("actNotFound")) {
        walletBalanceEl.textContent = "0 XRP";
        walletBalanceXrp = 0;
      } else {
        walletBalanceEl.textContent = "—";
        walletBalanceXrp = null;
      }
    } finally {
      await client.disconnect();
    }
  } catch (_) {
    resetWalletInfo();
  }
}

authorizeBtn.addEventListener("click", async () => {
  clearError();
  authorizeBtn.disabled = true;
  showView(processingView);

  let client;
  try {
    const seed = getUserSeed();
    if (!seed) {
      throw new Error("Please create a wallet first");
    }

    const amountValue = amountInputEl.classList.contains("d-none")
      ? currentAmountXrp
      : amountInputEl.value.trim();
    const amountNumber = Number(amountValue);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      throw new Error("Enter a valid XRP amount.");
    }
    if (walletBalanceXrp === null) {
      throw new Error("Unable to read wallet balance. Please try again.");
    }
    if (amountNumber > walletBalanceXrp) {
      throw new Error("Amount exceeds wallet balance.");
    }

    const xrpl = await loadXrpl();
    client = new xrpl.Client(TESTNET_WSS);
    await client.connect();

    const wallet = xrpl.Wallet.fromSeed(seed);
    const payment = {
      TransactionType: "Payment",
      Account: wallet.classicAddress,
      Destination: MERCHANT_ADDRESS,
      Amount: xrpl.xrpToDrops(amountNumber),
    };

    const prepared = await client.autofill(payment);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    const txResult = result?.result?.meta?.TransactionResult;

    if (txResult !== "tesSUCCESS") {
      throw new Error(txResult || "Transaction failed");
    }

    receiptTimeEl.textContent = new Date().toLocaleString();
    receiptFromEl.textContent = wallet.classicAddress;
    receiptAmountEl.textContent = `${amountNumber} XRP`;
    receiptFeeEl.textContent = formatXrpFromDrops(xrpl, prepared.Fee);
    receiptHashEl.textContent = signed.hash;
    receiptHashLinkEl.href = `https://testnet.xrpl.org/transactions/${signed.hash}`;
    showView(successView);
    await refreshWalletInfo();
  } catch (error) {
    const message = error?.message || "Transaction failed. Please try again.";
    showError(message);
    if (message === "Please create a wallet first") {
      showView(onboardingView);
    } else {
      showView(detailsView);
    }
  } finally {
    if (client) {
      try {
        await client.disconnect();
      } catch (_) {
        // ignore disconnect errors
      }
    }
    authorizeBtn.disabled = false;
  }
});

editAmountBtn.addEventListener("click", () => {
  const isEditing = amountInputEl.classList.contains("d-none");
  showAmountInput(isEditing);
  if (!isEditing) {
    setAmountDisplay(PAYMENT_AMOUNT_XRP);
  }
});

amountInputEl.addEventListener("change", () => {
  const value = amountInputEl.value.trim();
  if (value) {
    setAmountDisplay(value);
  }
});

doneBtn.addEventListener("click", () => {
  clearError();
  resetReceipt();
  setAmountDisplay(PAYMENT_AMOUNT_XRP);
  showAmountInput(false);
  showView(selectionView);
});

showImportBtn.addEventListener("click", () => {
  importPanel.classList.remove("d-none");
  importSeedInput.focus();
});

generateWalletBtn.addEventListener("click", async () => {
  clearError();
  generateWalletBtn.disabled = true;
  showView(processingView);

  let client;
  try {
    const xrpl = await loadXrpl();
    const wallet = xrpl.Wallet.generate();
    client = new xrpl.Client(TESTNET_WSS);
    await client.connect();

    await client.fundWallet(wallet, {
      amount: "100",
      faucetHost: "faucet.altnet.rippletest.net",
      faucetPath: "/accounts",
    });

    setUserSeed(wallet.seed);
    importSeedInput.value = "";
    importPanel.classList.add("d-none");
    resetReceipt();
    setAmountDisplay(PAYMENT_AMOUNT_XRP);
    showAmountInput(false);
    await refreshWalletInfo();
    showView(selectionView);
  } catch (error) {
    showError(error?.message || "Failed to create or fund wallet.");
    showView(onboardingView);
  } finally {
    if (client) {
      try {
        await client.disconnect();
      } catch (_) {
        // ignore disconnect errors
      }
    }
    generateWalletBtn.disabled = false;
  }
});

importSubmitBtn.addEventListener("click", async () => {
  clearError();
  const seed = importSeedInput.value.trim();
  if (!seed) {
    showError("Please paste your secret key first.");
    return;
  }
  try {
    const xrpl = await loadXrpl();
    xrpl.Wallet.fromSeed(seed);
    setUserSeed(seed);
    importSeedInput.value = "";
    importPanel.classList.add("d-none");
    resetReceipt();
    setAmountDisplay(PAYMENT_AMOUNT_XRP);
    showAmountInput(false);
    await refreshWalletInfo();
    showView(selectionView);
  } catch (error) {
    showError("Invalid secret key. Please check and try again.");
    showView(onboardingView);
  }
});

copyHashBtn.addEventListener("click", async () => {
  const hash = receiptHashEl.textContent.trim();
  if (!hash || hash === "—") return;
  try {
    await navigator.clipboard.writeText(hash);
    copyHashBtn.classList.remove("text-muted");
    copyHashBtn.classList.add("text-success");
    setTimeout(() => {
      copyHashBtn.classList.add("text-muted");
      copyHashBtn.classList.remove("text-success");
    }, 1200);
  } catch (_) {
    // ignore clipboard errors
  }
});

payXrpBtn.addEventListener("click", () => {
  clearError();
  resetReceipt();
  setAmountDisplay(PAYMENT_AMOUNT_XRP);
  showAmountInput(false);
  if (!getUserSeed()) {
    showView(onboardingView);
  } else {
    showView(detailsView);
  }
});

disconnectBtn.addEventListener("click", () => {
  clearUserSeed();
  resetReceipt();
  resetWalletInfo();
  showView(onboardingView);
});

showView(selectionView);
resetReceipt();
setAmountDisplay(PAYMENT_AMOUNT_XRP);
showAmountInput(false);
if (!getUserSeed()) {
  resetWalletInfo();
} else {
  refreshWalletInfo();
}
