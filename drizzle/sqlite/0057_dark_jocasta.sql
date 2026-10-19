CREATE TABLE `billing_admin_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`action` text NOT NULL,
	`credits` integer,
	`admin_email` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `billing_admin_actions_org_idx` ON `billing_admin_actions` (`organization_id`,`created_at`);