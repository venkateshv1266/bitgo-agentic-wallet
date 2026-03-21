import { config } from '../config';

let bitgo: any = null;

// Cache: coin -> { price, timestamp }
const cache = new Map<string, { price: number; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function initBitGo() {
  if (bitgo) return;
  const { BitGo } = await import('bitgo');
  bitgo = new BitGo({ env: config.bitgo.env as any });
}

/**
 * Get USD price for 1 display unit of a coin using BitGo markets API.
 * e.g. getUsdPrice('hteth') returns ~3500 (USD per 1 ETH)
 */
export async function getUsdPrice(coin: string): Promise<number> {
  // Check cache
  const cached = cache.get(coin);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.price;
  }

  try {
    await initBitGo();
    const coinInstance = bitgo.coin(coin);
    const marketData = await coinInstance.markets().latest({});
    const price = marketData?.latest?.currencies?.USD?.last || 0;

    // Cache the result
    cache.set(coin, { price, timestamp: Date.now() });
    console.log(`[prices] ${coin} = $${price} USD (from BitGo markets)`);
    return price;
  } catch (err: any) {
    console.warn(`[prices] Failed to fetch price for ${coin}: ${err.message}`);
    return 0;
  }
}

/**
 * Get USD value of a specific amount in base units.
 * e.g. getUsdValue('hteth', '1000000000000000000') returns ~3500 (1 ETH in USD)
 */
export async function getUsdValue(coin: string, baseUnits: string): Promise<number> {
  if (!baseUnits || baseUnits === '0') return 0;

  try {
    await initBitGo();
    const coinInstance = bitgo.coin(coin);
    const baseFactor = coinInstance.getBaseFactor();

    // Convert base units to display units
    const raw = BigInt(baseUnits);
    const divisor = BigInt(baseFactor);
    const displayUnits = Number(raw) / Number(divisor);

    // Get USD price
    const usdPrice = await getUsdPrice(coin);
    return displayUnits * usdPrice;
  } catch (err: any) {
    console.warn(`[prices] Failed to compute USD value for ${coin}/${baseUnits}: ${err.message}`);
    return 0;
  }
}
