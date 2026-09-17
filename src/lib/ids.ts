import { randomUUID } from "node:crypto";

export function newPermanentId(): string {
  return randomUUID();
}
