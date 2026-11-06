export type NewRegistration = {
  editionSlug: string;
  name: string;
  email: string;
  /** HMAC of the normalized e-mail, unique per edition. */
  emailHash: string;
};

export type CreateResult = "created" | "duplicate" | "closed";

export interface RegistrationRepository {
  /**
   * Inserts the registration if the e-mail is not registered for the edition yet.
   * "created" and "duplicate" must get the same public answer (RF-05).
   * "closed" means the edition does not accept registrations.
   */
  createIfAbsent(input: NewRegistration): Promise<CreateResult>;
}

/** Local demo store. Data is lost on restart; never used outside APP_ENV=local. */
export class InMemoryRegistrationRepository implements RegistrationRepository {
  private readonly rows = new Map<string, NewRegistration & { createdAt: Date }>();

  async createIfAbsent(input: NewRegistration): Promise<CreateResult> {
    const key = `${input.editionSlug}:${input.emailHash}`;
    if (this.rows.has(key)) return "duplicate";
    this.rows.set(key, { ...input, createdAt: new Date() });
    return "created";
  }

  get size() {
    return this.rows.size;
  }
}
