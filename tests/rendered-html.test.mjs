import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("student home shares lesson cards, attendance mode and compact balance views", async () => {
  const portal = await readProjectFile("app/management-portal.tsx");
  const css = await readProjectFile("app/student-learning.css");
  const page = await readProjectFile("app/student/page.tsx");
  const home = portal.slice(portal.indexOf('function StudentHome('), portal.indexOf('function activePasses('));
  assert.match(page, /initialRole="student"/);
  assert.match(home, /<StudentCourses[^>]+compact/);
  assert.match(home, /<StudentPassSummary[^>]+compact/);
  assert.match(home, /<StudentLessonCard/);
  assert.doesNotMatch(home, /learning-hero|student-focus-grid/);
  assert.match(portal, /function AttendanceModeSwitch/);
  assert.match(portal, /Use 1 credit & join/);
  assert.match(portal, /Unlimited online places/);
  for (const action of ['Book onsite', 'Book online', 'Book study']) assert.ok(portal.includes(action));
  assert.match(css, /student-week-lesson:disabled[^}]+filter: grayscale\(1\)/);
  assert.match(css, /student-booking-dock[^}]+position: fixed/);
  for (let index = 0; index < 10; index++) {
    const photo = await readFile(new URL(`public/assets/teachers/demo-${index}.jpg`, root));
    assert.equal(photo.readUInt16BE(0), 0xffd8);
    assert.ok(photo.length > 1000);
  }
});

async function readProjectFile(path) {
  return readFile(new URL(path, root), "utf8");
}

test("renders the teaching portal from the home route", async () => {
  const [page, portal] = await Promise.all([
    readProjectFile("app/page.tsx"),
    readProjectFile("app/management-portal.tsx"),
  ]);

  assert.match(page, /<ManagementPortal\s+initialView=/);
  assert.match(portal, /export function ManagementPortal/);
  assert.match(portal, /fetch\("\/api\/portal-data"/);
  assert.match(portal, /setData\(/);
});

test("keeps shared detail and responsive view primitives in place", async () => {
  const [portal, css] = await Promise.all([
    readProjectFile("app/management-portal.tsx"),
    readProjectFile("app/globals.css"),
  ]);

  assert.match(portal, /function DetailSheet/);
  assert.match(portal, /function DetailTabs/);
  assert.match(portal, /function CourseCatalogueDrawer/);
  assert.match(portal, /function CourseIntakeCards/);
  assert.match(portal, /function cohortPhase/);
  assert.match(portal, /function ClassSettingsDialog/);
  assert.match(portal, /function ClassScheduleDialog/);
  assert.match(portal, /function QuickScheduleDialog/);
  assert.doesNotMatch(portal, /id: "configure"/);
  assert.match(portal, /function ResizableDataTable/);
  assert.match(portal, /function CalendarView/);
  assert.match(portal, /function SmartDatePicker/);

  assert.match(css, /\.table-scroll\s*\{[\s\S]*overflow:\s*auto/);
  assert.match(css, /\.course-card-gallery[\s\S]*minmax\(min\(100%, 270px\)/);
  assert.match(css, /@media \(max-width:\s*760px\)/);
  assert.match(css, /button:focus-visible/);
});

test("detail editing stays visible on narrow screens and uses shared save behavior", async () => {
  const portal = await readProjectFile("app/management-portal.tsx");
  const css = await readProjectFile("app/globals.css");
  assert.match(portal, /<DetailEditAction label="Edit course"/);
  assert.match(portal, /<DetailEditAction label="Edit class"/);
  assert.match(portal, /run\("updateClassroom",/);
  assert.match(portal, /if \(await onSave\(Object.fromEntries\(new FormData\(event.currentTarget\)\)\)\) onClose\(\)/);
  assert.match(css, /\.entity-header-actions \.detail-edit-action\s*\{\s*display: inline-flex; min-height: 44px;/);
});

test("pass checkout preserves the course choice and never asks to choose it again", async () => {
  const portal = await readProjectFile("app/management-portal.tsx");
  const purchase = portal.slice(portal.indexOf('function PassPurchaseDialog('), portal.indexOf('function StudentCourses('));
  assert.doesNotMatch(purchase, /Choose your onsite course|setRunId|pass-run-list|Choose later/);
  assert.match(purchase, /sessionId: target\?\.sessionId, deliveryMode: target\?\.deliveryMode/);
  assert.match(portal, /Use existing pass balance/);
  assert.match(portal, /Buy a new pass/);
  assert.match(portal, /bookingRunId && !passPurchaseOpen/);
  assert.doesNotMatch(purchase, /Not enough valid credits|!offer.suitable/);
  assert.match(purchase, /reservationMonths: 1, passStartAt: startDay/);
  assert.match(purchase, /<span>Start date<\/span>/);
});

test("student tables share contacts and WhatsApp drafts do not claim delivery", async () => {
  const portal = await readProjectFile("app/management-portal.tsx");
  assert.match(portal, /StudentDirectoryContext.Provider value={studentDirectory}/);
  assert.match(portal, /label: "Guardian contact"/);
  assert.match(portal, /function StudentContact/);
  const communication = portal.slice(portal.indexOf('function CommunicationPanel('), portal.indexOf('function StudentCourseProgress('));
  assert.match(communication, /channel: "whatsapp"/);
  assert.match(communication, /Draft - not sent/);
  assert.doesNotMatch(communication, /mailto:|Send email/);
});
