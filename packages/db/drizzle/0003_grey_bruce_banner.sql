CREATE TABLE "scan_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"qr_code_id" uuid NOT NULL,
	"day" text NOT NULL,
	"scans" integer NOT NULL,
	"uniques" integer NOT NULL,
	"by_device" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"by_country" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scan_daily" ADD CONSTRAINT "scan_daily_qr_code_id_qr_codes_id_fk" FOREIGN KEY ("qr_code_id") REFERENCES "public"."qr_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scan_daily_code_day" ON "scan_daily" USING btree ("qr_code_id","day");