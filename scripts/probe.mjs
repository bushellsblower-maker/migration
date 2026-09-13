import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: node scripts/probe.mjs <file>...");
  process.exit(1);
}

function previewSheet(wb, name, rows = 12, cols = 10) {
  const sheet = wb.Sheets[name];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  console.log(`\n=== ${name} (${aoa.length} rows) ===`);
  for (const row of aoa.slice(0, rows)) {
    const cells = row.slice(0, cols).map((c) => String(c).replace(/\s+/g, " ").slice(0, 40));
    console.log(cells.join(" | "));
  }
}

for (const file of files) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs) || fs.statSync(abs).size === 0) {
    console.log(`\n#### MISSING ${file}`);
    continue;
  }
  console.log(`\n######## ${file} (${fs.statSync(abs).size} bytes)`);
  try {
    const wb = XLSX.read(fs.readFileSync(abs), { type: "buffer", cellDates: true });
    console.log("sheets:", wb.SheetNames.join(" || "));
    for (const name of wb.SheetNames.slice(0, 8)) previewSheet(wb, name);
  } catch (err) {
    console.log("READ ERROR", err.message);
  }
}
