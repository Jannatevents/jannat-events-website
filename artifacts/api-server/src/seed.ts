import { db, eventsTable, albumsTable, mediaTable, homepageSettingsTable, siteSettingsTable } from "@workspace/db";

const images = [
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1800&q=88",
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1400&q=86",
  "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1400&q=86",
  "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1400&q=86",
];

export async function ensureSeeded() {
  const existing = await db.select({ id: eventsTable.id }).from(eventsTable).limit(1);
  if (existing.length) return;

  const seededEvents = await db.insert(eventsTable).values([
    { title: "Jannat: Midnight in Mumbai", slug: "midnight-in-mumbai", date: "2026-10-17", startTime: "22:00", endTime: "02:30", venue: "Rebel", address: "11 Polson Street", city: "Toronto", province: "ON", country: "CA", description: "<p>A cinematic Bollywood night built for the city after dark. Expect beloved anthems, new-school edits, and a dance floor that never loses the plot.</p>", poster: images[0], ticketUrl: "https://www.eventbrite.ca/", instagramUrl: "https://www.instagram.com/jannatcanada/", status: "UPCOMING", featured: true, ageRestriction: "19+", dressCode: "Elevated evening", organizer: "Jannat Events" },
    { title: "Jannat Vancouver: Noor", slug: "vancouver-noor", date: "2026-11-07", startTime: "21:30", endTime: "02:00", venue: "Fortune Sound Club", address: "147 E Pender Street", city: "Vancouver", province: "BC", country: "CA", description: "<p>A luminous night of Bollywood, Punjabi and global club sounds in the heart of Vancouver.</p>", poster: images[1], ticketUrl: "https://www.eventbrite.ca/", status: "UPCOMING", featured: false, ageRestriction: "19+", organizer: "Jannat Events" },
    { title: "Jannat Montréal: Raat", slug: "montreal-raat", date: "2026-11-28", startTime: "22:00", venue: "New City Gas", address: "950 Ottawa Street", city: "Montréal", province: "QC", country: "CA", description: "<p>Old favourites, future classics, and Montréal energy from doors to close.</p>", poster: images[2], ticketUrl: "https://www.eventbrite.ca/", status: "UPCOMING", featured: false, ageRestriction: "18+", organizer: "Jannat Events" },
    { title: "Jannat: Summer After Dark", slug: "summer-after-dark", date: "2026-07-11", startTime: "22:00", venue: "The Pearl", address: "184 Pearl Street", city: "Toronto", province: "ON", country: "CA", description: "<p>The summer chapter: warm nights, loud choruses, and a room full of familiar faces.</p>", poster: images[3], status: "PAST", featured: false, ageRestriction: "19+", organizer: "Jannat Events" },
  ]).returning();

  const past = seededEvents[3];
  const [album] = await db.insert(albumsTable).values({ title: "Summer After Dark", slug: "summer-after-dark-gallery", description: "A look back at one of Toronto's warmest nights.", coverImage: images[3], eventId: past.id, published: true }).returning();
  await db.insert(mediaTable).values(images.map((url, index) => ({ type: "IMAGE", url, altText: `Jannat Summer After Dark moment ${index + 1}`, albumId: album.id, eventId: past.id, sortOrder: index })));
  await db.insert(homepageSettingsTable).values({ id: 1, heroImage: images[0], heroVideo: null, heroHeadline: "Where the night feels like home.", heroSubtitle: "Classic Bollywood energy. New-school rhythm. Unforgettable nights across Canada.", ctaText: "See what is next", ctaUrl: "/events", featuredEventId: seededEvents[0].id });
  await db.insert(siteSettingsTable).values({ id: 1, instagramUrl: "https://www.instagram.com/jannatcanada/", facebookUrl: "https://www.facebook.com/", tiktokUrl: null, contactEmail: "contactthejannat@gmail.com", cities: ["Toronto", "Vancouver", "Montréal", "Calgary"] });
}