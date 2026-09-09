import { boolean, date, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const albumsTable = pgTable("albums", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  coverImage: text("cover_image"),
  albumDate: date("album_date", { mode: "string" }),
  driveUrl: text("drive_url"),
  eventId: integer("event_id"),
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InsertAlbum = Omit<typeof albumsTable.$inferInsert, "id" | "createdAt">;
export type Album = typeof albumsTable.$inferSelect;