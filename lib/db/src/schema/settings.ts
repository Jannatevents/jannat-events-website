import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const homepageSettingsTable = pgTable("homepage_settings", {
  id: integer("id").primaryKey().default(1),
  heroImage: text("hero_image"),
  heroVideo: text("hero_video"),
  heroHeadline: text("hero_headline").notNull(),
  heroSubtitle: text("hero_subtitle").notNull(),
  ctaText: text("cta_text").notNull(),
  ctaUrl: text("cta_url").notNull(),
  featuredEventId: integer("featured_event_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const siteSettingsTable = pgTable("site_settings", {
  id: integer("id").primaryKey().default(1),
  instagramUrl: text("instagram_url").notNull(),
  facebookUrl: text("facebook_url"),
  tiktokUrl: text("tiktok_url"),
  contactEmail: text("contact_email"),
  cities: text("cities").array().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type HomepageSettings = typeof homepageSettingsTable.$inferSelect;
export type SiteSettings = typeof siteSettingsTable.$inferSelect;