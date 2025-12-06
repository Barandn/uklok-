CREATE TABLE `routes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`vesselId` int,
	`name` varchar(255) NOT NULL,
	`startLat` varchar(50) NOT NULL,
	`startLon` varchar(50) NOT NULL,
	`endLat` varchar(50) NOT NULL,
	`endLon` varchar(50) NOT NULL,
	`algorithm` enum('ASTAR','GENETIC','HYBRID','GREAT_CIRCLE') NOT NULL,
	`totalDistance` int,
	`estimatedDuration` int,
	`totalFuelConsumption` int,
	`totalCO2Emission` int,
	`ciiScore` varchar(10),
	`ciiValue` varchar(50),
	`weatherConditions` text,
	`optimizationParams` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `routes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `simulations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`vesselId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`startLat` varchar(50) NOT NULL,
	`startLon` varchar(50) NOT NULL,
	`endLat` varchar(50) NOT NULL,
	`endLon` varchar(50) NOT NULL,
	`departureTime` timestamp NOT NULL,
	`astarRouteId` int,
	`geneticRouteId` int,
	`greatCircleRouteId` int,
	`hybridRouteId` int,
	`status` enum('PENDING','RUNNING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
	`results` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `simulations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vessels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`vesselType` varchar(100) NOT NULL,
	`dwt` int NOT NULL,
	`gt` int,
	`length` int,
	`beam` int,
	`draft` int,
	`serviceSpeed` int NOT NULL,
	`maxSpeed` int,
	`fuelType` enum('HFO','LFO','MGO','MDO','LNG','Methanol') NOT NULL DEFAULT 'HFO',
	`fuelConsumptionRate` int,
	`enginePower` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vessels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `waypoints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`routeId` int NOT NULL,
	`sequence` int NOT NULL,
	`latitude` varchar(50) NOT NULL,
	`longitude` varchar(50) NOT NULL,
	`eta` timestamp,
	`speed` int,
	`heading` int,
	`fuelConsumed` int,
	`distanceFromPrev` int,
	`weatherData` text,
	CONSTRAINT `waypoints_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `weatherCache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`latitude` varchar(50) NOT NULL,
	`longitude` varchar(50) NOT NULL,
	`timestamp` timestamp NOT NULL,
	`windSpeed` int,
	`windDirection` int,
	`waveHeight` int,
	`wavePeriod` int,
	`waveDirection` int,
	`currentSpeed` int,
	`currentDirection` int,
	`seaTemp` int,
	`airTemp` int,
	`pressure` int,
	`source` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `weatherCache_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `routes` ADD CONSTRAINT `routes_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `routes` ADD CONSTRAINT `routes_vesselId_vessels_id_fk` FOREIGN KEY (`vesselId`) REFERENCES `vessels`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `simulations` ADD CONSTRAINT `simulations_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `simulations` ADD CONSTRAINT `simulations_vesselId_vessels_id_fk` FOREIGN KEY (`vesselId`) REFERENCES `vessels`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `simulations` ADD CONSTRAINT `simulations_astarRouteId_routes_id_fk` FOREIGN KEY (`astarRouteId`) REFERENCES `routes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `simulations` ADD CONSTRAINT `simulations_geneticRouteId_routes_id_fk` FOREIGN KEY (`geneticRouteId`) REFERENCES `routes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `simulations` ADD CONSTRAINT `simulations_greatCircleRouteId_routes_id_fk` FOREIGN KEY (`greatCircleRouteId`) REFERENCES `routes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `simulations` ADD CONSTRAINT `simulations_hybridRouteId_routes_id_fk` FOREIGN KEY (`hybridRouteId`) REFERENCES `routes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vessels` ADD CONSTRAINT `vessels_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waypoints` ADD CONSTRAINT `waypoints_routeId_routes_id_fk` FOREIGN KEY (`routeId`) REFERENCES `routes`(`id`) ON DELETE cascade ON UPDATE no action;