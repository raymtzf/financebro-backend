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
            status: "PDF Processor Ready (BANREGIO FORMAT)",
            message: "Optimized for Banregio account statements"
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
            
            // Process the extracted text with Banregio-specific format
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
        
        // Extract transactions using Banregio-specific format
        const transactions = extractBanregioTransactions(pdfText, period);
        
        console.log(`Extracted ${transactions.length} transactions`);
        
        return {
            success: true,
            transactions: transactions,
            metadata: {
                filename: filename,
                statement_period: period,
                total_transactions: transactions.length,
                processing_method: "Banregio-specific format parser"
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
    
    // Find the start of transactions section
    let inTransactionSection = false;
    let i = 0;
    
    while (i < lines.length) {
        const line = lines[i].trim();
        
        // Look for transaction section indicators
        if (line.includes('CONCEPTOCARGOSABONOSSALDO') || line.includes('CONCEPTO') && line.includes('CARGOS')) {
            inTransactionSection = true;
            i++;
            continue;
        }
        
        if (!inTransactionSection) {
            i++;
            continue;
        }
        
        // Look for amount lines (start of transaction)
        if (line.match(/^\s*[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s*$/)) {
            // This is a line with: CARGO_AMOUNT  SALDO
            const amounts = line.match(/[\d,]+\.\d{2}/g);
            const cargoAmount = parseFloat(amounts[0].replace(/,/g, ''));
            
            // Look for description in next lines
            let description = '';
            let day = null;
            let j = i + 1;
            
            while (j < lines.length && j < i + 10) {
                const nextLine = lines[j].trim();
                
                // If we hit another amount line, stop
                if (nextLine.match(/^\s*[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s*$/)) {
                    break;
                }
                
                // If it's just a day number, extract it
                if (nextLine.match(/^\d{1,2}$/)) {
                    day = parseInt(nextLine);
                    j++;
                    break;
                }
                
                // If it's a description line, add it
                if (nextLine && !nextLine.match(/^\d{1,2}$/) && nextLine.length > 3) {
                    if (description) description += ' ';
                    description += nextLine;
                }
                
                j++;
            }
            
            // Create transaction if we found valid data
            if (description && day) {
                const transaction = {
                    transaction_date: buildDate(day, period),
                    description: description.trim(),
                    amount: -cargoAmount, // Negative because it's a cargo
                    transaction_type: 'debit',
                    category: getCategoryFromDescription(description)
                };
                
                transactions.push(transaction);
                console.log('Found transaction:', transaction.description, '→', transaction.amount);
            }
            
            i = j;
        } else {
            i++;
        }
    }
    
    // Also look for ABONOS pattern (credits)
    const abonosTransactions = extractAbonosFromText(pdfText, period);
    transactions.push(...abonosTransactions);
    
    // Remove duplicates and sort
    const uniqueTransactions = removeDuplicateTransactions(transactions);
    return uniqueTransactions.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
}

function extractAbonosFromText(pdfText, period) {
    const transactions = [];
    
    // Look for lines that might indicate credits/abonos
    // This would require seeing more of your PDF content to identify the pattern
    
    return transactions;
}

function getCategoryFromDescription(description) {
    const desc = description.toLowerCase();
    
    if (desc.includes('comision') || desc.includes('administracion')) {
        return 'Comisiones';
    } else if (desc.includes('spei') || desc.includes('transferencia')) {
        return 'Transferencias';
    } else if (desc.includes('pago') || desc.includes('deposito')) {
        return 'Ingresos';
    } else {
        return 'Sin clasificar';
    }
}

function buildDate(day, period) {
    try {
        if (!period || !period.year || !period.month) {
            return new Date().toISOString().split('T')[0];
        }
        
        const maxDay = new Date(period.year, period.month, 0).getDate();
        const validDay = Math.min(Math.max(1, day), maxDay);
        
        const date = new Date(period.year, period.month - 1, validDay);
        return date.toISOString().split('T')[0];
    } catch (error) {
        return new Date().toISOString().split('T')[0];
    }
}

function removeDuplicateTransactions(transactions) {
    const seen = new Set();
    return transactions.filter(transaction => {
        const key = `${transaction.transaction_date}-${transaction.description}-${transaction.amount}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
