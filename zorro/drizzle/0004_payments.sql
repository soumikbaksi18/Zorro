CREATE TABLE `payees` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`coin_key` text NOT NULL,
	`chain` text NOT NULL,
	`address` text NOT NULL,
	`handle` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `payees_user_idx` ON `payees` (`user_id`);--> statement-breakpoint
CREATE TABLE `payment_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`amount` text NOT NULL,
	`currency` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'open' NOT NULL,
	`pay_coin_key` text,
	`pay_amount_units` text,
	`deposit_address` text,
	`deposit_memo` text,
	`deposit_correlation_id` text,
	`deposit_expires_at` integer,
	`paid_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `payment_requests_user_idx` ON `payment_requests` (`user_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`direction` text NOT NULL,
	`kind` text NOT NULL,
	`payee_id` text,
	`schedule_id` text,
	`request_id` text,
	`counterparty` text NOT NULL,
	`coin_key` text NOT NULL,
	`amount` text NOT NULL,
	`fund_coin_key` text NOT NULL,
	`fund_amount` text,
	`usd_value` real,
	`inr_value` real,
	`fee_usd` real,
	`zec_usd` real,
	`reference` text,
	`note` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`state` text DEFAULT '{}' NOT NULL,
	`error` text,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `payments_user_idx` ON `payments` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payments_status_idx` ON `payments` (`status`);--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`payee_id` text NOT NULL,
	`coin_key` text NOT NULL,
	`amount` text NOT NULL,
	`currency` text NOT NULL,
	`frequency` text NOT NULL,
	`day` integer NOT NULL,
	`note` text,
	`status` text DEFAULT 'active' NOT NULL,
	`next_run_at` integer NOT NULL,
	`last_run_at` integer,
	`warned_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`payee_id`) REFERENCES `payees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `schedules_due_idx` ON `schedules` (`status`,`next_run_at`);--> statement-breakpoint
ALTER TABLE `operations` ADD `payment_id` text;--> statement-breakpoint
ALTER TABLE `pending_intents` ADD `meta` text;--> statement-breakpoint
ALTER TABLE `users` ADD `handle` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);