/**
 * Gemi Performans Modeli
 * Holtrop & Mennen yöntemi ile direnç ve yakıt tüketimi hesaplamaları
 * ISO 15016:2015 standardına göre hava durumu etkisi
 */

import { WeatherData, calculateCO2Emission } from "./weather";

/**
 * Gemi parametreleri
 */
export interface VesselParams {
  dwt: number; // Deadweight Tonnage
  length: number; // meters
  beam: number; // meters
  draft: number; // meters
  serviceSpeed: number; // knots
  fuelType: string;
  fuelConsumptionRate: number; // tons/day at service speed
  enginePower: number; // kW
}

/**
 * Digital Twin - Sanal Gemi Sınıfı
 */
export class DigitalTwin {
  public vessel: VesselParams;
  
  constructor(vessel: VesselParams) {
    this.vessel = vessel;
  }

  /**
   * Yakıt tüketimini hesapla (tons/hour)
   * Hız ve hava durumu koşullarına göre
   */
  calculateFuelConsumption(
    speed: number, // knots
    weather?: WeatherData
  ): number {
    // Temel yakıt tüketimi (servis hızında)
    const baseFuelRate = this.vessel.fuelConsumptionRate / 24; // tons/hour
    
    // Hız oranı (cubic law - yaklaşık)
    const speedRatio = speed / this.vessel.serviceSpeed;
    const speedFactor = Math.pow(speedRatio, 3);
    
    let fuelConsumption = baseFuelRate * speedFactor;
    
    // Hava durumu etkisi
    if (weather) {
      const weatherFactor = this.calculateWeatherResistanceFactor(speed, weather);
      fuelConsumption *= weatherFactor;
    }
    
    return Math.max(0, fuelConsumption);
  }

  /**
   * Hava durumu direnci faktörü
   * ISO 15016:2015 standardına göre
   */
  private calculateWeatherResistanceFactor(
    speed: number,
    weather: WeatherData
  ): number {
    let factor = 1.0;
    
    // Rüzgar direnci
    const windResistance = this.calculateWindResistance(speed, weather.windSpeed, weather.windDirection);
    
    // Dalga direnci
    const waveResistance = this.calculateWaveResistance(speed, weather.waveHeight, weather.waveDirection);
    
    // Akıntı etkisi
    const currentEffect = this.calculateCurrentEffect(speed, weather.currentSpeed, weather.currentDirection);
    
    // Toplam direnç faktörü
    // Basitleştirilmiş model - gerçek hesaplama çok daha karmaşık
    factor += (windResistance + waveResistance - currentEffect) / 100;
    
    return Math.max(0.5, Math.min(2.0, factor)); // %50 ile %200 arası sınırla
  }

  /**
   * Rüzgar direnci hesaplama
   * Döndürür: yüzde artış (0-100)
   */
  private calculateWindResistance(
    shipSpeed: number,
    windSpeed: number,
    windDirection: number
  ): number {
    // Rüzgar yönü: 0° = baş rüzgar, 90° = yan rüzgar, 180° = kuyruk rüzgar
    // Basitleştirilmiş model
    
    const headingFactor = Math.cos((windDirection * Math.PI) / 180);
    const relativeWindSpeed = windSpeed + shipSpeed * 0.514 * headingFactor; // m/s
    
    // Frontal alan (yaklaşık)
    const frontalArea = this.vessel.beam * (this.vessel.draft + 5); // m²
    
    // Rüzgar direnci (basitleştirilmiş)
    const windResistanceKN = 0.5 * 1.225 * frontalArea * Math.pow(relativeWindSpeed, 2) / 1000;
    
    // Yüzde artış olarak dönüştür
    const baseResistance = this.calculateBaseResistance(shipSpeed);
    const percentageIncrease = (windResistanceKN / baseResistance) * 100;
    
    return Math.max(0, percentageIncrease);
  }

  /**
   * Dalga direnci hesaplama
   * Döndürür: yüzde artış (0-100)
   */
  private calculateWaveResistance(
    shipSpeed: number,
    waveHeight: number,
    waveDirection: number
  ): number {
    // Basitleştirilmiş model
    // Gerçek hesaplama için ITTC veya ISO 15016 formülleri kullanılmalı
    
    const headingFactor = Math.abs(Math.cos((waveDirection * Math.PI) / 180));
    
    // Dalga yüksekliği etkisi (kübik ilişki)
    const waveEffect = Math.pow(waveHeight, 2) * headingFactor * 2;
    
    return Math.max(0, Math.min(50, waveEffect)); // Max %50 artış
  }

  /**
   * Akıntı etkisi hesaplama
   * Döndürür: yüzde azalma/artış (-50 ile 50 arası)
   */
  private calculateCurrentEffect(
    shipSpeed: number,
    currentSpeed: number,
    currentDirection: number
  ): number {
    // Akıntı yönü: 0° = aynı yön (yardımcı), 180° = ters yön (engelleyici)
    
    const headingFactor = Math.cos((currentDirection * Math.PI) / 180);
    const effectiveCurrentSpeed = currentSpeed * headingFactor;
    
    // Hız üzerindeki etki (m/s to knots: * 1.944)
    const currentEffectKnots = effectiveCurrentSpeed * 1.944;
    
    // Yüzde olarak
    const percentageEffect = (currentEffectKnots / shipSpeed) * 100;
    
    return Math.max(-50, Math.min(50, percentageEffect));
  }

