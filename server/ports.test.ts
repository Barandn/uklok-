import { beforeEach, describe, expect, it, vi } from "vitest";

// Reset module cache between tests to avoid sharing static data
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  delete process.env.DATABASE_URL;
});

describe("ports fallback data", () => {
  it("returns static ports when database is unavailable", async () => {
    const { listPorts } = await import("./db");

    const result = await listPorts(3);

    expect(result).toHaveLength(3);
    expect(result[0]).toHaveProperty("name");
    expect(result[0]).toHaveProperty("country");
    expect(result[0]).toHaveProperty("code");
  });

  it("searches static ports when database is unavailable", async () => {
    const { searchPorts } = await import("./db");

    const result = await searchPorts("an", 5);

    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(5);
    const allMatch = result.every((port) => {
      const query = "an";
      const lowerQuery = query.toLowerCase();
      return (
        port.name.toLowerCase().includes(lowerQuery) ||
        port.country.toLowerCase().includes(lowerQuery) ||
        port.code.toLowerCase().includes(lowerQuery)
      );
    });
    expect(allMatch).toBe(true);
  });
});
