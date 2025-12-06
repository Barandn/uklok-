import { describe, expect, it } from "vitest";
import { fetchCombinedWeather, fetchNOAAWeather, fetchMarineWeather, checkDepth } from "./weather";

describe("Weather API Integration", () => {
  it("should fetch NOAA weather data for Istanbul", async () => {
    const weather = await fetchNOAAWeather(41.0082, 28.9784);
    
    expect(weather).not.toBeNull();
    if (weather) {
      expect(weather.latitude).toBe(41.0082);
      expect(weather.longitude).toBe(28.9784);
      expect(weather.windSpeed).toBeGreaterThanOrEqual(0);
      expect(weather.windDirection).toBeGreaterThanOrEqual(0);
      expect(weather.windDirection).toBeLessThanOrEqual(360);
      expect(weather.source).toContain("Open-Meteo");
    }
  }, 15000); // 15 saniye timeout - API çağrısı için

  it("should fetch marine weather data for Mediterranean", async () => {
    const weather = await fetchMarineWeather(40.0, 20.0);
    
    expect(weather).not.toBeNull();
    if (weather) {
      expect(weather.waveHeight).toBeGreaterThanOrEqual(0);
      expect(weather.currentSpeed).toBeGreaterThanOrEqual(0);
    }
  }, 15000);

  it("should fetch combined weather data", async () => {
    const weather = await fetchCombinedWeather(41.0082, 28.9784);
    
    expect(weather).not.toBeNull();
    if (weather) {
      expect(weather.windSpeed).toBeGreaterThanOrEqual(0);
      expect(weather.waveHeight).toBeGreaterThanOrEqual(0);
      expect(weather.currentSpeed).toBeGreaterThanOrEqual(0);
      expect(weather.source).toBeDefined();
    }
  }, 15000);

  it("should check depth correctly", () => {
    // Akdeniz - derin deniz
    const deepSeaDepth = checkDepth(40.0, 20.0);
    expect(deepSeaDepth).toBeGreaterThan(0);
    
    // Kara (yaklaşık)
    const landDepth = checkDepth(41.0, 29.0);
    expect(landDepth).toBeGreaterThanOrEqual(0);
  });
});
