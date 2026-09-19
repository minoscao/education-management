import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

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
  assert.match(portal, /<DetailEditAction label="编辑课程"/);
  assert.match(portal, /<DetailEditAction label="编辑班次"/);
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
});
