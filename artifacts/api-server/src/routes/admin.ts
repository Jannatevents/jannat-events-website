import { and, asc, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateAlbumBody,
  CreateEventBody,
  CreateMediaBody,
  DeleteAlbumParams,
  DeleteEventParams,
  DeleteMediaParams,
  DuplicateEventParams,
  GetAdminAlbumParams,
  GetAdminEventParams,
  GetAdminOverviewResponse,
  GetHomepageSettingsResponse,
  GetSiteSettingsResponse,
  ListAdminAlbumsQueryParams,
  ListAdminAlbumsResponse,
  ListAdminEventsQueryParams,
  ListAdminEventsResponse,
  ListAdminMediaQueryParams,
  ListAdminMediaResponse,
  ListContactMessagesResponse,
  UpdateAlbumBody,
  UpdateAlbumParams,
  UpdateEventBody,
  UpdateEventParams,
  UpdateMediaBody,
  UpdateMediaParams,
  UpdateHomepageSettingsBody,
  UpdateHomepageSettingsResponse,
  UpdateSiteSettingsBody,
  UpdateSiteSettingsResponse,
} from "@workspace/api-zod";
import {
  albumsTable,
  contactMessagesTable,
  db,
  eventsTable,
  homepageSettingsTable,
  mediaTable,
  siteSettingsTable,
} from "@workspace/db";
import { requireJannatAdmin } from "../middlewares/requireJannatAdmin";
import { refreshPastEvents } from "../lib/eventStatus";

const router: IRouter = Router();

const requireAdmin = requireJannatAdmin;

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function eventPayload(event: typeof eventsTable.$inferSelect) {
  return {
    ...event,
    status: event.status as "UPCOMING" | "PAST" | "DRAFT",
    endTime: event.endTime ?? null,
    poster: event.poster ?? null,
    ticketUrl: event.ticketUrl ?? null,
    instagramUrl: event.instagramUrl ?? null,
    ageRestriction: event.ageRestriction ?? null,
    dressCode: event.dressCode ?? null,
    organizer: event.organizer ?? null,
    seoTitle: event.seoTitle ?? null,
    seoDescription: event.seoDescription ?? null,
  };
}

async function getAlbumPayload(album: typeof albumsTable.$inferSelect) {
  const [event] = album.eventId
    ? await db.select().from(eventsTable).where(eq(eventsTable.id, album.eventId)).limit(1)
    : [];
  const media = await db.select().from(mediaTable).where(eq(mediaTable.albumId, album.id)).orderBy(asc(mediaTable.sortOrder), asc(mediaTable.id));
  return {
    ...album,
    coverImage: album.coverImage ?? null,
    driveUrl: album.driveUrl ?? null,
    eventTitle: event?.title ?? null,
    city: event?.city ?? null,
    date: album.albumDate ?? event?.date ?? null,
    media,
  };
}

router.use(requireAdmin);

router.get("/admin/overview", async (_req, res): Promise<void> => {
  await refreshPastEvents();
  const events = await db.select().from(eventsTable).orderBy(asc(eventsTable.date));
  const albums = await db.select().from(albumsTable);
  const media = await db.select().from(mediaTable);
  const messages = await db.select().from(contactMessagesTable);
  const upcoming = events.filter((event) => event.status === "UPCOMING");
  const past = events.filter((event) => event.status === "PAST");
  res.json(GetAdminOverviewResponse.parse({
    upcomingEvents: upcoming.length,
    pastEvents: past.length,
    publishedAlbums: albums.filter((album) => album.published).length,
    totalMedia: media.length,
    unreadMessages: messages.filter((message) => message.status === "NEW").length,
    recentEvents: events.slice(0, 5).map(eventPayload),
  }));
});

router.get("/admin/events", async (req, res): Promise<void> => {
  await refreshPastEvents();
  const parsed = ListAdminEventsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const conditions: SQL[] = [];
  if (parsed.data.status) conditions.push(eq(eventsTable.status, parsed.data.status));
  if (parsed.data.search) {
    conditions.push(or(ilike(eventsTable.title, `%${parsed.data.search}%`), ilike(eventsTable.city, `%${parsed.data.search}%`))!);
  }
  const events = await db.select().from(eventsTable).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(eventsTable.date));
  res.json(ListAdminEventsResponse.parse(events.map(eventPayload)));
});

