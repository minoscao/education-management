import type { Metadata } from "next";
import { ManagementPortal } from "./management-portal";

export const metadata: Metadata = {
  title: "Teaching Portal Admin",
  description: "A simple admin portal prototype for course, room, student, and teacher management.",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const views = { courses: 'courses', students: 'students', teachers: 'teachers', classrooms: 'classrooms', calendar: 'calendar', enrolments: 'enrollment' } as const;
  return <ManagementPortal initialView={view && view in views ? views[view as keyof typeof views] : 'dashboard'} />;
}
