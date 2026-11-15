CREATE TABLE `billing_notices` (
	`organization_id` text NOT NULL,
	`kind` text NOT NULL,
	`period_key` text NOT NULL,
	`sent_at` text NOT NULL,
	PRIMARY KEY(`organization_id`, `kind`, `period_key`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
