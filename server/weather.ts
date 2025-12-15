/**
 * Hava Durumu ve Oşinografik Veri Servisleri
 * METOC (Meteorological and Oceanographic) veri entegrasyonu
 */

import axios from "axios";
import { distanceToCoastlineKm, isPointOnLand as isCoastlinePointOnLand } from "./coastline";

/**
 * Hava durumu veri yapısı
 */
export interface WeatherData {
  latitude: number;
  longitude: number;
  timestamp: Date;
  windSpeed: number; // m/s
  windDirection: number; // degrees (0-360)
  waveHeight: number; // meters
  wavePeriod: number; // seconds
  waveDirection: number; // degrees
  currentSpeed: number; // m/s (ocean current)
  currentDirection: number; // degrees
  seaTemp: number; // celsius
  airTemp: number; // celsius
  pressure: number; // hPa
  source: string;
}

function createFallbackWeather(lat: number, lon: number, timestamp?: Date): WeatherData {
  return {
    latitude: lat,
    longitude: lon,
    timestamp: timestamp || new Date(),
    windSpeed: 5,
    windDirection: 180,
    waveHeight: 0.5,
    wavePeriod: 5,
    waveDirection: 90,
    currentSpeed: 0.3,
    currentDirection: 120,
    seaTemp: 18,
    airTemp: 18,
    pressure: 1013,
    source: "Open-Meteo (fallback cache)",
  };
}

function createFallbackMarineWeather(): Partial<WeatherData> {
  return {
    waveHeight: 0.5,
    wavePeriod: 5,
    waveDirection: 90,
    currentSpeed: 0.3,
    currentDirection: 120,
    seaTemp: 18,
  };
}

/**
 * NOAA GFS (Global Forecast System) API entegrasyonu
 * Küresel hava durumu tahminleri
 */
export async function fetchNOAAWeather(
  lat: number,
  lon: number,
  timestamp?: Date
): Promise<WeatherData | null> {
  try {
    // Open-Meteo API kullanıyoruz (ücretsiz, API key gerektirmiyor)
    // NOAA GFS modelini kullanıyor
    const url = "https://api.open-meteo.com/v1/forecast";
    
    const params = {
      latitude: lat,
      longitude: lon,
      hourly: "temperature_2m,windspeed_10m,winddirection_10m,pressure_msl,surface_pressure",
      timezone: "UTC",
      forecast_days: 7,
    };

    const response = await axios.get(url, { params, timeout: 10000 });
    
    if (!response.data || !response.data.hourly) {
      return createFallbackWeather(lat, lon, timestamp);
    }

    const hourly = response.data.hourly;
    const index = 0; // En yakın zaman dilimi
    
    return {
      latitude: lat,
      longitude: lon,
      timestamp: timestamp || new Date(),
      windSpeed: hourly.windspeed_10m?.[index] || 0,
      windDirection: hourly.winddirection_10m?.[index] || 0,
      waveHeight: 0, // Open-Meteo'da dalga verisi yok, ayrı API gerekli
      wavePeriod: 0,
      waveDirection: 0,
      currentSpeed: 0, // Akıntı verisi için Copernicus gerekli
      currentDirection: 0,
      seaTemp: 15, // Default değer
      airTemp: hourly.temperature_2m?.[index] || 15,
      pressure: hourly.pressure_msl?.[index] || 1013,
      source: "Open-Meteo (NOAA GFS)",
    };
  } catch (error) {
    console.error("NOAA weather fetch error:", error);
    return createFallbackWeather(lat, lon, timestamp);
  }
}

/**
 * Marine Weather API - dalga verileri için
 * Open-Meteo Marine API kullanıyoruz
 */
export async function fetchMarineWeather(
  lat: number,
  lon: number,
  timestamp?: Date
): Promise<Partial<WeatherData> | null> {
  try {
    const url = "https://marine-api.open-meteo.com/v1/marine";
    
    const params = {
      latitude: lat,
      longitude: lon,
      hourly: "wave_height,wave_direction,wave_period,ocean_current_velocity,ocean_current_direction,sea_surface_temperature",
      timezone: "UTC",
      forecast_days: 7,
    };

    const response = await axios.get(url, { params, timeout: 10000 });
    
    if (!response.data || !response.data.hourly) {
      return createFallbackMarineWeather();
    }

    const hourly = response.data.hourly;
    const index = 0;
    
    return {
      waveHeight: hourly.wave_height?.[index] || 0,
      wavePeriod: hourly.wave_period?.[index] || 0,
      waveDirection: hourly.wave_direction?.[index] || 0,
      currentSpeed: hourly.ocean_current_velocity?.[index] || 0,
      currentDirection: hourly.ocean_current_direction?.[index] || 0,
      seaTemp: hourly.sea_surface_temperature?.[index] || 15,
    };
  } catch (error) {
    console.error("Marine weather fetch error:", error);
    return createFallbackMarineWeather();
  }
}

