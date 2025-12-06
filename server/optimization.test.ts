import { describe, expect, it } from "vitest";
import { DigitalTwin, calculateGreatCircleDistance } from "./vessel-performance";
import { generateGreatCircleRoute } from "./astar-algorithm";

describe("Vessel Performance Model", () => {
  it("should calculate fuel consumption correctly", () => {
    const vessel = new DigitalTwin({
      dwt: 50000,
      length: 200,
      beam: 30,
      draft: 10,
      serviceSpeed: 15, // knots
      fuelType: "HFO",
      fuelConsumptionRate: 50, // tons/day
      enginePower: 10000,
    });

    const fuelRate = vessel.calculateFuelConsumption(15); // at service speed
    expect(fuelRate).toBeGreaterThan(0);
    expect(fuelRate).toBeCloseTo(50 / 24, 1); // ~2.08 tons/hour
  });

  it("should calculate segment consumption", () => {
    const vessel = new DigitalTwin({
      dwt: 50000,
      length: 200,
      beam: 30,
      draft: 10,
      serviceSpeed: 15,
      fuelType: "HFO",
      fuelConsumptionRate: 50,
      enginePower: 10000,
    });

    const result = vessel.calculateSegmentConsumption(100, 15); // 100 nm at 15 knots
    
    expect(result.fuelConsumed).toBeGreaterThan(0);
    expect(result.co2Emitted).toBeGreaterThan(0);
    expect(result.duration).toBeCloseTo(100 / 15, 1); // ~6.67 hours
    expect(result.effectiveSpeed).toBe(15);
  });

  it("should calculate CII correctly", () => {
    const vessel = new DigitalTwin({
      dwt: 50000,
      length: 200,
      beam: 30,
      draft: 10,
      serviceSpeed: 15,
      fuelType: "HFO",
      fuelConsumptionRate: 50,
      enginePower: 10000,
    });

    const cii = vessel.calculateCII(100, 1000, 50000); // 100 tons CO2, 1000 nm, 50000 DWT
    expect(cii).toBeGreaterThan(0);
    expect(cii).toBeCloseTo(2.0, 1); // gCO2/ton·nm
  });
});

describe("Great Circle Distance", () => {
  it("should calculate distance between Istanbul and Naples", () => {
    const distance = calculateGreatCircleDistance(
      41.0082, 28.9784, // Istanbul
      40.8518, 14.2681  // Naples
    );
    
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeGreaterThan(500); // At least 500 nm
    expect(distance).toBeLessThan(1500); // Less than 1500 nm
  });

  it("should return zero for same coordinates", () => {
    const distance = calculateGreatCircleDistance(
      40.0, 30.0,
      40.0, 30.0
    );
    
    expect(distance).toBeCloseTo(0, 1);
  });
});

describe("Great Circle Route Generation", () => {
  it("should generate waypoints between two points", () => {
    const route = generateGreatCircleRoute(
      41.0082, 28.9784, // Istanbul
      40.8518, 14.2681, // Naples
      10 // 10 waypoints
    );
    
    expect(route).toHaveLength(11); // 10 + start and end
    expect(route[0]).toEqual({ lat: 41.0082, lon: 28.9784 });
    expect(route[10]).toEqual({ lat: 40.8518, lon: 14.2681 });
  });
});
