CREATE TABLE `report_branding` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`company_name` text NOT NULL,
	`website_url` text,
	`logo_data_url` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
