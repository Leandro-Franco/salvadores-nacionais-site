import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { editions, registrations } from "../../../db/schema";
import type { CreateResult, NewRegistration, RegistrationRepository } from "./repository";

export class PostgresRegistrationRepository implements RegistrationRepository {
  constructor(private readonly db: PostgresJsDatabase) {}

  async createIfAbsent(input: NewRegistration): Promise<CreateResult> {
    // The database flag is authoritative: real data is only collected once the
    // edition is explicitly opened (spec §19.2).
    const [edition] = await this.db
      .select({ id: editions.id })
      .from(editions)
      .where(and(eq(editions.slug, input.editionSlug), eq(editions.registrationOpen, true)))
      .limit(1);
    if (!edition) return "closed";

    // Unique (edition_id, email_hash) makes this race-free.
    const inserted = await this.db
      .insert(registrations)
      .values({ editionId: edition.id, name: input.name, email: input.email, emailHash: input.emailHash })
      .onConflictDoNothing({ target: [registrations.editionId, registrations.emailHash] })
      .returning({ id: registrations.id });

    return inserted.length > 0 ? "created" : "duplicate";
  }
}
