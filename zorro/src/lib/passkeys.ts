// Passkey sign-up and sign-in (WebAuthn). Server-side only.
// Registration follows the Agent API's rules: ES256 (alg -7), user verification required,
// and the public key stored as P-256 SPKI (base64url) so it can own an agent wallet.

import { createPublicKey, randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { convertCOSEtoPKCS } from "@simplewebauthn/server/helpers";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { db, schema } from "@/db";
import { AuthError, createSession, requestOrigin, type CurrentUser } from "./session";

const CHALLENGE_COOKIE = "zorro_challenge";
const CHALLENGE_TTL_MS = 5 * 60_000;

/** P-256 COSE key → SPKI (base64url), the format the Agent API expects for passkey owners. */
export function spkiFromCose(cosePublicKey: Uint8Array): string {
  const point = convertCOSEtoPKCS(new Uint8Array(cosePublicKey)); // 0x04 || x || y
  if (point.length !== 65) throw new AuthError("Only P-256 (ES256) passkeys are supported");
  return createPublicKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: Buffer.from(point.subarray(1, 33)).toString("base64url"),
      y: Buffer.from(point.subarray(33, 65)).toString("base64url"),
    },
    format: "jwk",
  })
    .export({ format: "der", type: "spki" })
    .toString("base64url");
}

async function saveChallenge(purpose: "register" | "login", challenge: string, secure: boolean) {
  const id = randomUUID();
  await db
    .insert(schema.authChallenges)
    .values({ id, purpose, challenge, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) });
  (await cookies()).set(CHALLENGE_COOKIE, id, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/api/auth",
    maxAge: CHALLENGE_TTL_MS / 1000,
  });
}

/** Read and delete the challenge (one use only). */
async function takeChallenge(purpose: "register" | "login"): Promise<string> {
  const jar = await cookies();
  const id = jar.get(CHALLENGE_COOKIE)?.value;
  jar.delete(CHALLENGE_COOKIE);
  if (!id) throw new AuthError("Passkey request expired. Please try again.");
  const [row] = await db.select().from(schema.authChallenges).where(eq(schema.authChallenges.id, id)).limit(1);
  await db.delete(schema.authChallenges).where(eq(schema.authChallenges.id, id));
  if (!row || row.purpose !== purpose || row.expiresAt < new Date()) {
    throw new AuthError("Passkey request expired. Please try again.");
  }
  return row.challenge;
}

// ---------- Sign-up ----------

export async function beginRegistration() {
  const { rpId, secure } = await requestOrigin();
  const options = await generateRegistrationOptions({
    rpName: "Zorro",
    rpID: rpId,
    userName: "Zorro bot wallet",
    userDisplayName: "Zorro bot wallet",
    userID: new Uint8Array(randomBytes(32)),
    attestationType: "none",
    supportedAlgorithmIDs: [-7], // ES256 only: the Agent API needs a P-256 key
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  await saveChallenge("register", options.challenge, secure);
  return options;
}

export async function finishRegistration(response: RegistrationResponseJSON): Promise<CurrentUser> {
  const { origin, rpId, secure } = await requestOrigin();
  const expectedChallenge = await takeChallenge("register");

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
    requireUserVerification: true,
    supportedAlgorithmIDs: [-7],
  }).catch(() => ({ verified: false as const }));
  if (!verification.verified) throw new AuthError("Couldn't verify the passkey. Please try again.");

  const { credential } = verification.registrationInfo;
  const user: CurrentUser = {
    id: randomUUID(),
    passkeyCredentialId: credential.id,
    passkeyPublicKey: spkiFromCose(credential.publicKey),
    passkeyPublicKeyCose: Buffer.from(credential.publicKey).toString("base64url"),
    passkeyCounter: credential.counter,
    passkeyTransports: credential.transports ?? null,
    rpId,
    origin,
    handle: null,
    createdAt: new Date(),
  };
  await db.insert(schema.users).values(user);
  await createSession(user.id, secure);
  return user;
}

// ---------- Sign-in ----------

export async function beginLogin() {
  const { rpId, secure } = await requestOrigin();
  // No allowCredentials: the device offers the user's saved Zorro passkey.
  const options = await generateAuthenticationOptions({ rpID: rpId, userVerification: "required" });
  await saveChallenge("login", options.challenge, secure);
  return options;
}

export async function finishLogin(response: AuthenticationResponseJSON): Promise<CurrentUser> {
  const { origin, rpId, secure } = await requestOrigin();
  const expectedChallenge = await takeChallenge("login");

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.passkeyCredentialId, response.id))
    .limit(1);
  if (!user) throw new AuthError("This passkey isn't registered with Zorro.", 404);

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
    requireUserVerification: true,
    credential: {
      id: user.passkeyCredentialId,
      publicKey: new Uint8Array(Buffer.from(user.passkeyPublicKeyCose, "base64url")),
      counter: user.passkeyCounter,
      transports: user.passkeyTransports ?? undefined,
    },
  }).catch(() => null);
  if (!verification?.verified) throw new AuthError("Couldn't verify the passkey. Please try again.", 401);

  await db
    .update(schema.users)
    .set({ passkeyCounter: verification.authenticationInfo.newCounter })
    .where(eq(schema.users.id, user.id));
  await createSession(user.id, secure);
  return user;
}
