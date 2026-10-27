export type BookingPolicy = {
  requireMembership: boolean;
  enforceSchoolStage: boolean;
  g6SecondaryCourseIds: string[];
};
export const defaultBookingPolicy: BookingPolicy = {
  requireMembership: true,
  enforceSchoolStage: true,
  g6SecondaryCourseIds: [],
};
type Row = Record<string, unknown>;
export function readBookingPolicy(value: unknown): BookingPolicy {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return {
      requireMembership: parsed?.requireMembership !== false,
      enforceSchoolStage: parsed?.enforceSchoolStage !== false,
      g6SecondaryCourseIds: Array.isArray(parsed?.g6SecondaryCourseIds)
        ? parsed.g6SecondaryCourseIds.filter(
            (id: unknown) => typeof id === "string",
          )
        : [],
    };
  } catch {
    return { ...defaultBookingPolicy };
  }
}
export function academicStage(row: Row): "primary" | "secondary" | "" {
  const system = String(row.school_system || row.school_type || "");
  if (system === "smk" || system === "independent") return "secondary";
  if (system === "sk" || system === "sjk") return "primary";
  const level = String(
    row.level || row.course_level || row.course_title || row.title || "",
  ).toUpperCase();
  if (/\bG[1-6]\b/.test(level)) return "primary";
  if (/\b(?:F[1-6]|L[1-3]|H[1-3]|J[1-3]|S[1-3])\b/.test(level))
    return "secondary";
  const year = level.match(/\b(?:YEAR\s*|Y)(1[0-3]|[1-9])\b/);
  return year ? (Number(year[1]) <= 6 ? "primary" : "secondary") : "";
}
export function membershipReason(membership: Row | undefined, today: string) {
  if (!membership || membership.status !== "active")
    return "An accepted registration and confirmed membership payment are required before booking.";
  if (membership.valid_until && String(membership.valid_until) < today)
    return "Your membership has expired. Contact the campus to renew it.";
  return "";
}
export function stageReason(
  student: Row | undefined,
  course: Row,
  policy: BookingPolicy,
) {
  if (!student) return "Choose a learner.";
  if (!policy.enforceSchoolStage) return "";
  const learnerStage = academicStage(student),
    courseStage = academicStage({
      level:
        course.course_level ||
        course.level ||
        course.course_title ||
        course.title,
    });
  if (!learnerStage || !courseStage)
    return "The school stage must be confirmed by the campus before booking this course.";
  if (learnerStage === courseStage) return "";
  const sixthGrade = /\b(?:G6|Y6|YEAR\s*6)\b/i.test(String(student.level));
  if (
    learnerStage === "primary" &&
    sixthGrade &&
    policy.g6SecondaryCourseIds.includes(String(course.course_id || course.id))
  )
    return "";
  return learnerStage === "primary"
    ? "This secondary course is not open to your school stage. G6 exceptions must be enabled by the campus."
    : "This primary course is not open to your school stage.";
}
