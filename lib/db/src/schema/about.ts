import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const aboutSettingsTable = pgTable("about_settings", {
  id: integer("id").primaryKey().default(1),
  heroEyebrow: text("hero_eyebrow").notNull(),
  heroTitle: text("hero_title").notNull(),
  introEyebrow: text("intro_eyebrow").notNull(),
  introTitle: text("intro_title").notNull(),
  introParagraphs: text("intro_paragraphs").array().notNull().default([]),
  featureImage: text("feature_image"),
  featureEyebrow: text("feature_eyebrow").notNull(),
  featureTitle: text("feature_title").notNull(),
  featureDescription: text("feature_description").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AboutSettings = typeof aboutSettingsTable.$inferSelect;