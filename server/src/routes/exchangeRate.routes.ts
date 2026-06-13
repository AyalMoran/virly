import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  FX_BASE_CURRENCY,
  SUPPORTED_CURRENCIES,
  getCurrentRates
} from "../services/fx.service.js";

const router = Router();

//#region Routes
router.get("/current", requireAuth, async (_req, res, next) => {
  try {
    const snapshot = await getCurrentRates();

    // Only the supported display currencies ever leave the server; provider
    // payloads with extra currencies are already trimmed by the FX service.
    const rates = Object.fromEntries(
      SUPPORTED_CURRENCIES.map((currency) => [currency, snapshot.rates[currency]])
    );

    return res.json({
      baseCurrency: FX_BASE_CURRENCY,
      supportedCurrencies: SUPPORTED_CURRENCIES,
      rates,
      provider: snapshot.provider,
      fetchedAt: snapshot.fetchedAt.toISOString(),
      validForDate: snapshot.validForDate,
      expiresAt: snapshot.expiresAt.toISOString(),
      isStale: snapshot.isStale
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return res.status(Number(error.status)).json({ message: error.message });
    }

    next(error);
  }
});
//#endregion

export default router;
