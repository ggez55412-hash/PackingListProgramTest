
// src/utils/csv.ts
// Utility สำหรับอ่าน/เขียน CSV ให้ TypeScript เงียบในโหมด strict
// - parseCSV(text: string)  -> any[]  (ใช้กับไฟล์ .csv ที่อ่านด้วย FileReader)
// - toCSV(rows: any[])      -> string (export สำหรับดาวน์โหลด)
// - parseCsv(lines: string[][]) -> { ok, errors } (ใช้ normalize/validate)

export type CsvRow = string[];
export type HeaderIndex = Record<string, number>;

export type NormalizedLine = {
  orderId: string;
  sku: string;
  qty: number;    // number เสมอ
  weight: number; // number เสมอ
};

export type ParseResult = {
  ok: NormalizedLine[];
  errors: string[];
};

// ---------- ปรับชื่อคอลัมน์ให้ตรงกับไฟล์จริงของคุณ (สำหรับ parseCsv) ----------
const REQUIRED_COLS = ['Order ID', 'SKU', 'Qty', 'Weight'] as const;
// -----------------------------------------------------------------

/* =========================================================================
 * 1) CSV TEXT PARSER (สำหรับ parseCSV) — robust ต่อ comma/quote/newline ในฟิลด์
 * ========================================================================= */

/** แปลง CSV text -> matrix (string[][]) รองรับ quote/comma/newline ในฟิลด์ */
function textToMatrix(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const pushCell = () => { row.push(cell); cell = ''; };
  const pushRow = () => { rows.push(row); row = []; };

  const input = String(csvText ?? '');

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = input[i + 1];
        if (next === '"') {
          cell += '"'; // escaped quote
          i++;
        } else {
          inQuotes = false; // close quote
        }
      } else {
        cell += ch;
      }
      continue;
    }

    // not in quotes
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushCell();
    } else if (ch === '\r') {
      // skip CR; handle on LF
    } else if (ch === '\n') {
      pushCell();
      pushRow();
    } else {
      cell += ch;
    }
  }

  // last cell/row
  pushCell();
  pushRow();

  // ตัดแถวท้ายที่ว่างจริง ๆ ออก (เช็คแบบ safe เพื่อกัน TS2532)
  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (!Array.isArray(last)) break;
    if (last.length === 0 || last.every((c) => c === '')) {
      rows.pop();
      continue;
    }
    break;
  }

  return rows;
}

/** แปลง matrix -> objects (ใช้ header แถวแรกเป็นคีย์) */
function matrixToObjects(matrix: string[][]): any[] {
  if (!Array.isArray(matrix) || matrix.length === 0) return [];
  const headerRow = matrix[0] ?? [];
  const headers = headerRow.map((h) => String(h ?? '').trim());
  const out: any[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i] ?? '';
      const v = row[i] ?? '';
      obj[String(h)] = String(v).trim();
    }
    out.push(obj);
  }
  return out;
}

/**
 * parseCSV — ใช้กับไฟล์ .csv ที่อ่านด้วย FileReader (ได้เป็น string)
 * คืน array ของอ็อบเจ็กต์ โดยอิงหัวตารางเป็นคีย์
 */
export function parseCSV(csvText: string): any[] {
  const matrix = textToMatrix(String(csvText ?? ''));
  return matrixToObjects(matrix);
}

/**
 * toCSV — แปลง array ของ object -> CSV string (escape อัตโนมัติ)
 */