  /**
   * Temel direnç hesaplama (Holtrop & Mennen basitleştirilmiş)
   * Döndürür: kN
   */
  private calculateBaseResistance(speed: number): number {
    // Çok basitleştirilmiş model
    // Gerçek Holtrop & Mennen formülleri çok daha karmaşık
    
    const speedMS = speed * 0.514; // knots to m/s
    const displacement = this.vessel.dwt * 1.2; // tons (yaklaşık)
    
    // Froude sayısı
    const froudeNumber = speedMS / Math.sqrt(9.81 * this.vessel.length);
    
    // Basitleştirilmiş toplam direnç
    // R_T ≈ k * V² * S
    const wettedSurface = 1.7 * this.vessel.length * this.vessel.draft; // m² (yaklaşık)
    const resistance = 0.5 * 1025 * wettedSurface * Math.pow(speedMS, 2) * 0.002; // N
    
    return resistance / 1000; // kN
  }

  /**
   * Hız kaybı hesaplama (hava durumu nedeniyle)
   * Döndürür: knots
   */
  calculateSpeedLoss(weather: WeatherData): number {
    const waveHeightEffect = weather.waveHeight * 0.5; // Her 1m dalga için ~0.5 knot kayıp
    const windEffect = (weather.windSpeed / 10) * 0.3; // Her 10 m/s rüzgar için ~0.3 knot
    
    const totalLoss = waveHeightEffect + windEffect;
    
    return Math.min(totalLoss, this.vessel.serviceSpeed * 0.3); // Max %30 kayıp
  }

  /**
   * Efektif hız hesaplama (hava durumu ve akıntı ile)
   */
  calculateEffectiveSpeed(
    targetSpeed: number,
    weather: WeatherData
  ): number {
    const speedLoss = this.calculateSpeedLoss(weather);
    const currentEffect = this.calculateCurrentEffect(targetSpeed, weather.currentSpeed, weather.currentDirection);
    
    let effectiveSpeed = targetSpeed - speedLoss;
    effectiveSpeed += (currentEffect / 100) * targetSpeed; // Akıntı etkisi
    
    return Math.max(1, effectiveSpeed); // Minimum 1 knot
  }

  /**
   * CII (Carbon Intensity Indicator) hesaplama
   * Döndürür: gCO2/ton·nm
   */
  calculateCII(
    totalCO2: number, // tons
    totalDistance: number, // nautical miles
    capacity: number // DWT
  ): number {
    if (totalDistance === 0 || capacity === 0) {
      return 0;
    }
    
    // CII = Total CO2 / (Capacity × Distance)
    const cii = (totalCO2 * 1000000) / (capacity * totalDistance); // gCO2/ton·nm
    
    return cii;
  }

  /**
   * CII skorunu belirle (A, B, C, D, E)
   * IMO standartlarına göre
   */
  getCIIRating(cii: number, vesselType: string): string {
    // Basitleştirilmiş sınırlar (gerçekte gemi tipine ve büyüklüğüne göre değişir)
    // Container gemisi için örnek değerler
    
    const boundaries = {
      A: 3.0,
      B: 4.0,
      C: 5.0,
      D: 6.0,
    };
    
    if (cii <= boundaries.A) return "A";
    if (cii <= boundaries.B) return "B";
    if (cii <= boundaries.C) return "C";
    if (cii <= boundaries.D) return "D";
    return "E";
  }

  /**
   * Rota segmenti için yakıt ve emisyon hesapla
   */
  calculateSegmentConsumption(
    distance: number, // nautical miles
    speed: number, // knots
    weather?: WeatherData
  ): {
    fuelConsumed: number; // tons
    co2Emitted: number; // tons
    duration: number; // hours
    effectiveSpeed: number; // knots
  } {
    const effectiveSpeed = weather 
      ? this.calculateEffectiveSpeed(speed, weather)
      : speed;
    
    const duration = distance / effectiveSpeed; // hours
    const fuelRate = this.calculateFuelConsumption(speed, weather);
    const fuelConsumed = fuelRate * duration;
    const co2Emitted = calculateCO2Emission(fuelConsumed, this.vessel.fuelType);
    
    return {
      fuelConsumed,
      co2Emitted,
      duration,
      effectiveSpeed,
    };
  }
}

/**
 * Great Circle mesafe hesaplama (Haversine formülü)
 * Döndürür: nautical miles
 */
export function calculateGreatCircleDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3440.065; // Dünya yarıçapı (nautical miles)
  
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

/**
 * Bearing (yön) hesaplama
 * Döndürür: degrees (0-360)
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  
  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  bearing = (bearing + 360) % 360;
  
  return bearing;
}

/**
 * Destination point hesaplama (mesafe ve bearing'den)
 */
export function calculateDestinationPoint(
  lat: number,
  lon: number,
  distance: number, // nautical miles
  bearing: number // degrees
): { lat: number; lon: number } {
  const R = 3440.065; // nautical miles
  const bearingRad = (bearing * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  
  const lat2Rad = Math.asin(
    Math.sin(latRad) * Math.cos(distance / R) +
      Math.cos(latRad) * Math.sin(distance / R) * Math.cos(bearingRad)
  );
  
  const lon2Rad =
    lonRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(distance / R) * Math.cos(latRad),
      Math.cos(distance / R) - Math.sin(latRad) * Math.sin(lat2Rad)
    );
  
  return {
    lat: (lat2Rad * 180) / Math.PI,
    lon: (lon2Rad * 180) / Math.PI,
  };
}
