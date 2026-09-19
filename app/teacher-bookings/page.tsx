import { redirect } from "next/navigation";

export default function TeacherBookingsPage() {
  redirect("/?view=calendar");
}
