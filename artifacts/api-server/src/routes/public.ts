import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { db, albumsTable, contactMessagesTable, eventsTable, homepageSettingsTable, mediaTable, siteSettingsTable } from "@workspace/db";
import {
  GetHomeResponse,
  GetPublicAlbumParams,
  GetPublicAlbumResponse,
  GetPublicEventParams,
  GetPublicEventResponse,
  GetPublicSiteResponse,
  ListPublicAlbumsResponse,
  ListPublicEventsQueryParams,
  ListPublicEventsResponse,
  SubmitContactBody,
  SubmitContactResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeStatus<T extends { status: string; date: string }>(event: T): T {
  if (event.status === "UPCOMING" && event.date < todayIso()) {
    return { ...event, status: "PAST" };
  }
  return event;
}

async function getAlbumMedia(albumId: number) {
  return db.select().from(mediaTable).where(eq(mediaTable.albumId, albumId)).orderBy(asc(mediaTable.sortOrder), asc(mediaTable.id));
}

async function albumWithDetails(album: typeof albumsTable.$inferSelect) {
  const [event] = album.eventId
    ? await db.select().from(eventsTable).where(eq(eventsTable.id, album.eventId)).limit(1)
    : [];
  const media = await getAlbumMedia(album.id);
  return {
    ...album,
    eventTitle: event?.title ?? null,
    city: event?.city ?? null,
    date: event?.date ?? null,
    media,
  };
}

router.get("/public/home", async (req, res): Promise<void> => {
  const [settings] = await db.select().from(homepageSettingsTable).limit(1);
  const [featured] = settings?.featuredEventId
    ? await db.select().from(eventsTable).where(eq(eventsTable.id, settings.featuredEventId)).limit(1)
    : await db.select().from(eventsTable).where(and(eq(eventsTable.featured, true), eq(eventsTable.status, "UPCOMING"))).orderBy(asc(eventsTable.date)).limit(1);
  const gallery = await db.select().from(mediaTable).where(eq(mediaTable.type, "IMAGE")).orderBy(asc(mediaTable.sortOrder), desc(mediaTable.createdAt)).limit(6);
  const payload = {
    heroImage: settings?.heroImage ?? null,
    heroVideo: settings?.heroVideo ?? null,
    heroHeadline: settings?.heroHeadline ?? "Where the night comes alive",
    heroSubtitle: settings?.heroSubtitle ?? "Unforgettable South Asian experiences, made for the moments you keep talking about.",
    ctaText: settings?.ctaText ?? "Explore events",
    ctaUrl: settings?.ctaUrl ?? "/events",
    featuredEventId: settings?.featuredEventId ?? featured?.id ?? null,
    featuredEvent: featured ? normalizeStatus(featured) : null,
    gallery,
  };
  res.json(GetHomeResponse.parse(payload));
});

router.get("/public/events", async (req, res): Promise<void> => {
  const parsed = ListPublicEventsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const filters = [eq(eventsTable.status, parsed.data.status ?? "UPCOMING")];
  if (parsed.data.city) filters.push(eq(eventsTable.city, parsed.data.city));
  const rows = await db.select().from(eventsTable).where(and(...filters)).orderBy(asc(eventsTable.date), asc(eventsTable.startTime));
  res.json(ListPublicEventsResponse.parse(rows.map(normalizeStatus)));
});

router.get("/public/events/:slug", async (req, res): Promise<void> => {
  const parsed = GetPublicEventParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [event] = await db.select().from(eventsTable).where(eq(eventsTable.slug, parsed.data.slug)).limit(1);
  if (!event || event.status === "DRAFT") {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  const gallery = await db.select().from(mediaTable).where(eq(mediaTable.eventId, event.id)).orderBy(asc(mediaTable.sortOrder), asc(mediaTable.id));
  const [album] = await db.select().from(albumsTable).where(and(eq(albumsTable.eventId, event.id), eq(albumsTable.published, true))).limit(1);
  res.json(GetPublicEventResponse.parse({ ...normalizeStatus(event), gallery, album: album ? await albumWithDetails(album) : null }));
});

router.get("/public/albums", async (_req, res): Promise<void> => {
  const albums = await db.select().from(albumsTable).where(eq(albumsTable.published, true)).orderBy(desc(albumsTable.createdAt));
  res.json(ListPublicAlbumsResponse.parse(await Promise.all(albums.map(albumWithDetails))));
});

router.get("/public/albums/:slug", async (req, res): Promise<void> => {
  const parsed = GetPublicAlbumParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [album] = await db.select().from(albumsTable).where(and(eq(albumsTable.slug, parsed.data.slug), eq(albumsTable.published, true))).limit(1);
  if (!album) {
    res.status(404).json({ error: "Album not found" });
    return;
  }
  res.json(GetPublicAlbumResponse.parse(await albumWithDetails(album)));
});

router.get("/public/site", async (_req, res): Promise<void> => {
  const [settings] = await db.select().from(siteSettingsTable).limit(1);
  res.json(GetPublicSiteResponse.parse({
    instagramUrl: settings?.instagramUrl ?? "https://www.instagram.com/jannatcanada/",
    facebookUrl: settings?.facebookUrl ?? null,
    tiktokUrl: settings?.tiktokUrl ?? null,
    contactEmail: settings?.contactEmail ?? null,
    cities: settings?.cities ?? [],
  }));
});

router.post("/contact", async (req, res): Promise<void> => {
  const parsed = SubmitContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [message] = await db.insert(contactMessagesTable).values({
    ...parsed.data,
    phone: parsed.data.phone ?? null,
    status: "NEW",
  }).returning();
  res.status(201).json(SubmitContactResponse.parse(message));
});

export default router;