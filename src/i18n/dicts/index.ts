// Per-feature translation dictionaries.
// Each module default-exports a map: { en: {...}, fr: {...}, ... }
// Missing keys/locales fall back to English at runtime.

export type Dict = Record<string, string>;
export type LocaleMap = Record<string, Dict>;

import auth from "./auth";
import locker from "./locker";
import security from "./security";
import scan from "./scan";
import viewer from "./viewer";
import billing from "./billing";

const modules: LocaleMap[] = [auth, locker, security, scan, viewer, billing];

/** Merged dictionaries per locale code. */
export const featureDicts: LocaleMap = modules.reduce<LocaleMap>((acc, mod) => {
  for (const [lng, dict] of Object.entries(mod)) {
    acc[lng] = { ...(acc[lng] ?? {}), ...dict };
  }
  return acc;
}, {});
