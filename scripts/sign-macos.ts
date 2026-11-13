import { sign as signApplication, type SignOptions } from "@electron/osx-sign";

// Fork-only: a stable self-signed identity (cert SHA-1) replaces ad-hoc signing so the
// designated requirement survives across builds and Squirrel.Mac accepts updates.
const selfSignIdentity = process.env.T3CODE_DESKTOP_MAC_SELF_SIGN_IDENTITY?.trim();

export default async function sign(options: SignOptions): Promise<void> {
  await signApplication({
    ...options,
    batchCodesignCalls: true,
    ...(selfSignIdentity ? { identity: selfSignIdentity, identityValidation: false } : {}),
  });
}
