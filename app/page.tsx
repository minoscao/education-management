import type { Metadata } from "next";
import { AdminConsole } from "./admin-console";

export const metadata: Metadata = {
  title: "Teaching Portal Admin",
  description: "A simple admin portal prototype for course, room, student, and teacher management.",
};

export default function Home() {
  return <AdminConsole activeTable="courses" />;
}