router.post("/admin/events", async (req, res): Promise<void> => {
  const parsed = CreateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const slug = data.slug || `${slugify(data.title)}-${Date.now().toString().slice(-5)}`;
  if (data.featured) await db.update(eventsTable).set({ featured: false }).where(eq(eventsTable.featured, true));
  const [event] = await db.insert(eventsTable).values({
    ...data,
    date: data.date.toISOString().slice(0, 10),
    slug,
    status: data.status ?? "DRAFT",
    featured: data.featured ?? false,
    endTime: data.endTime ?? null,
    poster: data.poster ?? null,
    ticketUrl: data.ticketUrl ?? null,
    instagramUrl: data.instagramUrl ?? null,
    ageRestriction: data.ageRestriction ?? null,
    dressCode: data.dressCode ?? null,
    organizer: data.organizer ?? null,
    seoTitle: data.seoTitle ?? null,
    seoDescription: data.seoDescription ?? null,
  }).returning();
  res.status(201).json(eventPayload(event));
});

router.get("/admin/events/:id", async (req, res): Promise<void> => {
  await refreshPastEvents();
  const parsed = GetAdminEventParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, parsed.data.id)).limit(1);
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }
  const gallery = await db.select().from(mediaTable).where(eq(mediaTable.eventId, event.id)).orderBy(asc(mediaTable.sortOrder));
  const [album] = await db.select().from(albumsTable).where(eq(albumsTable.eventId, event.id)).limit(1);
  res.json({ ...eventPayload(event), gallery, album: album ? await getAlbumPayload(album) : null });
});

router.patch("/admin/events/:id", async (req, res): Promise<void> => {
  const params = UpdateEventParams.safeParse(req.params);
  const parsed = UpdateEventBody.safeParse(req.body);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.featured) await db.update(eventsTable).set({ featured: false }).where(eq(eventsTable.featured, true));
  const [event] = await db.update(eventsTable).set({
    ...parsed.data,
    date: parsed.data.date?.toISOString().slice(0, 10),
    endTime: parsed.data.endTime ?? undefined,
    poster: parsed.data.poster ?? undefined,
    ticketUrl: parsed.data.ticketUrl ?? undefined,
    instagramUrl: parsed.data.instagramUrl ?? undefined,
    ageRestriction: parsed.data.ageRestriction ?? undefined,
    dressCode: parsed.data.dressCode ?? undefined,
    organizer: parsed.data.organizer ?? undefined,
    seoTitle: parsed.data.seoTitle ?? undefined,
    seoDescription: parsed.data.seoDescription ?? undefined,
    updatedAt: new Date(),
  }).where(eq(eventsTable.id, params.data.id)).returning();
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }
  res.json(eventPayload(event));
});

router.delete("/admin/events/:id", async (req, res): Promise<void> => {
  const parsed = DeleteEventParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const deleted = await db.delete(eventsTable).where(eq(eventsTable.id, parsed.data.id)).returning();
  if (!deleted.length) { res.status(404).json({ error: "Event not found" }); return; }
  res.sendStatus(204);
});

router.post("/admin/events/:id/duplicate", async (req, res): Promise<void> => {
  const parsed = DuplicateEventParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [source] = await db.select().from(eventsTable).where(eq(eventsTable.id, parsed.data.id)).limit(1);
  if (!source) { res.status(404).json({ error: "Event not found" }); return; }
  const [event] = await db.insert(eventsTable).values({
    title: `${source.title} — copy`,
    slug: `${source.slug}-copy-${Date.now().toString().slice(-5)}`,
    date: source.date,
    startTime: source.startTime,
    endTime: source.endTime,
    venue: source.venue,
    address: source.address,
    city: source.city,
    province: source.province,
    country: source.country,
    description: source.description,
    poster: source.poster,
    ticketUrl: source.ticketUrl,
    instagramUrl: source.instagramUrl,
    status: "DRAFT",
    featured: false,
    ageRestriction: source.ageRestriction,
    dressCode: source.dressCode,
    organizer: source.organizer,
    seoTitle: source.seoTitle,
    seoDescription: source.seoDescription,
  }).returning();
  res.status(201).json(eventPayload(event));
});

