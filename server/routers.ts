import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";

// Default gemi tipleri (in-memory)
const defaultVessels = [
  {
    id: 1,
    name: "Default Container Ship",
    vesselType: "Container",
    dwt: 50000,
    gt: 40000,
    length: 200,
    beam: 32,
    draft: 12,
    serviceSpeed: 14,
    maxSpeed: 18,
    fuelType: "HFO" as const,
    fuelConsumptionRate: 50,
    enginePower: 15000,
  },
  {
    id: 2,
    name: "Default Tanker",
    vesselType: "Tanker",
    dwt: 80000,
    gt: 60000,
    length: 250,
    beam: 40,
    draft: 14,
    serviceSpeed: 12,
    maxSpeed: 16,
    fuelType: "HFO" as const,
    fuelConsumptionRate: 65,
    enginePower: 18000,
  },
  {
    id: 3,
    name: "Default Bulk Carrier",
    vesselType: "Bulk Carrier",
    dwt: 70000,
    gt: 50000,
    length: 230,
    beam: 36,
    draft: 13,
    serviceSpeed: 13,
    maxSpeed: 15,
    fuelType: "LFO" as const,
    fuelConsumptionRate: 55,
    enginePower: 12000,
  },
];

// Gemi şeması
const vesselSchema = z.object({
  name: z.string().default("Custom Vessel"),
  vesselType: z.string().default("Container"),
  dwt: z.number().default(50000),
  gt: z.number().optional(),
  length: z.number().default(200),
  beam: z.number().default(30),
  draft: z.number().default(10),
  serviceSpeed: z.number().default(14),
  maxSpeed: z.number().optional(),
  fuelType: z.enum(["HFO", "LFO", "MGO", "MDO", "LNG", "Methanol"]).default("HFO"),
  fuelConsumptionRate: z.number().default(50),
  enginePower: z.number().default(10000),
});

