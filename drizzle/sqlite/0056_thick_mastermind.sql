CREATE TABLE `billing_accounts` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`plan_id` text DEFAULT 'free' NOT NULL,
	`plan_status` text DEFAULT 'active' NOT NULL,
	`current_period_end` text,
	`canceled_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `credit_balances` (
	`organization_id` text NOT NULL,
	`pool` text NOT NULL,
	`granted` integer DEFAULT 0 NOT NULL,
	`remaining` integer DEFAULT 0 NOT NULL,
	`next_reset_at` text,
	PRIMARY KEY(`organization_id`, `pool`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `credit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`pool` text NOT NULL,
	`credits` integer NOT NULL,
	`credit_feature` text,
	`paths` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `credit_events_org_created_idx` ON `credit_events` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `credit_holds` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`pool` text NOT NULL,
	`credits` integer NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `credit_holds_expires_at_idx` ON `credit_holds` (`expires_at`);