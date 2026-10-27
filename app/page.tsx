import type { Metadata } from "next";
import { PortalEntry } from "./portal-entry";

export const metadata: Metadata = {
  title: "Teaching Portal",
  description: "Registration, membership, course booking and teaching operations.",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const views = { courses: 'courses', students: 'students', teachers: 'teachers', classrooms: 'classrooms', calendar: 'calendar', enrolments: 'enrollment' } as const;
  return <PortalEntry initialView={view && view in views ? views[view as keyof typeof views] : 'dashboard'} />;
}