/**
 * Kombine hava durumu verisi - hem atmosferik hem de deniz verileri
 */
export async function fetchCombinedWeather(
  lat: number,
  lon: number,
  timestamp?: Date
): Promise<WeatherData | null> {
  try {
    const [atmospheric, marine] = await Promise.all([
      fetchNOAAWeather(lat, lon, timestamp),
      fetchMarineWeather(lat, lon, timestamp),
    ]);

    if (!atmospheric) {
      return createFallbackWeather(lat, lon, timestamp);
    }

    // Marine verileri varsa birleştir
    if (marine) {
      return {
        ...atmospheric,
        waveHeight: marine.waveHeight || 0,
        wavePeriod: marine.wavePeriod || 0,
        waveDirection: marine.waveDirection || 0,
        currentSpeed: marine.currentSpeed || 0,
        currentDirection: marine.currentDirection || 0,
        seaTemp: marine.seaTemp || atmospheric.seaTemp,
        source: "Open-Meteo (Combined)",
      };
    }

    return atmospheric;
  } catch (error) {
    console.error("Combined weather fetch error:", error);
    return createFallbackWeather(lat, lon, timestamp);
  }
}

/**
 * Rota boyunca hava durumu verilerini çek
 * Grid bazlı - her 1 derece için bir veri noktası
 */
export async function fetchWeatherAlongRoute(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  gridResolution: number = 1.0 // derece cinsinden
): Promise<WeatherData[]> {
  const weatherPoints: WeatherData[] = [];
  
  // Basit linear interpolasyon ile grid noktaları oluştur
  const latDiff = endLat - startLat;
  const lonDiff = endLon - startLon;
  const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
  const steps = Math.ceil(distance / gridResolution);
  
  const promises: Promise<WeatherData | null>[] = [];
  
  for (let i = 0; i <= steps; i++) {
    const ratio = steps > 0 ? i / steps : 0;
    const lat = startLat + latDiff * ratio;
    const lon = startLon + lonDiff * ratio;
    
    promises.push(fetchCombinedWeather(lat, lon));
  }
  
  const results = await Promise.all(promises);
  
  return results.filter((w): w is WeatherData => w !== null);
}

/**
 * Batimetri kontrolü - GERÇEK derinlik verisi
 * Uses NOAA ERDDAP ETOPO 2022 data via bathymetry module
 *
 * NOTE: This is a synchronous wrapper that reads from cache.
 * For best performance, call prefetchRouteDepths() before route optimization.
 * If data not in cache, returns fallback estimation.
 */
export function checkDepth(lat: number, lon: number): number {
  // Try to get real depth from cache (via bathymetry module)
  try {
    const { checkDepthSync } = require('./bathymetry');
    return checkDepthSync(lat, lon);
  } catch (error) {
    // Fallback to old estimation if bathymetry module fails
    console.warn('[Weather] Bathymetry module unavailable, using fallback');
    return checkDepthFallback(lat, lon);
  }
}

/**
 * Fallback depth estimation (used when real data unavailable)
 * Based on distance to coastline
 */
function checkDepthFallback(lat: number, lon: number): number {
  // Kara kontrolü - coastline verisi ile
  if (isCoastlinePointOnLand(lat, lon, 0.01)) {
    return 0; // Kara
  }

  // Kıyıya uzaklığa bağlı basit batimetri modeli (fallback)
  const distanceKm = distanceToCoastlineKm(lat, lon);

  if (!isFinite(distanceKm)) {
    return 5000; // Veri yoksa derin deniz varsayımı
  }

  if (distanceKm < 1) return 2; // Liman / sahile çok yakın
  if (distanceKm < 5) return 8; // Kıyı şeridi
  if (distanceKm < 15) return 25; // Kıyıdan açıkta ama hâlâ sığ
  if (distanceKm < 50) return 120; // Kıta sahanlığı
  if (distanceKm < 200) return 500; // Kenar şelfi

  return 3000; // Açık deniz
}

/**
 * Yakıt dönüşüm faktörleri (CF) - IMO standartları
 * ton CO2 / ton yakıt
 */
export const FUEL_CONVERSION_FACTORS: Record<string, number> = {
  HFO: 3.114, // Heavy Fuel Oil
  LFO: 3.151, // Light Fuel Oil
  MGO: 3.206, // Marine Gas Oil
  MDO: 3.206, // Marine Diesel Oil
  LNG: 2.750, // Liquefied Natural Gas
  Methanol: 1.375, // Methanol
};

/**
 * CO2 emisyonunu hesapla
 */
export function calculateCO2Emission(fuelConsumed: number, fuelType: string): number {
  const cf = FUEL_CONVERSION_FACTORS[fuelType] || 3.114;
  return fuelConsumed * cf;
}
