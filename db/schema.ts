import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const courses = sqliteTable("courses", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  level: text("level").notNull(),
  totalSessions: integer("total_sessions").notNull(),
  price: real("price").notNull().default(0),
  status: text("status").notNull().default("draft"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const courseSessions = sqliteTable("course_sessions", {
  id: text("id").primaryKey(),
  courseId: text("course_id").notNull().references(() => courses.id),
  sessionNo: integer("session_no").notNull(),
  title: text("title").notNull(),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  status: text("status").notNull().default("planned"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const classrooms = sqliteTable("classrooms", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  capacity: integer("capacity").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const students = sqliteTable("students", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  level: text("level").notNull(),
  guardianPhone: text("guardian_phone").notNull().default(""),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const teachers = sqliteTable("teachers", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  phone: text("phone").notNull().default(""),
  status: text("status").notNull().default("available"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const enrollments = sqliteTable("enrollments", {
  id: text("id").primaryKey(),
  courseId: text("course_id").notNull().references(() => courses.id),
  studentId: text("student_id").notNull().references(() => students.id),
  status: text("status").notNull().default("enrolled"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const resourceBookings = sqliteTable("resource_bookings", {
  id: text("id").primaryKey(),
  courseSessionId: text("course_session_id").notNull().references(() => courseSessions.id),
  resourceType: text("resource_type").notNull().default("classroom"),
  resourceId: text("resource_id").notNull().references(() => classrooms.id),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  status: text("status").notNull().default("reserved"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const teacherBookings = sqliteTable("teacher_bookings", {
  id: text("id").primaryKey(),
  courseSessionId: text("course_session_id").notNull().references(() => courseSessions.id),
  teacherId: text("teacher_id").notNull().references(() => teachers.id),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  compensationAmount: real("compensation_amount").notNull().default(0),
  compensationStatus: text("compensation_status").notNull().default("unpaid"),
  status: text("status").notNull().default("reserved"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const studentBookings = sqliteTable("student_bookings", {
  id: text("id").primaryKey(),
  courseSessionId: text("course_session_id").notNull().references(() => courseSessions.id),
  studentId: text("student_id").notNull().references(() => students.id),
  enrollmentId: text("enrollment_id").references(() => enrollments.id),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  feeAmount: real("fee_amount").notNull().default(0),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  status: text("status").notNull().default("reserved"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const attendanceRecords = sqliteTable("attendance_records", {
  id: text("id").primaryKey(),
  courseSessionId: text("course_session_id").notNull().references(() => courseSessions.id),
  studentId: text("student_id").notNull().references(() => students.id),
  studentBookingId: text("student_booking_id").references(() => studentBookings.id),
  status: text("status").notNull().default("pending"),
  note: text("note").notNull().default(""),
  markedAt: text("marked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// V2 is the operational model used by the management portal.  Legacy tables
// above are retained for migration safety; this group separates a sellable
// course from each actual class intake and its scheduled lessons.
export const academicTerms = sqliteTable("academic_terms", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  startsOn: text("starts_on").notNull(),
  endsOn: text("ends_on").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const courseCatalogs = sqliteTable("course_catalogs", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  subject: text("subject").notNull(),
  level: text("level").notNull(),
  defaultSessions: integer("default_sessions").notNull(),
  defaultMinutes: integer("default_minutes").notNull(),
  listPrice: real("list_price").notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const classRuns = sqliteTable("class_runs", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  courseId: text("course_id").notNull().references(() => courseCatalogs.id),
  termId: text("term_id").notNull().references(() => academicTerms.id),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
  price: real("price").notNull().default(0),
  status: text("status").notNull().default("draft"),
  enrollmentOpenAt: text("enrollment_open_at").notNull().default(""),
  enrollmentCloseAt: text("enrollment_close_at").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const classSessions = sqliteTable("class_sessions", {
  id: text("id").primaryKey(),
  classRunId: text("class_run_id").notNull().references(() => classRuns.id),
  sessionNo: integer("session_no").notNull(),
  topic: text("topic").notNull(),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  status: text("status").notNull().default("scheduled"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const classResourceBookings = sqliteTable("class_resource_bookings", {
  id: text("id").primaryKey(),
  classSessionId: text("class_session_id").notNull().references(() => classSessions.id),
  classroomId: text("classroom_id").notNull().references(() => classrooms.id),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  status: text("status").notNull().default("reserved"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const classTeacherBookings = sqliteTable("class_teacher_bookings", {
  id: text("id").primaryKey(),
  classSessionId: text("class_session_id").notNull().references(() => classSessions.id),
  teacherId: text("teacher_id").notNull().references(() => teachers.id),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  payAmount: real("pay_amount").notNull().default(0),
  payStatus: text("pay_status").notNull().default("unpaid"),
  status: text("status").notNull().default("confirmed"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const classEnrollments = sqliteTable("class_enrollments", {
  id: text("id").primaryKey(),
  classRunId: text("class_run_id").notNull().references(() => classRuns.id),
  studentId: text("student_id").notNull().references(() => students.id),
  contractedFee: real("contracted_fee").notNull().default(0),
  status: text("status").notNull().default("enrolled"),
  enrolledAt: text("enrolled_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const classStudentBookings = sqliteTable("class_student_bookings", {
  id: text("id").primaryKey(),
  classSessionId: text("class_session_id").notNull().references(() => classSessions.id),
  enrollmentId: text("enrollment_id").notNull().references(() => classEnrollments.id),
  studentId: text("student_id").notNull().references(() => students.id),
  allocatedFee: real("allocated_fee").notNull().default(0),
  status: text("status").notNull().default("booked"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const classAttendance = sqliteTable("class_attendance", {
  id: text("id").primaryKey(),
  studentBookingId: text("student_booking_id").notNull().references(() => classStudentBookings.id),
  status: text("status").notNull().default("pending"),
  note: text("note").notNull().default(""),
  markedAt: text("marked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const studentInvoices = sqliteTable("student_invoices", {
  id: text("id").primaryKey(),
  invoiceNo: text("invoice_no").notNull().unique(),
  enrollmentId: text("enrollment_id").notNull().references(() => classEnrollments.id),
  studentId: text("student_id").notNull().references(() => students.id),
  totalAmount: real("total_amount").notNull().default(0),
  paidAmount: real("paid_amount").notNull().default(0),
  status: text("status").notNull().default("unpaid"),
  issuedAt: text("issued_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  dueAt: text("due_at").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const studentPayments = sqliteTable("student_payments", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id").notNull().references(() => studentInvoices.id),
  studentId: text("student_id").notNull().references(() => students.id),
  amount: real("amount").notNull(),
  method: text("method").notNull().default("bank_transfer"),
  receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
