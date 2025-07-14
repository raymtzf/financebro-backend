import pdf from 'pdf-parse';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method === 'GET') {
        res.status(200).json({
            status: "PDF Processor Ready (WITH USER TIP)",
            message: "Fixed: day comes BEFORE description, not after"
        });
        return;
    }
    
    if (req.method === 'POST') {
        try {
            const { pdf_data, filename } = req.body;
            
            if (!pdf_data) {
                res.status(400).json({
                    success: false,
                    error: "No PDF data provided"
                });
                return;
            }

            console.log('Processing Banregio PDF:', filename);
            
            // Decode base64 PDF
            const pdfBuffer = Buffer.from(pdf_data, 'base64');
            
            // Extract text from PDF
            const pdfData = await pdf(pdfBuffer);
            const pdfText = pdfData.text;
            
            console.log('PDF text extracted, length:', pdfText.length);
            
            // Use corrected logic with user tip
            const result = processBanregioPDFWithTip(pdfText, filename);
            
            res.status(200).json(result);
            
        } catch (error) {
            console.error('PDF processing error:', error);
            res.status(500).json({
                success: false,
                error: `PDF processing failed: ${error.message}`
            });
        }
        return;
    }
    
    res.status(405).json({ error: "Method not allowed" });
}

function processBanregioPDFWithTip(pdfText, filename) {
    console.log('Processing Banregio PDF with user tip...');
    
    try {
        // Extract statement period
        const period = extractStatementPeriod(pdfText);
        console.log('Extracted period:', period);
        
        // Use corrected extraction with tip
        const transactions = extractTransactionsWithTip(pdfText, period);
        
        console.log(`Extracted ${transactions.length} transactions`);
        
        return {
            success: true,
            transactions: transactions,
            metadata: {
                filename: filename,
                statement_period: period,
                total_transactions: transactions.length,
                processing_method: "Corrected with user tip: day before description"
            }
        };
        
    } catch (error) {
        console.error('Error processing PDF content:', error);
        return {
            success: false,
            error: `Failed to process PDF content: ${error.message}`,
            transactions: []
        };
    }
}

function extractStatementPeriod(pdfText) {
    const periodMatch = pdfText.match(/del \d+ al \d+ de (\w+)\s+(\d{4})/i);
    
    if (periodMatch) {
        const monthName = periodMatch[1].toLowerCase();
        const year = parseInt(periodMatch[2]);
        
        const months = {
            'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
            'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
            'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
        };
        
        return {
            month: months[monthName] || 1,
            year: year,
            month_name: monthName.charAt(0).toUpperCase() + monthName.slice(1)
        };
    }
    
    return { month: 3, year: 2024, month_name: 'Marzo' };
}