export function toCSV(rows: any[]): string {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r ?? {}))));
  const headerLine = headers.join(',');
  const body = rows
    .map((r) =>
      headers
        .map((h) => {
          const v = r?.[h] ?? '';
          const s = String(v);
          return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    )
    .join('\n');
  return `${headerLine}\n${body}`;
}

/* =========================================================================
 * 2) PARSE แบบ NORMALIZE (สำหรับงาน pallets/validate detail)
 * ========================================================================= */

/** แปลงข้อความเป็น number ปลอดภัย: คืน number เสมอ (parse ไม่ได้ -> NaN) */
const toNumber = (s: string): number => {
  const n = Number(String(s).replace(/[, ]/g, '').replace(/kg/i, ''));
  return Number.isFinite(n) ? n : NaN;
};

/** สร้าง header map และ validate ให้คอลัมน์จำเป็นมีครบ */
function buildHeaderIndex(
  headers: (string | undefined)[],
  required: readonly string[]
): HeaderIndex {
  const idxMap: Partial<Record<string, number>> = {};
  for (let i = 0; i < headers.length; i++) {
    const key = String(headers[i] ?? '').trim();
    if (key) idxMap[key] = i;
  }
  const missing = required.filter((col) => idxMap[col] === undefined);
  if (missing.length) {
    throw new Error(`Missing required column(s): ${missing.join(', ')}`);
  }
  return idxMap as HeaderIndex; // ปลอดภัยหลัง validate แล้ว
}

/** ดึง index แบบ type-safe (กัน key undefined/ว่าง/ไม่มีใน map) */
function getIndex(map: HeaderIndex, key: unknown, labelForError?: string): number {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error(
      `Invalid column key${labelForError ? ` (${labelForError})` : ''}: ${String(key)}`
    );
  }
  if (!(key in map)) {
    throw new Error(`Missing column: ${key}`);
  }
  return map[key]!; // number แน่นอน
}

/** คืนค่า cell เป็น string เสมอ (ถ้าเซลล์ไม่มี -> '') */
function getCell(row: CsvRow, map: HeaderIndex, key: unknown): string {
  const idx = getIndex(map, key);
  const v = row[idx];
  return v === undefined || v === null ? '' : String(v);
}

/** บังคับให้ได้ number เสมอ (ไม่มี undefined; ใช้ NaN แทนเมื่อ parse ไม่ได้) */
function forceNumber(s: string): number {
  return toNumber(s);
}

/**
 * parseCsv — ใช้กับ matrix (แถวแรกคือ header) สำหรับ normalize/validate
 * คืน { ok, errors } โดยที่ qty/weight เป็น number เสมอ
 */
export function parseCsv(lines: string[][]): ParseResult {
  const errors: string[] = [];
  const ok: NormalizedLine[] = [];

  if (!Array.isArray(lines) || lines.length === 0) {
    return { ok, errors: ['Empty file'] };
  }

  const headerRow = (lines[0] ?? []) as (string | undefined)[];
  let hMap: HeaderIndex;
  try {
    hMap = buildHeaderIndex(headerRow, REQUIRED_COLS);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok, errors: [msg] };
  }

  // data rows
  for (let r = 1; r < lines.length; r++) {
    const row = (lines[r] ?? []) as CsvRow;

    // อ่าน string เสมอ
    const orderIdStr: string = getCell(row, hMap, 'Order ID');
    const skuStr: string     = getCell(row, hMap, 'SKU');
    const qtyStr: string     = getCell(row, hMap, 'Qty');
    const weightStr: string  = getCell(row, hMap, 'Weight');

    // แปลงเป็น number เสมอ
    const qty: number    = forceNumber(qtyStr);
    const weight: number = forceNumber(weightStr);

    // Validate
    const rowErrors: string[] = [];
    const rowNo = r + 1;

    if (!orderIdStr.trim()) rowErrors.push(`Row ${rowNo}: Order ID is required`);
    if (!skuStr.trim())     rowErrors.push(`Row ${rowNo}: SKU is required`);
    if (!Number.isFinite(qty) || qty <= 0)      rowErrors.push(`Row ${rowNo}: Qty invalid`);
    if (!Number.isFinite(weight) || weight < 0) rowErrors.push(`Row ${rowNo}: Weight invalid`);

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    // push โครงสร้างที่ชนิดชัดเจน (ไม่มี number | undefined)
    ok.push({
      orderId: orderIdStr.trim(),
      sku: skuStr.trim(),
      qty,
      weight,
    });
  }

  return { ok, errors };
}
