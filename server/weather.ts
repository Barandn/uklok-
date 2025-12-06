/**
 * Hava Durumu ve Oşinografik Veri Servisleri
 * METOC (Meteorological and Oceanographic) veri entegrasyonu
 */

import axios from "axios";

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
      return null;
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
    return null;
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
      return null;
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
    return null;
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
      return null;
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
    return null;
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
 * Batimetri kontrolü - sığ su tespiti
 * Basit bir implementasyon - gerçek GEBCO verisi için ayrı servis gerekli
 */
export function checkDepth(lat: number, lon: number): number {
  // Şimdilik basit bir yaklaşım: kıyıya yakınlık kontrolü
  // Gerçek uygulamada GEBCO NetCDF dosyasından okunmalı
  
  // Karaları tespit et (çok basit)
  const isLand = isPointOnLand(lat, lon);
  if (isLand) {
    return 0; // Kara
  }
  
  // Default olarak derin deniz
  return 5000; // meters
}

/**
 * Basit kara tespiti - Deniz rotaları için optimize edilmiş
 * Major denizleri ve okyanuslari tanır
 */
function isPointOnLand(lat: number, lon: number): boolean {
  // Akdeniz (Mediterranean Sea)
  if (lat >= 30 && lat <= 46 && lon >= -6 && lon <= 37) {
    return false; // Akdeniz - deniz
  }
  
  // Karadeniz (Black Sea)
  if (lat >= 41 && lat <= 47 && lon >= 27 && lon <= 42) {
    return false; // Karadeniz - deniz
  }
  
  // Ege Denizi (Aegean Sea)
  if (lat >= 35 && lat <= 41 && lon >= 23 && lon <= 29) {
    return false; // Ege - deniz
  }
  
  // Adriyatik Denizi (Adriatic Sea)
  if (lat >= 39 && lat <= 46 && lon >= 12 && lon <= 20) {
    return false; // Adriyatik - deniz
  }
  
  // Atlantik Okyanusu (Atlantic Ocean)
  if (lon >= -80 && lon <= -6) {
    if (lat >= -60 && lat <= 70) {
      return false; // Atlantik - deniz
    }
  }
  
  // Hint Okyanusu (Indian Ocean)
  if (lat >= -60 && lat <= 30 && lon >= 20 && lon <= 120) {
    return false; // Hint Okyanusu - deniz
  }
  
  // Pasifik Okyanusu (Pacific Ocean)
  if (lon >= 120 || lon <= -80) {
    if (lat >= -60 && lat <= 60) {
      return false; // Pasifik - deniz
    }
  }
  
  // Kızıldeniz (Red Sea)
  if (lat >= 12 && lat <= 30 && lon >= 32 && lon <= 44) {
    return false; // Kızıldeniz - deniz
  }
  
  // Basra Körfezi (Persian Gulf)
  if (lat >= 24 && lat <= 30 && lon >= 48 && lon <= 57) {
    return false; // Basra Körfezi - deniz
  }
  
  // Kuzey Denizi (North Sea)
  if (lat >= 51 && lat <= 62 && lon >= -4 && lon <= 9) {
    return false; // Kuzey Denizi - deniz
  }
  
  // Baltik Denizi (Baltic Sea)
  if (lat >= 53 && lat <= 66 && lon >= 10 && lon <= 30) {
    return false; // Baltik - deniz
  }
  
  // Eğer hiçbir deniz bölgesine girmiyorsa, kara olarak kabul et
  return true;
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
