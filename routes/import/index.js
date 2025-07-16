const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const moment = require('moment');
const fs = require('fs');
const { fromPath } = require('pdf2pic');
const path = require('path');
const Spend = require('../../model/Spend');
const auth = require('../../middleware/auth');

const router = express.Router();

// ✅ Ensure uploads folder exists
const uploadsPath = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
}
const upload = multer({ dest: uploadsPath });

// ✅ API Route: /upload (protected by auth middleware)
router.post('/upload', auth, upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ message: 'No file uploaded' });

    try {
        const ext = path.extname(file.originalname).toLowerCase();
        let rawEntries = [];

        // ✅ Route file to appropriate parser
        if (ext.match(/xls|xlsx/)) rawEntries = await readExcel(file.path);
        else if (ext === '.pdf') rawEntries = await readPDF(file.path);
        else if (ext.match(/jpe?g|png/)) rawEntries = await readImage(file.path);
        else return res.status(400).json({ message: 'Unsupported file type' });

        // ✅ Normalize entries and insert them
        const spends = normalizeEntries(rawEntries);
        const result = await insertSpends(spends, req.userId);

        fs.unlinkSync(file.path);

        // ✅ Send summary response
        res.json({
            message: 'Import complete',
            totalRead: result.total,
            inserted: result.inserted,
            skipped: result.skipped,
            skippedDetails: result.skippedEntries.map(e => ({
                date: e.date,
                description: e.description,
                reason: e.reason
            }))
        });

    } catch (err) {
        console.error('❌ Import failed:', err);
        res.status(500).json({ message: 'Internal Server Error during import' });
    }
});

module.exports = router;

// ✅ Normalize entries to expected schema fields
function normalizeEntries(rows) {
    return rows
        .map(row => {
            const normalizedRow = {};
            for (const key in row) {
                const cleanKey = key.toLowerCase().trim();
                normalizedRow[cleanKey] = String(row[key]).trim();
            }
            let rawDate = row.date;
            if (rawDate instanceof Date && !isNaN(rawDate)) {
                rawDate = moment(rawDate).format("YYYY-MM-DD");
            } else {
                rawDate = String(rawDate).trim();
            }
            const dateStr = parseFlexibleDate(rawDate);
            const date = dateStr ? new Date(dateStr) : null;
            const description = normalizedRow.desc || normalizedRow.description || 'N/A';
            const category = normalizedRow.cat || normalizedRow.category || 'Other';
            const type = (normalizedRow.type || 'expense').toLowerCase();
            const amount = parseFloat(normalizedRow.amount?.replace(/[^\d.-]/g, '') || '0');
            return { date, description, category, type, amount };
        })
        .filter(e => e.date && !isNaN(e.date) && e.amount > 0);
}

// ✅ Parse Excel files and return JSON rows
async function readExcel(fp) {
    const wb = xlsx.readFile(fp);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return xlsx.utils.sheet_to_json(sheet);
}

// ✅ Extract text from PDF or fallback to OCR
async function readPDF(fp) {
    const buf = fs.readFileSync(fp);
    try {
        const { text } = await pdfParse(buf);
        if (text && text.trim().length > 20) return parseTextLines(text);
        else return await fallbackToOCR(fp);
    } catch (err) {
        return await fallbackToOCR(fp);
    }
}

// ✅ Fallback to OCR by converting each page of PDF to image
async function fallbackToOCR(fp) {
    const convert = fromPath(fp, {
        density: 150,
        saveFilename: 'ocr_temp',
        savePath: './uploads',
        format: 'png',
        width: 1200,
        height: 1600,
    });

    const pageCount = await getPageCount(fp);
    const textChunks = [];

    for (let i = 1; i <= pageCount; i++) {
        const output = await convert(i);
        const result = await Tesseract.recognize(output.path, 'eng');
        textChunks.push(result.data.text);
        fs.unlinkSync(output.path);
    }
    return parseTextLines(textChunks.join('\n'));
}

// ✅ Count number of pages in a PDF file
async function getPageCount(fp) {
    const data = fs.readFileSync(fp);
    const pdfData = await pdfParse(data);
    return pdfData.numpages || 1;
}

// ✅ Read text from an image using OCR
async function readImage(fp) {
    const res = await Tesseract.recognize(fp, 'eng');
    return parseTextLines(res.data.text);
}

