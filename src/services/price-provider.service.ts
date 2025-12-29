import axios from 'axios';
import { PrismaClient, InvestmentAssetType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { ErrorCodes } from '../constants/errorCodes';

const prisma = new PrismaClient();

// Cache TTL configuraciones
const CACHE_TTL = {
  CRYPTO: 5 * 60 * 1000, // 5 minutos
  STOCK: 15 * 60 * 1000, // 15 minutos
  ETF: 15 * 60 * 1000, // 15 minutos
  FOREX: 60 * 60 * 1000, // 1 hora
};

// Rate limiting para Alpha Vantage (1 request/segundo)
const ALPHA_VANTAGE_RATE_LIMIT_MS = 1100; // 1.1 segundos para estar seguros
let lastAlphaVantageRequest = 0;

/**
 * Helper para respetar rate limit de Alpha Vantage
 */
async function waitForAlphaVantageRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastAlphaVantageRequest;

  if (timeSinceLastRequest < ALPHA_VANTAGE_RATE_LIMIT_MS) {
    const delay = ALPHA_VANTAGE_RATE_LIMIT_MS - timeSinceLastRequest;
    console.log(`⏱️  Rate limiting: waiting ${delay}ms before next Alpha Vantage request`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  lastAlphaVantageRequest = Date.now();
}

interface PriceData {
  price: number;
  change24h?: number;
  currency: string;
  timestamp: Date;
  isStale: boolean;
}

interface AssetSearchResult {
  symbol: string;
  name: string;
  assetType: InvestmentAssetType;
  currentPrice?: number;
  exchange?: string;
}

class PriceProviderService {
  private alphaVantageKey: string;
  private exchangeRateKey: string;
  private coinGeckoKey?: string;

  constructor() {
    this.alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY || '';
    this.exchangeRateKey = process.env.EXCHANGERATE_API_KEY || '';
    this.coinGeckoKey = process.env.COINGECKO_API_KEY;

    if (!this.alphaVantageKey) {
      console.warn('Warning: ALPHA_VANTAGE_API_KEY not set');
    }
    if (!this.exchangeRateKey) {
      console.warn('Warning: EXCHANGERATE_API_KEY not set');
    }
  }

  /**
   * Obtener precio actual de un activo (con cache)
   */
  async getCurrentPrice(
    assetSymbol: string,
    assetType: InvestmentAssetType
  ): Promise<PriceData> {
    // Verificar cache primero
    const cached = await this.getPriceFromCache(assetSymbol, assetType);
    if (cached && !cached.isStale) {
      console.log(`📦 Cache HIT for ${assetSymbol} (fresh, age: ${Math.floor((Date.now() - cached.timestamp.getTime()) / 1000)}s)`);
      return cached;
    }

    // Si no hay cache válido, obtener de API
    try {
      console.log(`🌐 Fetching live price for ${assetSymbol} (${assetType})...`);
      let priceData: PriceData;

      switch (assetType) {
        case 'CRYPTO':
          priceData = await this.getCryptoPrice(assetSymbol);
          break;
        case 'STOCK':
        case 'ETF':
          priceData = await this.getStockPrice(assetSymbol);
          break;
        case 'FOREX':
          priceData = await this.getForexRate(assetSymbol);
          break;
        default:
          throw new AppError(ErrorCodes.INVALID_INPUT, 400);
      }

      // Actualizar cache
      await this.updatePriceCache(assetSymbol, assetType, priceData);

      return priceData;
    } catch (error: any) {
      // Si la API falla, usar cache antiguo si existe
      if (cached) {
        const age = Math.floor((Date.now() - cached.timestamp.getTime()) / 60000); // minutos
        console.warn(`⚠️  API failed for ${assetSymbol}, using stale cache (${age}m old)`);
        return cached;
      }
      throw error;
    }
  }

  /**
   * Obtener múltiples precios en batch
   * IMPORTANTE: Procesa stocks/ETFs secuencialmente para respetar rate limit de Alpha Vantage
   */
  async getBatchPrices(
    symbols: Array<{ symbol: string; assetType: InvestmentAssetType }>
  ): Promise<Map<string, PriceData>> {
    const results = new Map<string, PriceData>();

    // Separar por tipo de activo
    const stocksAndETFs = symbols.filter(s => s.assetType === 'STOCK' || s.assetType === 'ETF');
    const others = symbols.filter(s => s.assetType !== 'STOCK' && s.assetType !== 'ETF');

    // Procesar stocks/ETFs SECUENCIALMENTE (1 por segundo por Alpha Vantage)
    if (stocksAndETFs.length > 0) {
      console.log(`📊 Fetching ${stocksAndETFs.length} stocks/ETFs sequentially (rate limited)...`);
      for (const { symbol, assetType } of stocksAndETFs) {
        try {
          const price = await this.getCurrentPrice(symbol, assetType);
          results.set(symbol, price);
          console.log(`✅ ${symbol}: $${price.price.toFixed(2)}`);
        } catch (error: any) {
          // Si es error 429 (rate limit), usar caché antiguo si existe
          if (error.statusCode === 429) {
            console.warn(`⚠️  Rate limit hit for ${symbol}, trying cache...`);
            const cached = await this.getPriceFromCache(symbol, assetType);
            if (cached) {
              console.log(`📦 Using cached price for ${symbol}: $${cached.price.toFixed(2)} (stale: ${cached.isStale})`);
              results.set(symbol, cached);
            } else {
              console.error(`❌ No cache available for ${symbol}`);
            }
          } else {
            console.error(`❌ Failed to get price for ${symbol}:`, error.message);
          }
        }
      }
    }

    // Procesar crypto/forex EN PARALELO (no tienen rate limit estricto)
    if (others.length > 0) {
      console.log(`🚀 Fetching ${others.length} crypto/forex in parallel...`);
      const batchSize = 10;
      for (let i = 0; i < others.length; i += batchSize) {
        const batch = others.slice(i, i + batchSize);
        const promises = batch.map(async ({ symbol, assetType }) => {
          try {
            const price = await this.getCurrentPrice(symbol, assetType);
            results.set(symbol, price);
          } catch (error) {
            console.error(`Failed to get price for ${symbol}:`, error);
          }
        });
        await Promise.all(promises);
      }
    }

    console.log(`✅ Batch complete: ${results.size}/${symbols.length} prices fetched`);
    return results;
  }

  /**
   * Buscar activos por nombre
   */
  async searchAsset(
    query: string,
    assetType?: InvestmentAssetType
  ): Promise<AssetSearchResult[]> {
    const results: AssetSearchResult[] = [];

    try {
      if (!assetType || assetType === 'CRYPTO') {
        const cryptoResults = await this.searchCrypto(query);
        results.push(...cryptoResults);
      }

      if (!assetType || assetType === 'STOCK' || assetType === 'ETF') {
        const stockResults = await this.searchStock(query);
        results.push(...stockResults);
      }

      return results.slice(0, 20); // Limitar a 20 resultados
    } catch (error: any) {
      console.error('Search failed:', error);
      throw new AppError(ErrorCodes.EXTERNAL_API_ERROR, 500);
    }
  }

  /**
   * Obtener precio de crypto desde CoinGecko
   */
  private async getCryptoPrice(symbol: string): Promise<PriceData> {
    try {
      // Convertir símbolo a ID de CoinGecko (ej: BTC -> bitcoin)
      const coinId = await this.getCoinGeckoId(symbol);

      const url = this.coinGeckoKey
        ? `https://pro-api.coingecko.com/api/v3/simple/price`
        : `https://api.coingecko.com/api/v3/simple/price`;

      const params: any = {
        ids: coinId,
        vs_currencies: 'usd',
        include_24hr_change: true,
      };

      if (this.coinGeckoKey) {
        params.x_cg_pro_api_key = this.coinGeckoKey;
      }

      const response = await axios.get(url, { params });

      if (!response.data[coinId]) {
        throw new AppError(ErrorCodes.ENTITY_NOT_FOUND, 404);
      }

      return {
        price: response.data[coinId].usd,
        change24h: response.data[coinId].usd_24h_change || undefined,
        currency: 'USD',
        timestamp: new Date(),
        isStale: false,
      };
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      console.error('CoinGecko API error:', error.response?.data || error.message);
      throw new AppError(ErrorCodes.EXTERNAL_API_ERROR, 500);
    }
  }

  /**
   * Obtener precio de stock/ETF desde Alpha Vantage
   */
  private async getStockPrice(symbol: string): Promise<PriceData> {
    try {
      // Esperar rate limit antes de hacer request
      await waitForAlphaVantageRateLimit();

      const url = 'https://www.alphavantage.co/query';
      const response = await axios.get(url, {
        params: {
          function: 'GLOBAL_QUOTE',
          symbol: symbol.toUpperCase(),
          apikey: this.alphaVantageKey,
        },
      });

      const quote = response.data['Global Quote'];

      // Detectar mensaje de rate limit en la respuesta
      if (response.data['Information']) {
        console.warn(`⚠️  Alpha Vantage rate limit warning for ${symbol}:`, response.data['Information']);
        throw new AppError(ErrorCodes.EXTERNAL_API_ERROR, 429); // 429 = Too Many Requests
      }

      if (!quote || !quote['05. price']) {
        throw new AppError(ErrorCodes.ENTITY_NOT_FOUND, 404);
      }

      return {
        price: parseFloat(quote['05. price']),
        change24h: parseFloat(quote['10. change percent']?.replace('%', '')) || undefined,
        currency: 'USD',
        timestamp: new Date(),
        isStale: false,
      };
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      console.error('Alpha Vantage API error:', error.response?.data || error.message);
      throw new AppError(ErrorCodes.EXTERNAL_API_ERROR, 500);
    }
  }

  /**
   * Obtener tasa de cambio desde ExchangeRate API
   */
  private async getForexRate(currencyPair: string): Promise<PriceData> {
    try {
      // Formato esperado: USD/EUR -> obtener tasa de USD a EUR
      const [base, target] = currencyPair.split('/');
      if (!base || !target) {
        throw new AppError(ErrorCodes.INVALID_INPUT, 400);
      }

      const url = `https://v6.exchangerate-api.com/v6/${this.exchangeRateKey}/latest/${base.toUpperCase()}`;
      const response = await axios.get(url);

      if (!response.data.conversion_rates || !response.data.conversion_rates[target.toUpperCase()]) {
        throw new AppError(ErrorCodes.ENTITY_NOT_FOUND, 404);
      }

      return {
        price: response.data.conversion_rates[target.toUpperCase()],
        currency: base.toUpperCase(),
        timestamp: new Date(),
        isStale: false,
      };
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      console.error('ExchangeRate API error:', error.response?.data || error.message);
      throw new AppError(ErrorCodes.EXTERNAL_API_ERROR, 500);
    }
  }

  /**
   * Buscar criptomonedas en CoinGecko
   */
  private async searchCrypto(query: string): Promise<AssetSearchResult[]> {
    try {
      const url = this.coinGeckoKey
        ? `https://pro-api.coingecko.com/api/v3/search`
        : `https://api.coingecko.com/api/v3/search`;

      const params: any = { query };
      if (this.coinGeckoKey) {
        params.x_cg_pro_api_key = this.coinGeckoKey;
      }

      const response = await axios.get(url, { params });

      return response.data.coins.slice(0, 10).map((coin: any) => ({
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        assetType: 'CRYPTO' as InvestmentAssetType,
      }));
    } catch (error: any) {
      console.error('CoinGecko search error:', error);
      return [];
    }
  }

  /**
   * Buscar stocks en Alpha Vantage
   */
  private async searchStock(query: string): Promise<AssetSearchResult[]> {
    try {
      // Esperar rate limit antes de hacer request
      await waitForAlphaVantageRateLimit();

      const url = 'https://www.alphavantage.co/query';
      const response = await axios.get(url, {
        params: {
          function: 'SYMBOL_SEARCH',
          keywords: query,
          apikey: this.alphaVantageKey,
        },
      });

      // Detectar mensaje de rate limit
      if (response.data['Information']) {
        console.warn('⚠️  Alpha Vantage rate limit warning:', response.data['Information']);
        return []; // Retornar array vacío en vez de error
      }

      if (!response.data.bestMatches) {
        return [];
      }

      return response.data.bestMatches.slice(0, 10).map((match: any) => ({
        symbol: match['1. symbol'],
        name: match['2. name'],
        assetType: 'STOCK' as InvestmentAssetType,
        exchange: match['4. region'],
      }));
    } catch (error: any) {
      console.error('Alpha Vantage search error:', error);
      return [];
    }
  }

  /**
   * Convertir símbolo de crypto a ID de CoinGecko
   */
  private async getCoinGeckoId(symbol: string): Promise<string> {
    // Mapeo manual para las más comunes
    const commonMappings: { [key: string]: string } = {
      BTC: 'bitcoin',
      ETH: 'ethereum',
      USDT: 'tether',
      BNB: 'binancecoin',
      SOL: 'solana',
      ADA: 'cardano',
      XRP: 'ripple',
      DOT: 'polkadot',
      DOGE: 'dogecoin',
      AVAX: 'avalanche-2',
    };

    const upperSymbol = symbol.toUpperCase();
    if (commonMappings[upperSymbol]) {
      return commonMappings[upperSymbol];
    }

    // Si no está en el mapeo, buscar
    const searchResults = await this.searchCrypto(symbol);
    if (searchResults.length > 0) {
      // Asumimos que el primer resultado es el correcto
      return symbol.toLowerCase();
    }

    throw new AppError(ErrorCodes.ENTITY_NOT_FOUND, 404);
  }

  /**
   * Obtener precio del cache
   */
  private async getPriceFromCache(
    assetSymbol: string,
    assetType: InvestmentAssetType
  ): Promise<PriceData | null> {
    try {
      const cached = await prisma.investmentPriceCache.findUnique({
        where: {
          assetSymbol_assetType: {
            assetSymbol: assetSymbol.toUpperCase(),
            assetType,
          },
        },
      });

      if (!cached) return null;

      const age = Date.now() - cached.timestamp.getTime();
      const ttl = CACHE_TTL[assetType];

      return {
        price: Number(cached.price),
        change24h: cached.change24h ? Number(cached.change24h) : undefined,
        currency: cached.currency,
        timestamp: cached.timestamp,
        isStale: age > ttl,
      };
    } catch (error) {
      console.error('Cache read error:', error);
      return null;
    }
  }

  /**
   * Actualizar cache de precios
   */
  private async updatePriceCache(
    assetSymbol: string,
    assetType: InvestmentAssetType,
    priceData: PriceData
  ): Promise<void> {
    try {
      await prisma.investmentPriceCache.upsert({
        where: {
          assetSymbol_assetType: {
            assetSymbol: assetSymbol.toUpperCase(),
            assetType,
          },
        },
        create: {
          assetSymbol: assetSymbol.toUpperCase(),
          assetType,
          price: priceData.price,
          currency: priceData.currency,
          change24h: priceData.change24h || null,
          source: this.getSourceName(assetType),
        },
        update: {
          price: priceData.price,
          change24h: priceData.change24h || null,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      console.error('Cache update error:', error);
      // No lanzar error, el cache es opcional
    }
  }

  /**
   * Limpiar cache antiguo (> 7 días)
   */
  async cleanOldCache(): Promise<void> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const result = await prisma.investmentPriceCache.deleteMany({
        where: {
          timestamp: {
            lt: sevenDaysAgo,
          },
        },
      });

      console.log(`Cleaned ${result.count} old price cache entries`);
    } catch (error) {
      console.error('Cache cleanup error:', error);
    }
  }

  /**
   * Obtener nombre de la fuente según el tipo de activo
   */
  private getSourceName(assetType: InvestmentAssetType): string {
    switch (assetType) {
      case 'CRYPTO':
        return 'coingecko';
      case 'STOCK':
      case 'ETF':
        return 'alphavantage';
      case 'FOREX':
        return 'exchangerate';
      default:
        return 'unknown';
    }
  }
}

export const priceProviderService = new PriceProviderService();
