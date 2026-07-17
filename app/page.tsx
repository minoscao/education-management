import type { Metadata } from "next";
import { ManagementPortal } from "./management-portal";

export const metadata: Metadata = {
  title: "Teaching Portal Admin",
  description: "A simple admin portal prototype for course, room, student, and teacher management.",
};

export default function Home() {
  return <ManagementPortal />;
}
