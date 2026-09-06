import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const mediaTable = pgTable("media", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  type: text("type").notNull(),
  url: text("url").notNull(),
  thumbnail: text("thumbnail"),
  altText: text("alt_text").notNull().default(""),
  albumId: integer("album_id"),
  eventId: integer("event_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InsertMedia = Omit<typeof mediaTable.$inferInsert, "id" | "createdAt">;
export type Media = typeof mediaTable.$inferSelect;