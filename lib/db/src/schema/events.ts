import { date, boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const eventsTable = pgTable("events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  date: date("date", { mode: "string" }).notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time"),
  venue: text("venue").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  province: text("province").notNull(),
  country: text("country").notNull().default("CA"),
  description: text("description").notNull(),
  poster: text("poster"),
  ticketUrl: text("ticket_url"),
  instagramUrl: text("instagram_url"),
  status: text("status").notNull().default("DRAFT"),
  featured: boolean("featured").notNull().default(false),
  ageRestriction: text("age_restriction"),
  dressCode: text("dress_code"),
  organizer: text("organizer"),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type InsertEvent = Omit<typeof eventsTable.$inferInsert, "id" | "createdAt" | "updatedAt">;
export type Event = typeof eventsTable.$inferSelect;