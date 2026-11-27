-- Version 2: trading bots removed. SQLite can't drop a column that is part of a
-- foreign key, so `operations` is rebuilt without `bot_id` (rows are kept).
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_operations` (
	`idempotency_key` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`kind` text NOT NULL,
	`correlation_id` text,
	`status` text NOT NULL,
	`request` text NOT NULL,
	`response` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_operations`("idempotency_key", "agent_id", "kind", "correlation_id", "status", "request", "response", "created_at", "updated_at") SELECT "idempotency_key", "agent_id", "kind", "correlation_id", "status", "request", "response", "created_at", "updated_at" FROM `operations`;--> statement-breakpoint
DROP TABLE `operations`;--> statement-breakpoint
ALTER TABLE `__new_operations` RENAME TO `operations`;--> statement-breakpoint
CREATE UNIQUE INDEX `operations_correlation_idx` ON `operations` (`correlation_id`);--> statement-breakpoint
CREATE INDEX `operations_agent_idx` ON `operations` (`agent_id`);--> statement-breakpoint
DROP TABLE `bot_events`;--> statement-breakpoint
DROP TABLE `bots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
