CREATE TABLE `auth_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`challenge` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pending_intents` (
	`correlation_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`type` text NOT NULL,
	`intent` text NOT NULL,
	`policy` text,
	`grant_id` text,
	`grant_label` text,
	`grant_token_ciphertext` text,
	`grant_token_hash` text,
	`grant_expires_at` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pending_intents_user_idx` ON `pending_intents` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `passkey_public_key_cose` text NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `passkey_counter` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `passkey_transports` text;