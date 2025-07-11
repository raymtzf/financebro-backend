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
            status: "PDF Processor Ready",
            message: "Real PDF processing with JavaScript"
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

            console.log('Processing real PDF:', filename);
            
            // Decode base64 PDF
            const pdfBuffer = Buffer.from(pdf_data, 'base64');
            
            // Extract text from PDF
            const pdfData = await pdf(pdfBuffer);
            const pdfText = pdfData.text;
            
            console.log('PDF text extracted, length:', pdfText.length);
            
            // Process the extracted text
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
        
        // Extract transactions from PDF text
        const transactions = extractTransactionsFromText(pdfText, period);
        
        console.log(`Extracted ${transactions.length} transactions`);
        
        return {
            success: true,
            transactions: transactions,
            metadata: {
                filename: filename,
                statement_period: period,
                total_transactions: transactions.length,
                processing_method: "Real PDF text extraction"
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
    // Extract period like "del 01 al 31 de FEBRERO 2024"
    const periodMatch = pdfText.match(/del \d+ al \d+ de (\w+) (\d{4})/i);
    
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
    
    return { month: 1, year: 2024, month_name: 'Unknown' };
}

function extractTransactionsFromText(pdfText, period) {
    const transactions = [];
    const lines = pdfText.split('\n');
    
    console.log('Processing', lines.length, 'lines from PDF');
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip empty lines and headers
        if (!line || line.includes('CONCEPTO') || line.includes('SALDO') || line.includes('CARGOS')) {
            continue;
        }
        
        // Look for transaction patterns - day number at start
        const dayMatch = line.match(/^(\d{1,2})\s+(.+)/);
        if (dayMatch) {
            const day = parseInt(dayMatch[1]);
            const restOfLine = dayMatch[2];
            
            // Try to extract transaction from this line and potentially next lines
            const transaction = parseTransactionLine(day, restOfLine, lines, i, period);
            if (transaction) {
                transactions.push(transaction);
            }
        }
        
        // Also look for lines starting with TRA, INT (without day)
        if (line.match(/^(TRA|INT)\s+/)) {
            const transaction = parseTransactionLineNoDay(line, period);
            if (transaction) {
                transactions.push(transaction);
            }
        }
    }
    
    // Remove duplicates and sort by date
    const uniqueTransactions = removeDuplicateTransactions(transactions);
    return uniqueTransactions.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
}

function parseTransactionLine(day, restOfLine, allLines, currentIndex, period) {
    try {
        // Extract description (everything before amounts)
        let description = restOfLine;
        
        // Look for amounts in current line and next few lines
        const amounts = [];
        const amountRegex = /[\d,]+\.\d{2}/g;
        
        // Extract amounts from current line
        const currentAmounts = restOfLine.match(amountRegex);
        if (currentAmounts) {
            amounts.push(...currentAmounts);
        }
        
        // Look at next few lines for continuation
        for (let j = currentIndex + 1; j < Math.min(currentIndex + 3, allLines.length); j++) {
            const nextLine = allLines[j].trim();
            if (!nextLine || nextLine.match(/^\d{1,2}\s+/)) break; // Stop at next transaction
            
            const nextAmounts = nextLine.match(amountRegex);
            if (nextAmounts) {
                amounts.push(...nextAmounts);
            }
            
            // Add to description if no amounts found
            if (!nextAmounts && nextLine.length < 100) {
                description += ' ' + nextLine;
            }
        }
        
        if (amounts.length === 0) return null;
        
        // Parse the main amount
        const mainAmount = parseFloat(amounts[0].replace(/,/g, ''));
        
        // Determine if it's cargo or abono based on context
        const isCharge = isTransactionCharge(description);
        
        const transaction = {
            transaction_date: buildDate(day, period),
            description: description.trim(),
            amount: isCharge ? -Math.abs(mainAmount) : Math.abs(mainAmount),
            transaction_type: isCharge ? 'debit' : 'credit',
            category: getCategoryFromDescription(description)
        };
        
        console.log('Parsed transaction:', transaction.description, '→', transaction.transaction_type, transaction.amount);
        
        return transaction;
        
    } catch (error) {
        console.error('Error parsing transaction line:', error);
        return null;
    }
}

function parseTransactionLineNoDay(line, period) {
    try {
        const amountRegex = /[\d,]+\.\d{2}/g;
        const amounts = line.match(amountRegex);
        
        if (!amounts || amounts.length === 0) return null;
        
        const mainAmount = parseFloat(amounts[0].replace(/,/g, ''));
        const description = line.replace(amountRegex, '').trim();
        
        const isCharge = isTransactionCharge(description);
        
        return {
            transaction_date: buildDate(1, period), // Default to day 1 if no day found
            description: description,
            amount: isCharge ? -Math.abs(mainAmount) : Math.abs(mainAmount),
            transaction_type: isCharge ? 'debit' : 'credit',
            category: getCategoryFromDescription(description)
        };
        
    } catch (error) {
        console.error('Error parsing transaction line without day:', error);
        return null;
    }
}

function isTransactionCharge(description) {
    const desc = description.toLowerCase();
    
    // Patterns that indicate CHARGES (gastos)
    const chargePatterns = [
        'tra ', 'spei-', 'comision', 'administracion', 'manejo de cuenta',
        'cargo', 'retiro', 'transferencia de'
    ];
    
    // Patterns that indicate CREDITS (ingresos)  
    const creditPatterns = [
        'int ', 'abono', 'deposito', 'pago mr sabor', 'transferencia a'
    ];
    
    // Check for charge patterns
    for (const pattern of chargePatterns) {
        if (desc.includes(pattern)) return true;
    }
    
    // Check for credit patterns
    for (const pattern of creditPatterns) {
        if (desc.includes(pattern)) return false;
    }
    
    // Default: if unsure, analyze by keywords
    if (desc.includes('natalia') || desc.includes('lupita') || desc.includes('granola')) {
        return true; // These are typically outgoing transfers
    }
    
    return false; // Default to credit if uncertain
}

function getCategoryFromDescription(description) {
    const desc = description.toLowerCase();
    
    if (desc.includes('comision') || desc.includes('administracion')) {
        return 'Comisiones';
    } else if (desc.includes('spei') || desc.includes('transferencia')) {
        return 'Transferencias';
    } else if (desc.includes('pago') || desc.includes('mr sabor')) {
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
        
        // Ensure day is valid for the month
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
Implement real PDF processing
