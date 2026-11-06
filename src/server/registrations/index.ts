import "server-only";
import { createHmac } from "node:crypto";
import { identityKey, serverConfig } from "@/config/server";
import { normalizeEmail } from "@/domain/registrations/registration";
import { getDb } from "@/server/db";
import { PostgresRegistrationRepository } from "./postgres-repository";
import { InMemoryRegistrationRepository, type RegistrationRepository } from "./repository";

let repo: RegistrationRepository | undefined;

export function registrationRepository(): RegistrationRepository {
  repo ??=
    serverConfig().DATA_STORE === "postgres"
      ? new PostgresRegistrationRepository(getDb())
      : new InMemoryRegistrationRepository();
  return repo;
}

export function emailHash(email: string): string {
  return createHmac("sha256", identityKey()).update(normalizeEmail(email)).digest("hex");
}