router.get("/admin/albums", async (req, res): Promise<void> => {
  const parsed = ListAdminAlbumsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const albums = await db.select().from(albumsTable).where(parsed.data.search ? ilike(albumsTable.title, `%${parsed.data.search}%`) : undefined).orderBy(desc(albumsTable.createdAt));
  res.json(ListAdminAlbumsResponse.parse(await Promise.all(albums.map(getAlbumPayload))));
});

router.post("/admin/albums", async (req, res): Promise<void> => {
  const parsed = CreateAlbumBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { date, ...albumInput } = parsed.data;
  const [album] = await db.insert(albumsTable).values({
    ...albumInput,
    slug: albumInput.slug || `${slugify(albumInput.title)}-${Date.now().toString().slice(-5)}`,
    coverImage: albumInput.coverImage ?? null,
    albumDate: date.toISOString().slice(0, 10),
    driveUrl: albumInput.driveUrl,
    eventId: albumInput.eventId ?? null,
    published: albumInput.published ?? false,
  }).returning();
  res.status(201).json(await getAlbumPayload(album));
});

router.get("/admin/albums/:id", async (req, res): Promise<void> => {
  const parsed = GetAdminAlbumParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [album] = await db.select().from(albumsTable).where(eq(albumsTable.id, parsed.data.id)).limit(1);
  if (!album) { res.status(404).json({ error: "Album not found" }); return; }
  res.json(await getAlbumPayload(album));
});

router.patch("/admin/albums/:id", async (req, res): Promise<void> => {
  const params = UpdateAlbumParams.safeParse(req.params);
  const parsed = UpdateAlbumBody.safeParse(req.body);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { date, ...albumUpdate } = parsed.data;
  const [album] = await db.update(albumsTable).set({
    ...albumUpdate,
    coverImage: albumUpdate.coverImage ?? undefined,
    albumDate: date === undefined ? undefined : date === null ? null : date.toISOString().slice(0, 10),
    driveUrl: albumUpdate.driveUrl ?? undefined,
    eventId: albumUpdate.eventId ?? undefined,
  }).where(eq(albumsTable.id, params.data.id)).returning();
  if (!album) { res.status(404).json({ error: "Album not found" }); return; }
  res.json(await getAlbumPayload(album));
});

router.delete("/admin/albums/:id", async (req, res): Promise<void> => {
  const parsed = DeleteAlbumParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const deleted = await db.delete(albumsTable).where(eq(albumsTable.id, parsed.data.id)).returning();
  if (!deleted.length) { res.status(404).json({ error: "Album not found" }); return; }
  res.sendStatus(204);
});

router.get("/admin/media", async (req, res): Promise<void> => {
  const parsed = ListAdminMediaQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const conditions: SQL[] = [];
  if (parsed.data.type) conditions.push(eq(mediaTable.type, parsed.data.type));
  if (parsed.data.search) conditions.push(ilike(mediaTable.altText, `%${parsed.data.search}%`));
  const media = await db.select().from(mediaTable).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(mediaTable.sortOrder), desc(mediaTable.createdAt));
  res.json(ListAdminMediaResponse.parse(media));
});

router.post("/admin/media", async (req, res): Promise<void> => {
  const parsed = CreateMediaBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [media] = await db.insert(mediaTable).values({
    ...parsed.data,
    thumbnail: parsed.data.thumbnail ?? null,
    albumId: parsed.data.albumId ?? null,
    eventId: parsed.data.eventId ?? null,
    sortOrder: parsed.data.sortOrder ?? 0,
  }).returning();
  res.status(201).json(media);
});

