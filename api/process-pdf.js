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
            status: "PDF Processor Ready (BANREGIO IMPROVED)",
            message: "Fixed descriptions, dates, and cargo/abono detection"
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
            
            // Process the extracted text with improved Banregio parser
            const result = processBanregioPDF(pdfText, filename);
            
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

function processBanregioPDF(pdfText, filename) {
    console.log('Processing Banregio PDF text...');
    
    try {
        // Extract statement period
        const period = extractStatementPeriod(pdfText);
        console.log('Extracted period:', period);
        
        // Extract transactions using improved Banregio parser
        const transactions = extractBanregioTransactions(pdfText, period);
        
        console.log(`Extracted ${transactions.length} transactions`);
        
        return {
            success: true,
            transactions: transactions,
            metadata: {
                filename: filename,
                statement_period: period,
                total_transactions: transactions.length,
                processing_method: "Improved Banregio parser v2"
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
    // Extract period like "del 01 al 31 de MARZO 2024"
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

function extractBanregioTransactions(pdfText, period) {
    const transactions = [];
    const lines = pdfText.split('\n');
    
    console.log('Processing', lines.length, 'lines from Banregio PDF');
    
    let i = 0;
    
    while (i < lines.length) {
        const line = lines[i].trim();
        
        // Look for lines that look like transaction amounts
        // Pattern: amount1 amount2 (cargo/saldo or abono/saldo)
        const amountMatch = line.match(/^\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/);
        
        if (amountMatch) {
            const amount1 = parseFloat(amountMatch[1].replace(/,/g, ''));
            const amount2 = parseFloat(amountMatch[2].replace(/,/g, ''));
            
            console.log('Found amount line:', line, '→', amount1, amount2);
            
            // Collect description from next lines until we find the day
            let description = '';
            let day = null;
            let j = i + 1;
            const maxLookAhead = 15; // Look ahead more lines for complete description
            
            while (j < lines.length && j < i + maxLookAhead) {
                const nextLine = lines[j].trim();
                
                // Stop if we hit another amount line
                if (nextLine.match(/^\s*[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s*$/)) {
                    break;
                }
                
                // If it's just a day number (1-31), this is the day
                if (nextLine.match(/^\d{1,2}$/) && parseInt(nextLine) <= 31) {
                    day = parseInt(nextLine);
                    j++;
                    break;
                }
                
                // If it's a description line, add it
                if (nextLine && nextLine.length > 0 && !nextLine.match(/^(DIA|CONCEPTO|CARGOS|ABONOS|SALDO)$/i)) {
                    if (description && !description.endsWith(' ')) {
                        description += ' ';
                    }
                    description += nextLine;
                }
                
                j++;
            }
            
            // Determine if it's cargo or abono by analyzing the context
            const isAbono = detectIfAbono(description, pdfText, i);
            
            // Create transaction if we have valid data
            if (description && day) {
                const transaction = {
                    transaction_date: buildDate(day, period),
                    description: description.trim(),
                    amount: isAbono ? amount1 : -amount1, // Positive for abonos, negative for cargos
                    transaction_type: isAbono ? 'credit' : 'debit',
                    category: getCategoryFromDescription(description)
                };
                
                transactions.push(transaction);
                console.log('Found transaction:', {
                    day,
                    desc: transaction.description.substring(0, 50) + '...',
                    amount: transaction.amount,
                    type: transaction.transaction_type
                });
            }
            
            i = j;
        } else {
            i++;
        }
    }
    
    // Remove duplicates and sort
    const uniqueTransactions = removeDuplicateTransactions(transactions);
    return uniqueTransactions.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
}

function detectIfAbono(description, fullText, lineIndex) {
    const desc = description.toLowerCase();
    
    // Patterns that clearly indicate ABONOS (ingresos)
    const abonoPatterns = [
        'int ', 'abono', 'deposito', 'pago mr sabor', 'ingreso',
        'transferencia a favor', 'acreditacion', 'devolucion'
    ];
    
    // Patterns that clearly indicate CARGOS (gastos)
    const cargoPatterns = [
        'tra spei-', 'comision', 'administracion', 'manejo de cuenta',
        'cargo', 'retiro', 'transferencia de', 'pago a'
    ];
    
    // Check for abono patterns first
    for (const pattern of abonoPatterns) {
        if (desc.includes(pattern)) {
            console.log('Detected ABONO by pattern:', pattern);
            return true;
        }
    }
    
    // Check for cargo patterns
    for (const pattern of cargoPatterns) {
        if (desc.includes(pattern)) {
            console.log('Detected CARGO by pattern:', pattern);
            return false;
        }
    }
    
    // If unclear, analyze by common names/purposes
    if (desc.includes('natalia') || desc.includes('lupita') || desc.includes('granola')) {
        console.log('Detected CARGO by recipient name');
        return false; // Outgoing transfers
    }
    
    // Look for context clues in the PDF structure
    // If we can find "ABONOS" column structure, we can be more precise
    // For now, default to cargo if uncertain
    console.log('Defaulting to CARGO for unclear transaction');
    return false;
}

function getCategoryFromDescription(description) {
    const desc = description.toLowerCase();
    
    if (desc.includes('comision') || desc.includes('administracion') || desc.includes('manejo')) {
        return 'Comisiones';
    } else if (desc.includes('spei') || desc.includes('transferencia')) {
        return 'Transferencias';
    } else if (desc.includes('pago mr sabor') || desc.includes('deposito') || desc.includes('int ')) {
        return 'Ingresos';
    } else if (desc.includes('facebook') || desc.includes('facebk')) {
        return 'Servicios';
    } else {
        return 'Sin clasificar';
    }
}

function buildDate(day, period) {
    try {
        if (!period || !period.year || !period.month) {
            return new Date().toISOString().split('T')[0];
        }
        
        // Ensure day is valid for the month
        const year = period.year;
        const month = period.month;
        
        // Get the maximum day for this month
        const maxDay = new Date(year, month, 0).getDate();
        
        // Ensure day is within valid range
        const validDay = Math.max(1, Math.min(day, maxDay));
        
        // Create date - month is 0-indexed in JavaScript Date
        const date = new Date(year, month - 1, validDay);
        
        // Format as YYYY-MM-DD
        const dateString = date.toISOString().split('T')[0];
        
        console.log(`Building date: day=${day}, month=${month}, year=${year} → ${dateString}`);
        
        return dateString;
    } catch (error) {
        console.error('Error building date:', error);
        return new Date().toISOString().split('T')[0];
    }
}

function removeDuplicateTransactions(transactions) {
    const seen = new Set();
    return transactions.filter(transaction => {
        const key = `${transaction.transaction_date}-${transaction.description.substring(0, 50)}-${transaction.amount}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
