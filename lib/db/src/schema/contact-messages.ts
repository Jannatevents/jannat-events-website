import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const contactMessagesTable = pgTable("contact_messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  subject: text("subject").notNull(),
  inquiryType: text("inquiry_type").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("NEW"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InsertContactMessage = Omit<typeof contactMessagesTable.$inferInsert, "id" | "createdAt">;
export type ContactMessage = typeof contactMessagesTable.$inferSelect;