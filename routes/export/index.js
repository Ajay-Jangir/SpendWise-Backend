const express = require('express');
const PDFDocument = require('pdfkit');
const moment = require('moment');
const Spend = require('../../model/Spend');
const User = require('../../model/User');
const auth = require('../../middleware/auth');

const router = express.Router();

router.get('/pdf', auth, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const user = await User.findById(req.userId);

        let start, end;
        if (startDate && endDate) {
            start = new Date(startDate);
            end = new Date(endDate);
        } else if (startDate && !endDate) {
            start = moment(startDate).startOf('month').toDate();
            end = moment(start).add(12, 'months').endOf('month').toDate();
        } else {
            end = moment().endOf('month').toDate();
            start = moment(end).subtract(12, 'months').startOf('month').toDate();
        }

        const spends = await Spend.find({
            user: req.userId,
            date: { $gte: start, $lte: end }
        }).sort({ date: 1 });

        const grouped = {};
        spends.forEach(spend => {
            const month = moment(spend.date).format('MMMM YYYY');
            if (!grouped[month]) grouped[month] = [];
            grouped[month].push(spend);
        });

        const doc = new PDFDocument({ margin: 20 });
        res.setHeader('Content-Disposition', 'attachment; filename=SpendReport.pdf');
        res.setHeader('Content-Type', 'application/pdf');
        doc.pipe(res);

        // Header
        doc.fontSize(22).text(`Spend Report for ${user.name}`, { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(12).fillColor('gray').text(`Generated on: ${moment().format('DD MMM YYYY')}`, { align: 'center' });
        doc.fillColor('black').moveDown(1);

        const months = [];
        let iterMonth = moment(start).startOf('month');
        const endMonth = moment(end).startOf('month');

        while (iterMonth <= endMonth) {
            months.push(iterMonth.format('MMMM YYYY'));
            iterMonth.add(1, 'month');
        }

        months.reverse().forEach(month => {
            const monthSpends = grouped[month] || [];
            if (monthSpends.length === 0) return;

            const rowHeight = 20;
            const estimatedHeight = (monthSpends.length + 5) * rowHeight;

            if (doc.y + estimatedHeight > doc.page.height - 60) {
                doc.addPage();
            }

            doc.fontSize(16).text(month, 0, doc.y, { align: 'center', underline: true, width: doc.page.width });
            doc.moveDown(0.5);

            const boxX = 40;
            let boxY = doc.y;
            const boxWidth = 520;
            const padding = 10;
            const boxHeight = (monthSpends.length + 3) * rowHeight;
            doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 8).stroke();

            let y = boxY + padding;
            doc.fontSize(11).font('Helvetica-Bold');
            doc.text('Date', boxX + 5, y);
            doc.text('Description', boxX + 80, y);
            doc.text('Category', boxX + 220, y);
            doc.text('Type', boxX + 330, y);
            doc.text('Amount', boxX + 430, y);

            y += rowHeight;
            doc.moveTo(boxX + 5, y - 5).lineTo(boxX + boxWidth - 5, y - 5).stroke();
            doc.font('Helvetica').fontSize(10);

            let monthIncomeTotal = 0;
            let monthExpenseTotal = 0;

            monthSpends.forEach(s => {
                const color = s.type === 'income' ? 'green' : 'red';
                if (s.type === 'income') monthIncomeTotal += s.amount;
                else monthExpenseTotal += s.amount;

                doc.fillColor('black').text(moment(s.date).format('DD MMM'), boxX + 5, y);
                doc.text(s.description.slice(0, 18), boxX + 80, y);
                doc.text(s.category.slice(0, 15), boxX + 220, y);
                doc.fillColor(color).text(s.type, boxX + 330, y);
                doc.text(`Rs.${s.amount}`, boxX + 430, y);
                doc.fillColor('black');

                y += rowHeight;
                doc.moveTo(boxX + 5, y - 5).lineTo(boxX + boxWidth - 5, y - 5).dash(1, { space: 2 }).stroke().undash();
            });

            y += 5;
            doc.font('Helvetica-Bold').fontSize(10);
            doc.text(`Total Income: Rs.${monthIncomeTotal}`, boxX + 5, y);
            doc.text(`Total Expense: Rs.${monthExpenseTotal}`, boxX + 250, y);
            doc.font('Helvetica');

            // Spacing before next month
            const nextY = y + 50;
            if (nextY > doc.page.height - 100) {
                doc.addPage();
                doc.y = 50;
            } else {
                doc.y = nextY;
            }
        });

        // Summary calculation
        const totalIncome = spends
            .filter(s => s.type === 'income')
            .reduce((sum, s) => sum + s.amount, 0);

        const totalExpense = spends
            .filter(s => s.type === 'expense')
            .reduce((sum, s) => sum + s.amount, 0);

        // Summary placement
        const summaryHeight = 80;
        if (doc.y + summaryHeight < doc.page.height - 50) {
            doc.moveDown(2);
        } else {
            doc.addPage();
            doc.y = 50;
        }

        // Final Summary
        const leftX = 40; // consistent left margin
        const pageWidth = doc.page.width - leftX * 2;

        doc.moveDown(2); // Add spacing before summary (optional)
        doc.fontSize(16)
            .fillColor('black')
            .text('Summary', leftX, doc.y, { underline: true, width: pageWidth });

        doc.moveDown(0.5);
        doc.fontSize(14)
            .fillColor('green')
            .text(`Total Income: Rs.${totalIncome}`, leftX, doc.y, { width: pageWidth });

        doc.fillColor('red')
            .text(`Total Expense: Rs.${totalExpense}`, leftX, doc.y, { width: pageWidth });

        doc.fillColor('black');


        doc.end();

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to generate PDF' });
    }
});

module.exports = router;
