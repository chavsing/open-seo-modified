CREATE TABLE `paypal_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`product` text,
	`status` text NOT NULL,
	`amount` text NOT NULL,
	`currency` text NOT NULL,
	`payer_email` text,
	`note` text,
	`created_at` text NOT NULL,
	`handled_at` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `paypal_payments_status_idx` ON `paypal_payments` (`status`,`created_at`);