import { z } from "zod";

/**
 * Schema for the editorial content of an edition.
 * Every public claim lives in versioned files validated at build time (RF-28).
 * `synthetic: true` marks placeholder data that must never be presented as fact.
 */

const url = z.url({ protocol: /^https$/ });
/** Image served from `public/`, e.g. `/lineup/franco-the-sir.png`. */
const publicImage = z.string().regex(/^\/[a-z0-9/_-]+\.(png|jpg|webp)$/);

export const artistSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  /** False while the artist has not been announced; the name is then a placeholder. */
  confirmed: z.boolean(),
  /** Full-body 3D character shown in the line-up menu. */
  image: publicImage.optional(),
  imageAlt: z.string().min(1).optional(),
  bio: z.string().optional(),
  instagram: url.optional(),
  youtube: url.optional(),
  music: url.optional(),
});

export const goalMilestoneSchema = z.object({
  /** Number of confirmed kits needed to unlock this milestone. */
  kits: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().min(1),
});

export const editionContentSchema = z
  .object({
    synthetic: z.boolean(),
    eventName: z.string().min(1),
    editionName: z.string().min(1),
    organizer: z.string().min(1),
    tagline: z.string().min(1),
    city: z.string().min(1),
    state: z.string().length(2),
    timeZone: z.string().min(1),
    /** ISO 8601 with offset, or null while unconfirmed. */
    startsAt: z.iso.datetime({ offset: true }).nullable(),
    gatesOpenAt: z.iso.datetime({ offset: true }).nullable(),
    venue: z.object({
      name: z.string().min(1),
      address: z.string().min(1),
      postalCode: z.string().optional(),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      arrivalNotes: z.array(z.string()),
    }),
    hero: z.object({ kicker: z.string().min(1), title: z.string().min(1) }),
    /** Short statement shown right after the hero. */
    about: z.string().min(1),
    donation: z.object({
      title: z.string().min(1),
      /** Shown while there is no official donation channel. */
      pendingText: z.string().min(1),
    }),
    registration: z.object({
      open: z.boolean(),
      rules: z.array(z.string()).min(1),
    }),
    kit: z.object({
      name: z.string().min(1),
      pitch: z.string().min(1),
      image: publicImage,
      imageAlt: z.string().min(1),
      prints: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]+$/), label: z.string().min(1) })).min(1),
      sizes: z.array(z.string().min(1)).min(1),
      /** Price in cents (BRL). Null while unconfirmed. */
      priceCents: z.number().int().positive().nullable(),
      shipping: z.string().min(1),
    }),
    goalPlan: z.object({
      intro: z.string().min(1),
      milestones: z.array(goalMilestoneSchema).min(1),
    }),
    artists: z.array(artistSchema),
    links: z.object({
      crowdfunding: url.nullable(),
      instagram: url.nullable(),
      youtube: url.nullable(),
    }),
    contactEmail: z.email().nullable(),
  })
  .superRefine((value, ctx) => {
    value.artists.forEach((a, i) => {
      if (a.image && !a.imageAlt) {
        ctx.addIssue({ code: "custom", path: ["artists", i, "imageAlt"], message: "Images need alt text." });
      }
    });
    const kits = value.goalPlan.milestones.map((m) => m.kits);
    const sorted = [...kits].sort((a, b) => a - b);
    if (kits.some((k, i) => k !== sorted[i] || (i > 0 && k === sorted[i - 1]))) {
      ctx.addIssue({
        code: "custom",
        path: ["goalPlan", "milestones"],
        message: "Milestones must be in strictly increasing order of kits.",
      });
    }
  });

export type EditionContent = z.infer<typeof editionContentSchema>;
export type Artist = z.infer<typeof artistSchema>;
export type GoalMilestone = z.infer<typeof goalMilestoneSchema>;
export type Kit = EditionContent["kit"];
