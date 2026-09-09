import { aboutSettingsTable } from "@workspace/db";

export const DEFAULT_ABOUT = {
  heroEyebrow: "Our story",
  heroTitle: "A little bit of everywhere.",
  introEyebrow: "Why Jannat exists",
  introTitle: "The soundtrack to belonging.",
  introParagraphs: [
    "Jannat is a love letter to the South Asian community across Canada, a place where the classics still hit, new sounds find their people, and a dance floor can feel like home.",
    "We make nights that move between generations. The old chorus, the new beat, the friend you came with, and the stranger you leave knowing. That is the magic we are here for.",
    "Every city has its own rhythm. We are here to turn it up.",
  ],
  featureImage: null,
  featureEyebrow: "Across Canada",
  featureTitle: "Many cities. One feeling.",
  featureDescription: "Toronto, Vancouver, Montréal, Calgary, and the places still to come.",
};

export function aboutPayload(settings?: typeof aboutSettingsTable.$inferSelect | null) {
  return {
    heroEyebrow: settings?.heroEyebrow ?? DEFAULT_ABOUT.heroEyebrow,
    heroTitle: settings?.heroTitle ?? DEFAULT_ABOUT.heroTitle,
    introEyebrow: settings?.introEyebrow ?? DEFAULT_ABOUT.introEyebrow,
    introTitle: settings?.introTitle ?? DEFAULT_ABOUT.introTitle,
    introParagraphs: settings?.introParagraphs?.length ? settings.introParagraphs : DEFAULT_ABOUT.introParagraphs,
    featureImage: settings?.featureImage ?? DEFAULT_ABOUT.featureImage,
    featureEyebrow: settings?.featureEyebrow ?? DEFAULT_ABOUT.featureEyebrow,
    featureTitle: settings?.featureTitle ?? DEFAULT_ABOUT.featureTitle,
    featureDescription: settings?.featureDescription ?? DEFAULT_ABOUT.featureDescription,
  };
}