import { redirect } from "next/navigation";

export default function StudentBookingsPage() {
  redirect("/?view=enrolments");
}
