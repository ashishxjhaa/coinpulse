"use server";

import qs from "query-string";

const BASE_URL = process.env.COINGECKO_BASE_URL;
const API_KEY = process.env.COINGECKO_API_KEY;

if (!BASE_URL) throw new Error("COINGECKO_BASE_URL is not set");
if (!API_KEY) throw new Error("COINGECKO_API_KEY is not set");

export async function fetcher<T>(
  endpoint: string,
  params?: QueryParams,
  revalidate = 60,
): Promise<T> {
  const url = qs.stringifyUrl(
    { url: `${BASE_URL}/${endpoint}`, query: params },
    { skipEmptyString: true, skipNull: true },
  );
  const response = await fetch(url, {
    headers: {
      "x-cg-demo-api-key": API_KEY,
      "Content-Type": "application/json",
    } as Record<string, string>,
    next: { revalidate },
  });
  if (!response.ok) {
    const errorBody: CoinGeckoErrorBody = await response
      .json()
      .catch(() => ({}));
    throw new Error(
      `API Error: ${response.status}: ${errorBody.error || response.statusText}`,
    );
  }
  return response.json();
}

export async function getTrendingCoins(): Promise<TrendingCoin[]> {
  try {
    const { coins } = await fetcher<{ coins: TrendingCoin[] }>(
      "search/trending",
    );
    return coins;
  } catch {
    return [];
  }
}

export async function searchCoins(query: string): Promise<SearchCoin[]> {
  const { coins } = await fetcher<{
    coins: Array<{ id: string; name: string; symbol: string; thumb: string }>;
  }>("search", { query });

  const top = coins.slice(0, 10);
  if (!top.length) return [];

  const marketData = await fetcher<
    Array<{
      id: string;
      price_change_percentage_24h: number;
      market_cap_rank: number;
      image: string;
    }>
  >("coins/markets", {
    vs_currency: "usd",
    ids: top.map((c) => c.id).join(","),
  });

  const marketMap = new Map(marketData.map((m) => [m.id, m]));

  return top.map((coin) => ({
    ...coin,
    large: marketMap.get(coin.id)?.image ?? coin.thumb,
    market_cap_rank: marketMap.get(coin.id)?.market_cap_rank ?? 0,
    data: {
      price_change_percentage_24h:
        marketMap.get(coin.id)?.price_change_percentage_24h ?? 0,
    },
  }));
}

export async function getPools(
  id: string,
  network?: string | null,
  contractAddress?: string | null,
): Promise<PoolData> {
  const fallback: PoolData = { id: "", address: "", name: "", network: "" };
  try {
    const endpoint =
      network && contractAddress
        ? `onchain/networks/${network}/tokens/${contractAddress}/pools`
        : "onchain/search/pools";
    const params = network && contractAddress ? undefined : { query: id };
    const poolData = await fetcher<{ data: PoolData[] }>(endpoint, params);
    return poolData.data?.[0] ?? fallback;
  } catch {
    return fallback;
  }
}
