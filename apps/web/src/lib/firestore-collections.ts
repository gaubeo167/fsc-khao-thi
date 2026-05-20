"use client";

/**
 * Typed Firestore collection references — one place where every collection
 * path is named, so renaming a collection later means changing one file.
 *
 * The schema is intentionally flat (no nested subcollections) so security
 * rules in `firestore.rules` can match each by name and queries can filter
 * by `campusId` across the whole collection.
 */

import {
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
} from "firebase/firestore";

import { getDb } from "./firebase";

/** A document shape known to Firestore — every collection ref is generic on its data type. */
type WithId<T> = T & { id: string };

export const COLLECTIONS = {
  users: "users",
  campuses: "campuses",
  subjects: "subjects",
  grades: "grades",
  classes: "classes",
  questions: "questions",
  blueprints: "blueprints",
  packages: "packages",
  shifts: "shifts",
  attempts: "attempts",
  gradesEssay: "grades_essay",
  gradingAssignments: "grading_assignments",
  tocNodes: "toc_nodes",
  teachingAssignments: "teaching_assignments",
  proctorEvents: "proctor_events",
  examForms: "exam_forms",
  auditEvents: "audit_events",
} as const;

export function colRef<T>(name: keyof typeof COLLECTIONS): CollectionReference<WithId<T>> {
  return collection(getDb(), COLLECTIONS[name]) as CollectionReference<WithId<T>>;
}

export function docRef<T>(
  name: keyof typeof COLLECTIONS,
  id: string,
): DocumentReference<WithId<T>> {
  return doc(getDb(), COLLECTIONS[name], id) as DocumentReference<WithId<T>>;
}