// ✅ Parse extracted text into structured entries
function parseTextLines(text) {
    const lines = text
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);

    const rows = [];
    let entry = {};

    for (const line of lines) {
        // ✅ Case 1: Full labeled single-line
        if (/date[:=].*description[:=].*category[:=].*type[:=].*amount[:=]/i.test(line)) {
            const matches = [...line.matchAll(/([a-zA-Z ]+)[=:]\s*([^:=]+)(?=\s+[a-zA-Z ]+[=:]|$)/g)];
            const obj = {};
            for (const [, key, val] of matches) {
                obj[key.trim().toLowerCase()] = val.trim();
            }
            if (Object.keys(obj).length >= 5) {
                rows.push(obj);
                continue;
            }
        }

        // ✅ Case 2: Labeled multiline format
        const match = line.match(/^([a-zA-Z ]+)[=:]\s*(.+)$/);
        if (match) {
            const key = match[1].trim().toLowerCase();
            const value = match[2].trim();
            entry[key] = value;
            if (key === 'amount') {
                rows.push({ ...entry });
                entry = {};
            }
        } else {
            // ✅ Case 3: Tabular or comma-separated
            const parts = line.split(/,|\t|\s{2,}/).map(p => p.trim()).filter(Boolean);

            // ✅ Case 4: Raw space-separated with multi-word description
            const raw = line.split(/\s+/).filter(Boolean);
            if (
                raw.length >= 5 &&
                !isNaN(Date.parse(raw[0])) &&
                /\d/.test(raw[raw.length - 1])
            ) {
                const date = raw[0];
                const amount = extractAmount(raw[raw.length - 1]);
                const type = fixType(raw[raw.length - 2]);
                const category = raw[raw.length - 3];
                const description = raw.slice(1, raw.length - 3).join(' ');
                rows.push({ date, description, category, type, amount });
                continue;
            }

            // ✅ Case 5: Jumbled 5-item line (guess logic)
            if (raw.length === 5) {
                const guess = {};
                for (const token of raw) {
                    if (!guess.date && parseFlexibleDate(token)) guess.date = parseFlexibleDate(token);
                    else if (!guess.amount && /\d/.test(token)) guess.amount = extractAmount(token);
                    else if (!guess.type && /income|expense/i.test(token)) guess.type = fixType(token);
                    else if (!guess.category) guess.category = token;
                    else if (!guess.description) guess.description = token;
                }
                if (guess.date && guess.description && guess.category && guess.type && guess.amount) {
                    rows.push(guess);
                    continue;
                }
            }

            // ✅ Final fallback: basic table row
            if (parts.length >= 5) {
                rows.push({
                    date: parts[0],
                    description: parts[1],
                    category: parts[2],
                    type: fixType(parts[3]),
                    amount: extractAmount(parts[4])
                });
            }
        }
    }

    return rows;
}

// ✅ Try multiple date formats using moment.js
function parseFlexibleDate(str) {
    const formats = [
        "YYYY-MM-DD", "DD-MM-YYYY", "DD/MM/YYYY", "YYYY/MM/DD", "YYYY.MM.DD",
        "DD.MM.YYYY", "MMMM D, YYYY", "D MMMM YYYY", "D MMM YYYY", "MMM D YYYY",
        "Do MMMM YYYY", "DD-MM-YY", "DD/MM/YY", "DD.MM.YY"
    ];
    for (const fmt of formats) {
        const parsed = moment(str, fmt, true);
        if (parsed.isValid()) return parsed.format("YYYY-MM-DD");
    }
    return null;
}

// ✅ Extract amount as number from values like "₹500", "$1,000", "€100.50"
function extractAmount(value) {
    if (typeof value !== 'string') return 0;
    const cleaned = value.replace(/[^\d.-]/g, '');
    return parseFloat(cleaned || '0');
}

// ✅ Normalize type strings (handle typos)
function fixType(type) {
    const val = type?.toLowerCase();
    if (val === 'expnse' || val === 'exp' || val === 'ex') return 'expense';
    if (val === 'incom' || val === 'inc' || val === 'in') return 'income';
    return val;
}

// ✅ Format JS Date to YYYY-MM-DD for comparison
function formatDateOnly(date) {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
}

// ✅ Insert new entries and skip duplicates
async function insertSpends(entries, userId) {
    let insertedCount = 0;
    let skippedCount = 0;
    const skippedEntries = [];

    for (const e of entries) {
        const dateOnly = formatDateOnly(e.date);
        const exists = await Spend.findOne({
            user: userId,
            description: e.description,
            amount: e.amount,
            date: {
                $gte: new Date(dateOnly),
                $lt: new Date(new Date(dateOnly).getTime() + 24 * 60 * 60 * 1000),
            }
        });

        if (!exists) {
            try {
                const sp = new Spend({ ...e, user: userId });
                await sp.save();
                insertedCount++;
            } catch (err) {
                skippedCount++;
                skippedEntries.push({ ...e, reason: 'Save failed' });
            }
        } else {
            skippedCount++;
            skippedEntries.push({ ...e, reason: 'Duplicate' });
        }
    }

    return {
        total: entries.length,
        inserted: insertedCount,
        skipped: skippedCount,
        skippedEntries
    };
}
