CREATE TABLE `audit_schedules` (
	`project_id` text PRIMARY KEY NOT NULL,
	`start_url` text NOT NULL,
	`interval` text NOT NULL,
	`max_pages` integer NOT NULL,
	`created_by_user_id` text NOT NULL,
	`next_run_at` text NOT NULL,
	`last_audit_id` text,
	`last_error` text,
	`notified_audit_id` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
