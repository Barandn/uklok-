import { double, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Limanlar tablosu - UN/LOCODE bilgileri ve koordinatlar
 */
export const ports = mysqlTable(
  "ports",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    country: varchar("country", { length: 120 }).notNull(),
    code: varchar("code", { length: 10 }).notNull(),
    latitude: double("latitude").notNull(),
    longitude: double("longitude").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    codeIdx: uniqueIndex("ports_code_idx").on(table.code),
    nameIdx: index("ports_name_idx").on(table.name),
    countryIdx: index("ports_country_idx").on(table.country),
  })
);

export type Port = typeof ports.$inferSelect;
export type InsertPort = typeof ports.$inferInsert;

/**
 * Gemiler tablosu - gemi özellikleri ve performans parametreleri
 */
export const vessels = mysqlTable("vessels", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  vesselType: varchar("vesselType", { length: 100 }).notNull(), // Container, Tanker, Bulk Carrier, etc.
  dwt: int("dwt").notNull(), // Deadweight Tonnage
  gt: int("gt"), // Gross Tonnage
  length: int("length"), // meters
  beam: int("beam"), // meters
  draft: int("draft"), // meters (su çekimi)
  serviceSpeed: int("serviceSpeed").notNull(), // knots (servis hızı)
  maxSpeed: int("maxSpeed"), // knots
  fuelType: mysqlEnum("fuelType", ["HFO", "LFO", "MGO", "MDO", "LNG", "Methanol"]).default("HFO").notNull(),
  fuelConsumptionRate: int("fuelConsumptionRate"), // tons per day at service speed
  enginePower: int("enginePower"), // kW (MCR - Maximum Continuous Rating)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Vessel = typeof vessels.$inferSelect;
export type InsertVessel = typeof vessels.$inferInsert;

/**
 * Rotalar tablosu - optimize edilmiş rota kayıtları
 */
export const routes = mysqlTable("routes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  vesselId: int("vesselId").references(() => vessels.id),
  name: varchar("name", { length: 255 }).notNull(),
  startLat: varchar("startLat", { length: 50 }).notNull(),
  startLon: varchar("startLon", { length: 50 }).notNull(),
  endLat: varchar("endLat", { length: 50 }).notNull(),
  endLon: varchar("endLon", { length: 50 }).notNull(),
  algorithm: mysqlEnum("algorithm", ["ASTAR", "GENETIC", "HYBRID", "GREAT_CIRCLE"]).notNull(),
  totalDistance: int("totalDistance"), // nautical miles
  estimatedDuration: int("estimatedDuration"), // hours
  totalFuelConsumption: int("totalFuelConsumption"), // tons
  totalCO2Emission: int("totalCO2Emission"), // tons
  ciiScore: varchar("ciiScore", { length: 10 }), // A, B, C, D, E
  ciiValue: varchar("ciiValue", { length: 50 }), // Attained CII value
  weatherConditions: text("weatherConditions"), // JSON string of weather summary
  optimizationParams: text("optimizationParams"), // JSON string of optimization parameters
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Route = typeof routes.$inferSelect;
export type InsertRoute = typeof routes.$inferInsert;

/**
 * Waypoint'ler tablosu - rota üzerindeki ara noktalar
 */
export const waypoints = mysqlTable("waypoints", {
  id: int("id").autoincrement().primaryKey(),
  routeId: int("routeId").notNull().references(() => routes.id, { onDelete: "cascade" }),
  sequence: int("sequence").notNull(), // waypoint sırası
  latitude: varchar("latitude", { length: 50 }).notNull(),
  longitude: varchar("longitude", { length: 50 }).notNull(),
  eta: timestamp("eta"), // Estimated Time of Arrival
  speed: int("speed"), // knots
  heading: int("heading"), // degrees (0-360)
  fuelConsumed: int("fuelConsumed"), // tons (bu noktaya kadar)
  distanceFromPrev: int("distanceFromPrev"), // nautical miles
  weatherData: text("weatherData"), // JSON string of weather at this point
});

export type Waypoint = typeof waypoints.$inferSelect;
export type InsertWaypoint = typeof waypoints.$inferInsert;

/**
 * Simülasyonlar tablosu - karşılaştırmalı simülasyon sonuçları
 */
export const simulations = mysqlTable("simulations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  vesselId: int("vesselId").notNull().references(() => vessels.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  startLat: varchar("startLat", { length: 50 }).notNull(),
  startLon: varchar("startLon", { length: 50 }).notNull(),
  endLat: varchar("endLat", { length: 50 }).notNull(),
  endLon: varchar("endLon", { length: 50 }).notNull(),
  departureTime: timestamp("departureTime").notNull(),
  astarRouteId: int("astarRouteId").references(() => routes.id),
  geneticRouteId: int("geneticRouteId").references(() => routes.id),
  greatCircleRouteId: int("greatCircleRouteId").references(() => routes.id),
  hybridRouteId: int("hybridRouteId").references(() => routes.id),
  status: mysqlEnum("status", ["PENDING", "RUNNING", "COMPLETED", "FAILED"]).default("PENDING").notNull(),
  results: text("results"), // JSON string of comparison results
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type Simulation = typeof simulations.$inferSelect;
export type InsertSimulation = typeof simulations.$inferInsert;

/**
 * Hava durumu önbellek tablosu - METOC verilerini cache'lemek için
 */
export const weatherCache = mysqlTable("weatherCache", {
  id: int("id").autoincrement().primaryKey(),
  latitude: varchar("latitude", { length: 50 }).notNull(),
  longitude: varchar("longitude", { length: 50 }).notNull(),
  timestamp: timestamp("timestamp").notNull(),
  windSpeed: int("windSpeed"), // m/s * 100 (2 decimal precision)
  windDirection: int("windDirection"), // degrees
  waveHeight: int("waveHeight"), // meters * 100
  wavePeriod: int("wavePeriod"), // seconds * 100
  waveDirection: int("waveDirection"), // degrees
  currentSpeed: int("currentSpeed"), // m/s * 100
  currentDirection: int("currentDirection"), // degrees
  seaTemp: int("seaTemp"), // celsius * 100
  airTemp: int("airTemp"), // celsius * 100
  pressure: int("pressure"), // hPa * 100
  source: varchar("source", { length: 100 }), // NOAA, Copernicus, etc.
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WeatherCache = typeof weatherCache.$inferSelect;
export type InsertWeatherCache = typeof weatherCache.$inferInsert;