export const appRouter = router({
  system: systemRouter,

  // Limanlar - Static JSON'dan
  ports: router({
    list: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(1000) }).optional())
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

  // Auth - Basitleştirilmiş (guest mode)
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Gemiler - In-Memory (DB'ye kaydetmiyor)
  vessels: router({
    // Default gemi listesi
    list: publicProcedure.query(() => {
      return defaultVessels;
    }),

    // ID'ye göre default gemi getir
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => {
        const vessel = defaultVessels.find(v => v.id === input.id);
        return vessel || defaultVessels[0];
      }),

    // Create - sadece geçici olarak döndürür (kaydetmez)
    create: publicProcedure
      .input(vesselSchema)
      .mutation(({ input }) => {
        // Geçici ID oluştur
        const tempId = Date.now();
        return {
          id: tempId,
          ...input,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }),

    // Delete - no-op (kayıtlı bir şey yok zaten)
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(() => {
        return { success: true };
      }),
  }),

  // Rotalar - Sadece anlık hesaplama (DB'ye kaydetmiyor)
  routes: router({
    // Boş liste döndür (kayıtlı rota yok)
    list: publicProcedure.query(() => {
      return [];
    }),

    // Kayıtlı rota yok
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(() => {
        return null;
      }),
  }),

  // Optimizasyon - Tamamen anlık hesaplama
  optimization: router({
    // Basit Great Circle rotası
    runSimple: publicProcedure
      .input(z.object({
        // Konum bilgileri
        startLat: z.number(),
        startLon: z.number(),
        endLat: z.number(),
        endLon: z.number(),
        // Gemi bilgileri (opsiyonel - default değerler kullanılır)
        vessel: vesselSchema.optional(),
      }))
      .mutation(async ({ input }) => {
        const { createSimpleRoute } = await import("./simple-route");
        const { DigitalTwin } = await import("./vessel-performance");

        // Gemi bilgilerini al veya default kullan
        const vesselData = input.vessel || defaultVessels[0];

        const digitalTwin = new DigitalTwin({
          dwt: vesselData.dwt,
          length: vesselData.length || 200,
          beam: vesselData.beam || 30,
          draft: vesselData.draft || 10,
          serviceSpeed: vesselData.serviceSpeed,
          fuelType: vesselData.fuelType,
          fuelConsumptionRate: vesselData.fuelConsumptionRate || 50,
          enginePower: vesselData.enginePower || 10000,
        });

        const result = await createSimpleRoute(
          input.startLat,
          input.startLon,
          input.endLat,
          input.endLon,
          digitalTwin
        );

        // Anlık sonuç döndür (DB'ye kaydetmeden)
        return {
          ...result,
          algorithm: 'GREAT_CIRCLE',
          vessel: vesselData,
          calculatedAt: new Date().toISOString(),
        };
      }),

    // Genetik algoritma optimizasyonu
    runGenetic: publicProcedure
      .input(z.object({
        // Konum bilgileri
        startLat: z.number(),
        startLon: z.number(),
        endLat: z.number(),
        endLon: z.number(),
        // Gemi bilgileri (opsiyonel)
        vessel: vesselSchema.optional(),
        // Algoritma parametreleri
        populationSize: z.number().min(5).max(100).default(20),
        generations: z.number().min(5).max(50).default(15),
        weatherEnabled: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        const { runGeneticOptimization } = await import("./genetic-algorithm");
        const { DigitalTwin } = await import("./vessel-performance");

        // Gemi bilgilerini al veya default kullan
        const vesselData = input.vessel || defaultVessels[0];

        const digitalTwin = new DigitalTwin({
          dwt: vesselData.dwt,
          length: vesselData.length || 200,
          beam: vesselData.beam || 30,
          draft: vesselData.draft || 10,
          serviceSpeed: vesselData.serviceSpeed,
          fuelType: vesselData.fuelType,
          fuelConsumptionRate: vesselData.fuelConsumptionRate || 50,
          enginePower: vesselData.enginePower || 10000,
        });

        // Draft + güvenlik payı kadar minimum derinlik
        const minDepthMeters = Math.max(20, (digitalTwin.vessel.draft || 10) * 2);

        const result = await runGeneticOptimization({
          startLat: input.startLat,
          startLon: input.startLon,
          endLat: input.endLat,
          endLon: input.endLon,
          vessel: digitalTwin,
          populationSize: Math.min(input.populationSize, 50),
          generations: Math.min(input.generations, 30),
          mutationRate: 0.2,
          crossoverRate: 0.8,
          eliteCount: 2,
          numWaypoints: 6,
          weatherEnabled: input.weatherEnabled,
          avoidShallowWater: true,
          minDepth: minDepthMeters,
        });

        // Anlık sonuç döndür (DB'ye kaydetmeden)
        return {
          ...result,
          algorithm: 'GENETIC',
          vessel: vesselData,
          calculatedAt: new Date().toISOString(),
        };
      }),

    // A* algoritması
    runAStar: publicProcedure
      .input(z.object({
        // Konum bilgileri
        startLat: z.number(),
        startLon: z.number(),
        endLat: z.number(),
        endLon: z.number(),
        // Gemi bilgileri (opsiyonel)
        vessel: vesselSchema.optional(),
        // Algoritma parametreleri
        gridResolution: z.number().min(0.1).max(2).default(0.5),
        weatherEnabled: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        const { runAStarOptimization } = await import("./astar-algorithm");
        const { DigitalTwin } = await import("./vessel-performance");

        // Gemi bilgilerini al veya default kullan
        const vesselData = input.vessel || defaultVessels[0];

        const digitalTwin = new DigitalTwin({
          dwt: vesselData.dwt,
          length: vesselData.length || 200,
          beam: vesselData.beam || 30,
          draft: vesselData.draft || 10,
          serviceSpeed: vesselData.serviceSpeed,
          fuelType: vesselData.fuelType,
          fuelConsumptionRate: vesselData.fuelConsumptionRate || 50,
          enginePower: vesselData.enginePower || 10000,
        });

        const result = await runAStarOptimization({
          startLat: input.startLat,
          startLon: input.startLon,
          endLat: input.endLat,
          endLon: input.endLon,
          vessel: digitalTwin,
          gridResolution: input.gridResolution,
          maxIterations: 5000,
          heuristicWeight: 1.2,
          weatherEnabled: input.weatherEnabled,
          avoidShallowWater: true,
          minDepth: Math.max(20, (digitalTwin.vessel.draft || 10) * 2),
        });

        // Anlık sonuç döndür (DB'ye kaydetmeden)
        return {
          ...result,
          algorithm: 'ASTAR',
          vessel: vesselData,
          calculatedAt: new Date().toISOString(),
        };
      }),

    // Karşılaştırmalı analiz - tüm algoritmaları çalıştır
    compare: publicProcedure
      .input(z.object({
        startLat: z.number(),
        startLon: z.number(),
        endLat: z.number(),
        endLon: z.number(),
        vessel: vesselSchema.optional(),
      }))
      .mutation(async ({ input }) => {
        const { createSimpleRoute } = await import("./simple-route");
        const { runGeneticOptimization } = await import("./genetic-algorithm");
        const { DigitalTwin } = await import("./vessel-performance");

        const vesselData = input.vessel || defaultVessels[0];

        const digitalTwin = new DigitalTwin({
          dwt: vesselData.dwt,
          length: vesselData.length || 200,
          beam: vesselData.beam || 30,
          draft: vesselData.draft || 10,
          serviceSpeed: vesselData.serviceSpeed,
          fuelType: vesselData.fuelType,
          fuelConsumptionRate: vesselData.fuelConsumptionRate || 50,
          enginePower: vesselData.enginePower || 10000,
        });

        const minDepthMeters = Math.max(20, (digitalTwin.vessel.draft || 10) * 2);

        // Paralel olarak çalıştır
        const [simpleResult, geneticResult] = await Promise.all([
          createSimpleRoute(
            input.startLat,
            input.startLon,
            input.endLat,
            input.endLon,
            digitalTwin
          ),
          runGeneticOptimization({
            startLat: input.startLat,
            startLon: input.startLon,
            endLat: input.endLat,
            endLon: input.endLon,
            vessel: digitalTwin,
            populationSize: 20,
            generations: 15,
            mutationRate: 0.2,
            crossoverRate: 0.8,
            eliteCount: 2,
            numWaypoints: 6,
            weatherEnabled: false,
            avoidShallowWater: true,
            minDepth: minDepthMeters,
          }),
        ]);

        return {
          greatCircle: { ...simpleResult, algorithm: 'GREAT_CIRCLE' },
          genetic: { ...geneticResult, algorithm: 'GENETIC' },
          vessel: vesselData,
          comparison: {
            distanceDiff: geneticResult.totalDistance - simpleResult.totalDistance,
            fuelSaving: simpleResult.totalFuel - geneticResult.totalFuel,
            co2Saving: simpleResult.totalCO2 - geneticResult.totalCO2,
            timeDiff: geneticResult.totalDuration - simpleResult.totalDuration,
          },
          calculatedAt: new Date().toISOString(),
        };
      }),
  }),

  // Simülasyonlar - Boş (DB olmadan anlamsız)
  simulations: router({
    list: publicProcedure.query(() => {
      return [];
    }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(() => {
        return null;
      }),
  }),
});

export type AppRouter = typeof appRouter;
