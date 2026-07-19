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

  assert.match(page, /<ManagementPortal\s*\/>/);
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
  assert.match(portal, /function ClassRunScheduleForm/);
  assert.match(portal, /function ResizableDataTable/);
  assert.match(portal, /function CalendarView/);

  assert.match(css, /\.table-scroll\s*\{[\s\S]*overflow:\s*auto/);
  assert.match(css, /\.course-card-gallery[\s\S]*minmax\(min\(100%, 270px\)/);
  assert.match(css, /@media \(max-width:\s*760px\)/);
  assert.match(css, /button:focus-visible/);
});
