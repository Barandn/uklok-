import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  ports: router({
    list: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(100) }).optional())
      .query(async ({ input }) => {
        const { listPorts } = await import("./db");
        return await listPorts(input?.limit ?? 50);
      }),

    search: publicProcedure
      .input(
        z.object({
          query: z.string().min(2),
          limit: z.number().min(1).max(50).default(20),
        })
      )
      .query(async ({ input }) => {
        const { searchPorts } = await import("./db");
        return await searchPorts(input.query, input.limit);
      }),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Gemiler (Vessels)
  vessels: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getVesselsByUserId } = await import("./db");
      return await getVesselsByUserId(ctx.user.id);
    }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getVesselById } = await import("./db");
        return await getVesselById(input.id);
      }),
    
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        vesselType: z.string(),
        dwt: z.number(),
        gt: z.number().optional(),
        length: z.number().optional(),
        beam: z.number().optional(),
        draft: z.number().optional(),
        serviceSpeed: z.number(),
        maxSpeed: z.number().optional(),
        fuelType: z.enum(["HFO", "LFO", "MGO", "MDO", "LNG", "Methanol"]),
        fuelConsumptionRate: z.number().optional(),
        enginePower: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createVessel } = await import("./db");
        return await createVessel({
          ...input,
          userId: ctx.user.id,
        });
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteVessel } = await import("./db");
        return await deleteVessel(input.id);
      }),
  }),

  // Rotalar (Routes)
  routes: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getRoutesByUserId } = await import("./db");
      return await getRoutesByUserId(ctx.user.id);
    }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getRouteById, getWaypointsByRouteId } = await import("./db");
        const route = await getRouteById(input.id);
        if (!route) return null;
        
        const waypoints = await getWaypointsByRouteId(input.id);
        return { ...route, waypoints };
      }),
  }),

  // Optimizasyon
  optimization: router({
    // Basit rota (hızlı)
    runSimple: protectedProcedure
      .input(z.object({
        vesselId: z.number(),
        startLat: z.number(),
        startLon: z.number(),
        endLat: z.number(),
        endLon: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getVesselById, createRoute, createWaypoints } = await import("./db");
        const { createSimpleRoute } = await import("./simple-route");
        const { DigitalTwin } = await import("./vessel-performance");
        
        const vessel = await getVesselById(input.vesselId);
        if (!vessel) throw new Error("Vessel not found");

        const digitalTwin = new DigitalTwin({
          dwt: vessel.dwt,
          length: vessel.length || 200,
          beam: vessel.beam || 30,
          draft: vessel.draft || 10,
          serviceSpeed: vessel.serviceSpeed,
          fuelType: vessel.fuelType,
          fuelConsumptionRate: vessel.fuelConsumptionRate || 50,
          enginePower: vessel.enginePower || 10000,
        });
        
        const result = await createSimpleRoute(
          input.startLat,
          input.startLon,
          input.endLat,
          input.endLon,
          digitalTwin
        );
        
        // Rotayı kaydet
        const routeResult = await createRoute({
          userId: ctx.user.id,
          vesselId: input.vesselId,
          name: `${input.startLat.toFixed(2)},${input.startLon.toFixed(2)} to ${input.endLat.toFixed(2)},${input.endLon.toFixed(2)}`,
          startLat: input.startLat.toString(),
          startLon: input.startLon.toString(),
          endLat: input.endLat.toString(),
          endLon: input.endLon.toString(),
          algorithm: 'GREAT_CIRCLE',
          totalDistance: Math.round(result.totalDistance),
          estimatedDuration: Math.round(result.totalDuration),
          totalFuelConsumption: Math.round(result.totalFuel),
          totalCO2Emission: Math.round(result.totalCO2),
        });
        
        const routeId = Number((routeResult as any)[0]?.insertId || 1);
        
        // Waypoint'leri kaydet
        const waypointData = result.path.map((p, idx) => ({
          routeId,
          sequence: idx,
          latitude: p.lat.toString(),
          longitude: p.lon.toString(),
        }));
        
        await createWaypoints(waypointData);
        
        return { ...result, routeId };
      }),
    
    runGenetic: protectedProcedure
      .input(z.object({
        vesselId: z.number(),
        startLat: z.number(),
        startLon: z.number(),
        endLat: z.number(),
        endLon: z.number(),
        populationSize: z.number().default(50),
        generations: z.number().default(100),
        weatherEnabled: z.boolean().default(true),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getVesselById, createRoute, createWaypoints } = await import("./db");
        const { runGeneticOptimization } = await import("./genetic-algorithm");
        const { DigitalTwin } = await import("./vessel-performance");
        
        const vessel = await getVesselById(input.vesselId);
        if (!vessel) throw new Error("Vessel not found");
        
        const digitalTwin = new DigitalTwin({
          dwt: vessel.dwt,
          length: vessel.length || 200,
          beam: vessel.beam || 30,
          draft: vessel.draft || 10,
          serviceSpeed: vessel.serviceSpeed,
          fuelType: vessel.fuelType,
          fuelConsumptionRate: vessel.fuelConsumptionRate || 50,
          enginePower: vessel.enginePower || 10000,
        });

        // Draft + güvenlik payı kadar minimum derinlik
        const minDepthMeters = Math.max(20, (digitalTwin.vessel.draft || 10) * 2);

        const result = await runGeneticOptimization({
          startLat: input.startLat,
          startLon: input.startLon,
          endLat: input.endLat,
          endLon: input.endLon,
          vessel: digitalTwin,
          populationSize: Math.min(input.populationSize, 20), // Maks 20
          generations: Math.min(input.generations, 15), // Maks 15
          mutationRate: 0.2,
          crossoverRate: 0.8,
          eliteCount: 2,
          numWaypoints: 6, // Daha az waypoint
          weatherEnabled: false, // Hızlı test için kapalı
          avoidShallowWater: true, // Sığ su ve kara filtresi aktif
          minDepth: minDepthMeters,
        });
        
        // Rotayı kaydet
        const routeResult = await createRoute({
          userId: ctx.user.id,
          vesselId: input.vesselId,
          name: `Genetic Route ${new Date().toISOString()}`,
          startLat: input.startLat.toString(),
          startLon: input.startLon.toString(),
          endLat: input.endLat.toString(),
          endLon: input.endLon.toString(),
          algorithm: "GENETIC",
          totalDistance: Math.round(result.totalDistance),
          estimatedDuration: Math.round(result.totalDuration),
          totalFuelConsumption: Math.round(result.totalFuel * 100),
          totalCO2Emission: Math.round(result.totalCO2 * 100),
        });
        
        const routeId = Number((routeResult as any)[0]?.insertId || 1);
        
        const waypointData = result.path.map((p, idx) => ({
          routeId,
          sequence: idx,
          latitude: p.lat.toString(),
          longitude: p.lon.toString(),
        }));
        
        await createWaypoints(waypointData);
        
        return { ...result, routeId };
      }),
  }),

  // Simülasyonlar
  simulations: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getSimulationsByUserId } = await import("./db");
      return await getSimulationsByUserId(ctx.user.id);
    }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getSimulationById } = await import("./db");
        return await getSimulationById(input.id);
      }),
  }),
});

export type AppRouter = typeof appRouter;