router.patch("/admin/media/:id", async (req, res): Promise<void> => {
  const params = UpdateMediaParams.safeParse(req.params);
  const parsed = UpdateMediaBody.safeParse(req.body);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [media] = await db.update(mediaTable).set({
    ...parsed.data,
    thumbnail: parsed.data.thumbnail ?? undefined,
    albumId: parsed.data.albumId ?? undefined,
    eventId: parsed.data.eventId ?? undefined,
  }).where(eq(mediaTable.id, params.data.id)).returning();
  if (!media) { res.status(404).json({ error: "Media not found" }); return; }
  res.json(media);
});

router.delete("/admin/media/:id", async (req, res): Promise<void> => {
  const parsed = DeleteMediaParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const deleted = await db.delete(mediaTable).where(eq(mediaTable.id, parsed.data.id)).returning();
  if (!deleted.length) { res.status(404).json({ error: "Media not found" }); return; }
  res.sendStatus(204);
});

router.get("/admin/homepage", async (_req, res): Promise<void> => {
  const [settings] = await db.select().from(homepageSettingsTable).limit(1);
  const gallery = await db.select().from(mediaTable).where(eq(mediaTable.type, "IMAGE")).orderBy(asc(mediaTable.sortOrder)).limit(12);
  res.json(GetHomepageSettingsResponse.parse({
    heroImage: settings?.heroImage ?? null,
    heroVideo: settings?.heroVideo ?? null,
    heroHeadline: settings?.heroHeadline ?? "Where the night comes alive",
    heroSubtitle: settings?.heroSubtitle ?? "Unforgettable South Asian experiences, made for the moments you keep talking about.",
    ctaText: settings?.ctaText ?? "Explore events",
    ctaUrl: settings?.ctaUrl ?? "/events",
    featuredEventId: settings?.featuredEventId ?? null,
    featuredEvent: null,
    gallery,
  }));
});

router.patch("/admin/homepage", async (req, res): Promise<void> => {
  const parsed = UpdateHomepageSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const values = {
    id: 1,
    heroImage: parsed.data.heroImage ?? null,
    heroVideo: parsed.data.heroVideo ?? null,
    heroHeadline: parsed.data.heroHeadline ?? "Where the night comes alive",
    heroSubtitle: parsed.data.heroSubtitle ?? "Unforgettable South Asian experiences, made for the moments you keep talking about.",
    ctaText: parsed.data.ctaText ?? "Explore events",
    ctaUrl: parsed.data.ctaUrl ?? "/events",
    featuredEventId: parsed.data.featuredEventId ?? null,
  };
  await db.insert(homepageSettingsTable).values(values).onConflictDoUpdate({ target: homepageSettingsTable.id, set: values });
  const [saved] = await db.select().from(homepageSettingsTable).limit(1);
  res.json(UpdateHomepageSettingsResponse.parse({ ...saved, featuredEvent: null, gallery: [] }));
});

router.get("/admin/settings", async (_req, res): Promise<void> => {
  const [settings] = await db.select().from(siteSettingsTable).limit(1);
  res.json(GetSiteSettingsResponse.parse({
    instagramUrl: settings?.instagramUrl ?? "https://www.instagram.com/jannatcanada/",
    facebookUrl: settings?.facebookUrl ?? null,
    tiktokUrl: settings?.tiktokUrl ?? null,
    contactEmail: settings?.contactEmail ?? null,
    cities: settings?.cities ?? [],
  }));
});

router.patch("/admin/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSiteSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const values = {
    id: 1,
    instagramUrl: parsed.data.instagramUrl ?? "https://www.instagram.com/jannatcanada/",
    facebookUrl: parsed.data.facebookUrl ?? null,
    tiktokUrl: parsed.data.tiktokUrl ?? null,
    contactEmail: parsed.data.contactEmail ?? null,
    cities: parsed.data.cities ?? [],
  };
  await db.insert(siteSettingsTable).values(values).onConflictDoUpdate({ target: siteSettingsTable.id, set: values });
  const [saved] = await db.select().from(siteSettingsTable).limit(1);
  res.json(UpdateSiteSettingsResponse.parse(saved));
});

router.get("/admin/messages", async (_req, res): Promise<void> => {
  const messages = await db.select().from(contactMessagesTable).orderBy(desc(contactMessagesTable.createdAt));
  res.json(ListContactMessagesResponse.parse(messages));
});

export default router;