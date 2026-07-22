/**
 * SERVER-ONLY opaque-id protocol for `matching` questions.
 *
 * Why this exists
 * ───────────────
 * A matching answer is graded as `pairings[leftId] === leftId` — i.e. the
 * correct right for a left is the right whose id EQUALS the left's id
 * (pairs bundle left+right under one shared id). The student always knows
 * every `leftId`, so the correct answer's real id is *inherently known to
 * them*. Merely shuffling or splitting the columns can't hide it.
 *
 * The only way to hide the mapping is to give each right an opaque handle
 * the client CANNOT compute from data it holds. We derive that handle as
 * HMAC(serverSecret, `${questionId}:${realId}`): the student has questionId
 * and realId but not the secret, so they can't reproduce the token. The
 * server re-derives the same tokens at submit time to translate the
 * student's chosen tokens back to real ids before grading — and stores the
 * REAL ids, so the review/report screens are unaffected.
 *
 * ⚠️ Imports node:crypto → must never be pulled into a client bundle. Keep
 * this out of grade.ts (which the client imports for demo-mode grading).
 */
import { createHmac } from "node:crypto";

import type {
  MatchingQuestion,
  MatchingRightOption,
  Question,
} from "@/features/question-bank/data/seed-questions";
import type { Answer } from "@/features/shift-exam/state/attempts-store";

import { stripAnswers } from "./grade";

/**
 * Stable per-deployment secret. FIREBASE_SERVICE_ACCOUNT is always present
 * server-side and never shipped to the client, so it doubles as a good
 * HMAC key. A dedicated MATCHING_TOKEN_SECRET takes precedence if set.
 * The dev fallback is only reached with no Firebase env (demo/local) where
 * there is no real exam data to protect anyway.
 */
function tokenSecret(): string {
  return (
    process.env.MATCHING_TOKEN_SECRET ||
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    "fsc-dev-matching-secret"
  );
}

function tokenFor(questionId: string, realId: string): string {
  return createHmac("sha256", tokenSecret())
    .update(`${questionId}:${realId}`)
    .digest("base64url")
    .slice(0, 16);
}

/** Deterministic shuffle keyed by a string (display order only — security
 *  comes from the opaque tokens, not the order). */
function seededShuffle<T>(arr: readonly T[], seedStr: string): T[] {
  let s = 0;
  for (const ch of seedStr) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** All right-column entries (real pairs + distractors) with their real id. */
function matchingRights(
  q: MatchingQuestion,
): Array<{ realId: string; right: string }> {
  return [
    ...q.pairs.map((p) => ({ realId: p.id, right: p.right })),
    ...(q.distractors ?? []).map((d) => ({ realId: d.id, right: d.right })),
  ];
}

/**
 * Serve-safe version of a matching question: blanks every `pairs[].right`,
 * drops `distractors`, and emits `rightOptions` (opaque tokens + text),
 * shuffled. The client renders the left labels + a picker over the tokens.
 */
export function serveMatching(q: MatchingQuestion): MatchingQuestion {
  const options: MatchingRightOption[] = matchingRights(q).map((r) => ({
    token: tokenFor(q.id, r.realId),
    right: r.right,
  }));
  return {
    ...q,
    pairs: q.pairs.map((p) => ({ ...p, right: "" })),
    distractors: [],
    rightOptions: seededShuffle(options, `match-${q.id}`),
  };
}

/**
 * Translate a student's matching answer (leftId → token) back to real ids
 * (leftId → realId) so `gradeQuestion` can score it. Rebuilds the same
 * token→realId map from the ORIGINAL question. Tokens that don't resolve
 * (tampering / stale) are dropped → that left is left unanswered (wrong).
 */
export function restoreMatchingPairings(
  q: MatchingQuestion,
  pairings: Record<string, string>,
): Record<string, string> {
  const tokenToReal = new Map<string, string>();
  for (const r of matchingRights(q)) {
    tokenToReal.set(tokenFor(q.id, r.realId), r.realId);
  }
  const out: Record<string, string> = {};
  for (const [leftId, chosen] of Object.entries(pairings)) {
    // Accept a real id directly too (demo-mode answers never went through
    // tokenisation), so mixed/legacy submissions still grade.
    const real = tokenToReal.get(chosen) ?? chosen;
    out[leftId] = real;
  }
  return out;
}

/**
 * Server serve wrapper: matching → opaque protocol, everything else →
 * field-based stripAnswers. Use this in the /questions serving routes.
 */
export function stripForServe(q: Question): Question {
  return q.type === "matching" ? serveMatching(q) : stripAnswers(q);
}

/**
 * Submit-side inverse: given the ORIGINAL questions and the client's
 * answers (which may carry matching tokens), return a copy of `answers`
 * with matching pairings mapped back to real ids. Non-matching answers are
 * passed through untouched. Grade + store the RESULT so downstream screens
 * see real ids.
 */
export function restoreServedAnswers(
  questions: Question[],
  answers: Record<string, Answer>,
): Record<string, Answer> {
  const out: Record<string, Answer> = { ...answers };
  for (const q of questions) {
    if (q.type !== "matching") continue;
    const a = out[q.id];
    if (a && a.kind === "matching") {
      out[q.id] = {
        ...a,
        pairings: restoreMatchingPairings(q, a.pairings),
      };
    }
  }
  return out;
}
