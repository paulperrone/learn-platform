CREATE TABLE `llm_model_config` (
	`tier` text PRIMARY KEY NOT NULL,
	`model_id` text NOT NULL,
	`cost_input_per_m` real NOT NULL,
	`cost_output_per_m` real NOT NULL,
	`updated_at` text NOT NULL
);
