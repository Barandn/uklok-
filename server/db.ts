import fs from "fs/promises";
import path from "path";
import { asc, eq, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { TRPCError } from "@trpc/server";
import {
  InsertUser,
  users,
  ports,
  vessels,
  InsertVessel,
  routes,
  InsertRoute,
  waypoints,
  InsertWaypoint,
  simulations,
  InsertSimulation,
  type Port
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let cachedStaticPorts: Port[] | null = null;
const staticPortsPath = path.resolve(process.cwd(), "server/data/ports.json");

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function loadStaticPorts(): Promise<Port[]> {
  if (cachedStaticPorts) return cachedStaticPorts;

  try {
    const fileContents = await fs.readFile(staticPortsPath, "utf-8");
    const records = JSON.parse(fileContents) as Array<
      Pick<Port, "name" | "country" | "code" | "latitude" | "longitude">
    >;

    cachedStaticPorts = records
      .map((port, index) => ({
        id: index + 1,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        ...port,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return cachedStaticPorts;
  } catch (error) {
    console.error("[Ports] Failed to load static port data:", error);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Port data unavailable" });
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Liman İşlemleri
 */
export async function listPorts(limit = 50) {
  const safeLimit = clamp(limit, 1, 1000);

  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Database] listPorts falling back to static data: database not available");
      const staticPorts = await loadStaticPorts();
      return staticPorts.slice(0, safeLimit);
    }

    return await db.select().from(ports).orderBy(asc(ports.name)).limit(safeLimit);
  } catch (error) {
    console.error("[Database] listPorts failed, falling back to static data:", error);
    const staticPorts = await loadStaticPorts();
    return staticPorts.slice(0, safeLimit);
  }
}

export async function searchPorts(query: string, limit = 20) {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) return [];

  const safeLimit = clamp(limit, 1, 50);
  const likeQuery = `%${trimmedQuery}%`;

  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Database] searchPorts falling back to static data: database not available");
      const staticPorts = await loadStaticPorts();
      return staticPorts
        .filter((port) => {
          const lowerQuery = trimmedQuery.toLowerCase();
          return (
            port.name.toLowerCase().includes(lowerQuery) ||
            port.country.toLowerCase().includes(lowerQuery) ||
            port.code.toLowerCase().includes(lowerQuery)
          );
        })
        .slice(0, safeLimit);
    }

    return await db
      .select()
      .from(ports)
      .where(
        or(
          like(ports.name, likeQuery),
          like(ports.country, likeQuery),
          like(ports.code, likeQuery)
        )
      )
      .orderBy(asc(ports.name))
      .limit(safeLimit);
  } catch (error) {
    console.error("[Database] searchPorts failed, falling back to static data:", error);
    const staticPorts = await loadStaticPorts();
    return staticPorts
      .filter((port) => {
        const lowerQuery = trimmedQuery.toLowerCase();
        return (
          port.name.toLowerCase().includes(lowerQuery) ||
          port.country.toLowerCase().includes(lowerQuery) ||
          port.code.toLowerCase().includes(lowerQuery)
        );
      })
      .slice(0, safeLimit);
  }
}

/**
 * Gemi İşlemleri
 */
export async function createVessel(vessel: InsertVessel) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(vessels).values(vessel);
  return result;
}

export async function getVesselsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(vessels).where(eq(vessels.userId, userId));
}

export async function getVesselById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(vessels).where(eq(vessels.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateVessel(id: number, data: Partial<InsertVessel>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.update(vessels).set(data).where(eq(vessels.id, id));
}

export async function deleteVessel(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.delete(vessels).where(eq(vessels.id, id));
}

/**
 * Rota İşlemleri
 */
export async function createRoute(route: InsertRoute) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(routes).values(route);
  return result;
}

export async function getRoutesByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(routes).where(eq(routes.userId, userId));
}

export async function getRouteById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(routes).where(eq(routes.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Waypoint İşlemleri
 */
export async function createWaypoints(waypointsList: InsertWaypoint[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.insert(waypoints).values(waypointsList);
}

export async function getWaypointsByRouteId(routeId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(waypoints)
    .where(eq(waypoints.routeId, routeId))
    .orderBy(waypoints.sequence);
}

/**
 * Simülasyon İşlemleri
 */
export async function createSimulation(simulation: InsertSimulation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(simulations).values(simulation);
  return result;
}

export async function getSimulationsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(simulations)
    .where(eq(simulations.userId, userId))
    .orderBy(simulations.createdAt);
}

export async function getSimulationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(simulations).where(eq(simulations.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateSimulation(id: number, data: Partial<InsertSimulation>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.update(simulations).set(data).where(eq(simulations.id, id));
}
