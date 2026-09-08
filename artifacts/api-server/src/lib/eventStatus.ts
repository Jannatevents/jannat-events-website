import { eq, ne } from "drizzle-orm";
import { db, eventsTable } from "@workspace/db";

const CITY_TIME_ZONES: Record<string, string> = {
  toronto: "America/Toronto",
  ottawa: "America/Toronto",
  montreal: "America/Toronto",
  montréal: "America/Toronto",
  vancouver: "America/Vancouver",
  victoria: "America/Vancouver",
  calgary: "America/Edmonton",
  edmonton: "America/Edmonton",
  winnipeg: "America/Winnipeg",
  regina: "America/Regina",
  saskatoon: "America/Regina",
  halifax: "America/Halifax",
  moncton: "America/Moncton",
  "st johns": "America/St_Johns",
  "st john's": "America/St_Johns",
  "new york": "America/New_York",
  miami: "America/New_York",
  atlanta: "America/New_York",
  boston: "America/New_York",
  chicago: "America/Chicago",
  dallas: "America/Chicago",
  houston: "America/Chicago",
  denver: "America/Denver",
  phoenix: "America/Phoenix",
  "los angeles": "America/Los_Angeles",
  "san francisco": "America/Los_Angeles",
  seattle: "America/Los_Angeles",
};

const REGION_TIME_ZONES: Record<string, string> = {
  ON: "America/Toronto",
  QC: "America/Toronto",
  BC: "America/Vancouver",
  AB: "America/Edmonton",
  MB: "America/Winnipeg",
  SK: "America/Regina",
  NS: "America/Halifax",
  NB: "America/Moncton",
  PE: "America/Halifax",
  NL: "America/St_Johns",
  YT: "America/Whitehorse",
  NT: "America/Yellowknife",
  NU: "America/Iqaluit",
  NY: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  MA: "America/New_York",
  IL: "America/Chicago",
  TX: "America/Chicago",
  CO: "America/Denver",
  AZ: "America/Phoenix",
  CA: "America/Los_Angeles",
  WA: "America/Los_Angeles",
};

function timeZoneForEvent(city: string, province: string) {
  const cityKey = city.trim().toLocaleLowerCase("en-CA").replace(/[.,]/g, "");
  return CITY_TIME_ZONES[cityKey] || REGION_TIME_ZONES[province.trim().toUpperCase()] || "UTC";
}

function localDateTime(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function nextDate(date: string) {
  const next = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function hasPassed(event: typeof eventsTable.$inferSelect, now = new Date()) {
  const endTime = event.endTime || event.startTime;
  const endDate = event.endTime && event.endTime <= event.startTime ? nextDate(event.date) : event.date.slice(0, 10);
  const eventEnd = `${endDate}T${endTime.slice(0, 5)}`;
  return localDateTime(timeZoneForEvent(event.city, event.province), now) >= eventEnd;
}

export async function refreshPastEvents() {
  const scheduled = await db.select().from(eventsTable).where(ne(eventsTable.status, "DRAFT"));
  const updates = scheduled.filter((event) => {
    const nextStatus = hasPassed(event) ? "PAST" : "UPCOMING";
    return event.status !== nextStatus;
  });
  await Promise.all(updates.map((event) => db.update(eventsTable).set({
    status: hasPassed(event) ? "PAST" : "UPCOMING",
    updatedAt: new Date(),
  }).where(eq(eventsTable.id, event.id))));
}