function extractTransactionsWithTip(pdfText, period) {
    const transactions = [];
    const lines = pdfText.split('\n');
    
    console.log('Processing', lines.length, 'lines with user tip');
    
    let i = 0;
    
    while (i < lines.length) {
        const line = lines[i].trim();
        
        // Look for amount lines "amount1 amount2"
        const amountMatch = line.match(/^\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/);
        
        if (amountMatch) {
            const amount1 = parseFloat(amountMatch[1].replace(/,/g, ''));
            
            console.log('Found amount line:', line, '→', amount1);
            
            // TIP: Look for day BEFORE collecting description
            let dayFound = null;
            let descriptionStart = i + 1;
            
            // Check next few lines for a standalone day number
            for (let k = i + 1; k < Math.min(i + 5, lines.length); k++) {
                const checkLine = lines[k].trim();
                
                // If it's a standalone day number (01, 02, 03, etc.)
                if (checkLine.match(/^\d{1,2}$/) && parseInt(checkLine) >= 1 && parseInt(checkLine) <= 31) {
                    dayFound = parseInt(checkLine);
                    descriptionStart = k + 1; // Description starts AFTER the day
                    console.log(`📅 Found day BEFORE description: ${dayFound}`);
                    break;
                }
                
                // If it's a description line, stop looking for day
                if (checkLine && checkLine.length > 5 && !checkLine.match(/^\d+$/)) {
                    break;
                }
            }
            
            // Collect description starting from the correct position
            let description = '';
            let j = descriptionStart;
            const maxLookAhead = 15;
            
            while (j < lines.length && j < descriptionStart + maxLookAhead) {
                const nextLine = lines[j].trim();
                
                // Stop if we hit another amount line
                if (nextLine.match(/^\s*[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s*$/)) {
                    break;
                }
                
                // Stop if we hit another day number (start of next transaction)
                if (nextLine.match(/^\d{1,2}$/) && parseInt(nextLine) <= 31) {
                    break;
                }
                
                // Add description lines
                if (nextLine && nextLine.length > 0 && 
                    !nextLine.match(/^(DIA|CONCEPTO|CARGOS|ABONOS|SALDO|Page \d+ of \d+)$/i)) {
                    if (description) description += ' ';
                    description += nextLine;
                }
                
                j++;
            }
            
            // Create transaction if we have description
            if (description && description.length > 10) {
                
                // Get correct date using tip
                const correctDate = buildDateFromDayAndDescription(dayFound, description, period);
                
                // Detect cargo/abono
                const isAbono = detectIfAbonoWorking(description);
                
                const transaction = {
                    transaction_date: correctDate,
                    description: description.trim(),
                    amount: isAbono ? amount1 : -amount1,
                    transaction_type: isAbono ? 'credit' : 'debit',
                    category: getCategoryFromDescription(description)
                };
                
                transactions.push(transaction);
                
                console.log('✅ Created transaction:', {
                    day: dayFound,
                    date: correctDate,
                    amount: transaction.amount,
                    type: transaction.transaction_type,
                    desc: description.substring(0, 50) + '...'
                });
            }
            
            i = j;
        } else {
            i++;
        }
    }
    
    // Remove duplicates and sort
    const uniqueTransactions = removeDuplicates(transactions);
    return uniqueTransactions.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
}

function buildDateFromDayAndDescription(dayFound, description, period) {
    console.log('Building date from day and description...');
    
    // First, try to find full date DD/MM/YYYY in description
    const dateMatches = description.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g);
    
    if (dateMatches && dateMatches.length > 0) {
        const dateMatch = dateMatches[0].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        const day = parseInt(dateMatch[1]);
        const month = parseInt(dateMatch[2]);
        const year = parseInt(dateMatch[3]);
        
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year > 2020) {
            const date = new Date(year, month - 1, day);
            const dateString = date.toISOString().split('T')[0];
            
            console.log(`🎯 Using FULL date from description: ${day}/${month}/${year} → ${dateString}`);
            return dateString;
        }
    }
    
    // If no full date found, use the day that comes before description (USER TIP)
    if (dayFound !== null) {
        const year = period.year;
        const month = period.month;
        
        // Validate day for this month
        const maxDay = new Date(year, month, 0).getDate();
        const validDay = Math.min(Math.max(1, dayFound), maxDay);
        
        const date = new Date(year, month - 1, validDay);
        const dateString = date.toISOString().split('T')[0];
        
        console.log(`🎯 Using DAY from tip: ${dayFound} → ${period.month_name} ${dayFound}, ${year} → ${dateString}`);
        return dateString;
    }
    
    // Fallback to period start
    console.log(`⚠️ No date found, using period start`);
    return `${period.year}-${String(period.month).padStart(2, '0')}-01`;
}

function detectIfAbonoWorking(description) {
    const desc = description.toLowerCase();
    
    // ABONO patterns
    const abonoPatterns = [
        'int ', 'abono', 'deposito', 'pago mr sabor', 'ingreso',
        'insumos', 'multisabor'
    ];
    
    // CARGO patterns
    const cargoPatterns = [
        'tra spei-', 'comision', 'administracion', 'manejo de cuenta',
        'cargo', 'retiro', 'transferencia de', 'facebook', 'facebk'
    ];
    
    // Check abono patterns
    for (const pattern of abonoPatterns) {
        if (desc.includes(pattern)) {
            console.log(`🟢 ABONO detected: ${pattern}`);
            return true;
        }
    }
    
    // Check cargo patterns
    for (const pattern of cargoPatterns) {
        if (desc.includes(pattern)) {
            console.log(`🔴 CARGO detected: ${pattern}`);
            return false;
        }
    }
    
    // Check recipient names
    if (desc.includes('natalia') || desc.includes('lupita') || desc.includes('granola') || desc.includes('nueztra')) {
        console.log(`🔴 CARGO detected: recipient name`);
        return false;
    }
    
    return false;
}

function getCategoryFromDescription(description) {
    const desc = description.toLowerCase();
    
    if (desc.includes('comision') || desc.includes('administracion') || desc.includes('manejo')) {
        return 'Comisiones';
    } else if (desc.includes('facebook') || desc.includes('facebk')) {
        return 'Servicios';
    } else if (desc.includes('spei') || desc.includes('transferencia')) {
        return 'Transferencias';
    } else if (desc.includes('mr sabor') || desc.includes('insumos') || desc.includes('int ')) {
        return 'Ingresos';
    } else {
        return 'Sin clasificar';
    }
}

function removeDuplicates(transactions) {
    const seen = new Set();
    return transactions.filter(transaction => {
        const shortDesc = transaction.description.substring(0, 50);
        const key = `${transaction.transaction_date}-${shortDesc}-${transaction.amount}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
