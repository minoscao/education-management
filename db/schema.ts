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
