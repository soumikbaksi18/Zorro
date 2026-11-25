// Payment links: Zorro never signs anything. It hands the user a link with the
// exact amount and destination filled in, and their own wallet asks them to confirm.

import { ZEC, fromBaseUnits, getStablecoin } from "./assets";

export type PaymentLink = {
  /** Standard payment URI, shown as a QR code. */
  uri: string;
  /** Link for the "Open in wallet" button (may be a wallet's universal link). */
  openUrl: string;
  /** Which wallets understand it, for the UI. */
  walletHint: string;
};

export function buildPaymentLink(originKey: string, depositAddress: string, amountBaseUnits: string): PaymentLink {
  if (originKey === ZEC.key) {
    // ZIP-321 payment request. Amount is in ZEC, not zatoshis.
    const uri = `zcash:${depositAddress}?amount=${fromBaseUnits(amountBaseUnits, ZEC.decimals)}`;
    return { uri, openUrl: uri, walletHint: "Zodl or any Zcash wallet" };
  }

  const coin = getStablecoin(originKey);
  if (!coin) throw new Error(`Unknown asset ${originKey}`);

  if ("evmChainId" in coin) {
    // EIP-681 ERC-20 transfer. uint256 is in base units.
    const path = `${coin.tokenAddress}@${coin.evmChainId}/transfer?address=${depositAddress}&uint256=${amountBaseUnits}`;
    return {
      uri: `ethereum:${path}`,
      // MetaMask's universal link opens the app on both iOS and Android.
      openUrl: `https://metamask.app.link/send/${path}`,
      walletHint: coin.walletHint,
    };
  }

  // Solana Pay transfer request. Amount is in USDC, not base units.
  const uri = `solana:${depositAddress}?amount=${fromBaseUnits(amountBaseUnits, coin.decimals)}&spl-token=${coin.mint}&label=Zorro`;
  return { uri, openUrl: uri, walletHint: coin.walletHint };
}
