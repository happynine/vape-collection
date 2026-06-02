import { sql } from "drizzle-orm";
import { pgTable, serial, varchar, integer, timestamp, text, index } from "drizzle-orm/pg-core";

export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const brands = pgTable(
  "brands",
  {
    id: serial().primaryKey(),
    name_en: varchar("name_en", { length: 255 }).notNull(),
    name_cn: varchar("name_cn", { length: 255 }),
    url: varchar("url", { length: 500 }).notNull(),
    logo_key: varchar("logo_key", { length: 500 }),
    region: varchar("region", { length: 50 }).default("全球"),
    level: integer("level").default(3),
    is_published: integer("is_published").default(1).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("brands_name_en_idx").on(table.name_en),
    index("brands_region_idx").on(table.region),
    index("brands_is_published_idx").on(table.is_published),
  ]
);
