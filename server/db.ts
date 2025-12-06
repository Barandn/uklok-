import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, 
  users, 
  vessels, 
  InsertVessel,
  routes,
  InsertRoute,
  waypoints,
  InsertWaypoint,
  simulations,
  InsertSimulation
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

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
