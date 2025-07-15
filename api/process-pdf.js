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
            status: "PDF Processor Ready (SIMPLE & ROBUST)",
            message: "Back to basics - simple line by line parsing"
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
            
            // Use simple robust parser
            const result = processBanregioSimple(pdfText, filename);
            
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

function processBanregioSimple(pdfText, filename) {
    console.log('Processing Banregio PDF with simple parser...');
    
    try {
        // Extract statement period
        const period = extractStatementPeriod(pdfText);
        console.log('Extracted period:', period);
        
        // Extract transactions using simple approach
        const transactions = extractTransactionsSimple(pdfText, period);
        
        console.log(`Extracted ${transactions.length} transactions`);
        
        return {
            success: true,
            transactions: transactions,
            metadata: {
                filename: filename,
                statement_period: period,
                total_transactions: transactions.length,
                processing_method: "Simple robust parser - line by line"
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

function extractTransactionsSimple(pdfText, period) {
    const transactions = [];
    const lines = pdfText.split('\n');
    
    console.log('Processing', lines.length, 'lines with simple parser');
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Look for lines that start with a day number followed by transaction content
        const dayTransactionMatch = line.match(/^(\d{1,2})\s+(.+)/);
        
        if (dayTransactionMatch) {
            const day = parseInt(dayTransactionMatch[1]);
            const content = dayTransactionMatch[2];
            
            // Validate it's a reasonable day
            if (day >= 1 && day <= 31) {
                console.log(`📅 Found transaction on day ${day}:`, content.substring(0, 50) + '...');
                
                // Look for amounts in this line and nearby lines
                const transactionData = extractAmountsAndDescription(lines, i, content);
                
                if (transactionData.amount > 0 && transactionData.description) {
                    const isAbono = detectIfAbono(transactionData.description);
                    
                    const transaction = {
                        transaction_date: buildDateFromDay(day, period),
                        description: transactionData.description,
                        amount: isAbono ? transactionData.amount : -transactionData.amount,
                        transaction_type: isAbono ? 'credit' : 'debit',
                        category: getCategoryFromDescription(transactionData.description)
                    };
                    
                    transactions.push(transaction);
                    
                    console.log('✅ Added transaction:', {
                        day: day,
                        date: transaction.transaction_date,
                        amount: transaction.amount,
                        type: transaction.transaction_type,
                        desc: transactionData.description.substring(0, 40) + '...'
                    });
                }
            }
        }
        
        // Also look for lines with transaction keywords even without day numbers
        else if (line.match(/^(TRA|INT)\s+/)) {
            console.log(`🔍 Found transaction keyword line:`, line.substring(0, 50) + '...');
            
            const transactionData = extractAmountsAndDescription(lines, i, line);
            
            if (transactionData.amount > 0 && transactionData.description) {
                // Try to find day in nearby lines or use default
                const day = findDayNearby(lines, i, 3) || 1;
                const isAbono = detectIfAbono(transactionData.description);
                
                const transaction = {
                    transaction_date: buildDateFromDay(day, period),
                    description: transactionData.description,
                    amount: isAbono ? transactionData.amount : -transactionData.amount,
                    transaction_type: isAbono ? 'credit' : 'debit',
                    category: getCategoryFromDescription(transactionData.description)
                };
                
                transactions.push(transaction);
                
                console.log('✅ Added keyword transaction:', {
                    day: day,
                    date: transaction.transaction_date,
                    amount: transaction.amount,
                    type: transaction.transaction_type,
                    desc: transactionData.description.substring(0, 40) + '...'
                });
            }
        }
    }
    
    // Remove duplicates and sort
    const uniqueTransactions = removeDuplicates(transactions);
    return uniqueTransactions.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
}

function extractAmountsAndDescription(lines, startIndex, initialContent) {
    let description = initialContent;
    let amount = 0;
    
    // Look for amounts in current line
    const currentAmounts = initialContent.match(/[\d,]+\.\d{2}/g);
    if (currentAmounts) {
        amount = Math.max(amount, parseFloat(currentAmounts[0].replace(/,/g, '')));
    }
    
    // Look in next few lines for more content
    for (let j = startIndex + 1; j < Math.min(startIndex + 5, lines.length); j++) {
        const nextLine = lines[j].trim();
        
        // Stop if we hit another day number
        if (nextLine.match(/^\d{1,2}\s+/)) {
            break;
        }
        
        // Add meaningful content
        if (nextLine && nextLine.length > 3 && 
            !nextLine.match(/^(DIA|CONCEPTO|CARGOS|ABONOS|SALDO|Page)$/i)) {
            description += ' ' + nextLine;
            
            // Look for amounts in this line too
            const amounts = nextLine.match(/[\d,]+\.\d{2}/g);
            if (amounts) {
                amounts.forEach(amountStr => {
                    const foundAmount = parseFloat(amountStr.replace(/,/g, ''));
                    amount = Math.max(amount, foundAmount);
                });
            }
        }
    }
    
    return {
        description: description.trim(),
        amount: amount
    };
}

function findDayNearby(lines, centerIndex, range) {
    for (let i = Math.max(0, centerIndex - range); i <= Math.min(lines.length - 1, centerIndex + range); i++) {
        const line = lines[i].trim();
        const dayMatch = line.match(/^(\d{1,2})\s+/);
        if (dayMatch) {
            const day = parseInt(dayMatch[1]);
            if (day >= 1 && day <= 31) {
                return day;
            }
        }
    }
    return null;
}

function detectIfAbono(description) {
    const desc = description.toLowerCase();
    
    // ABONO patterns (ingresos)
    const abonoPatterns = [
        'int ', 'abono', 'deposito', 'pago mr sabor', 'insumos', 'multisabor'
    ];
    
    // CARGO patterns (gastos)
    const cargoPatterns = [
        'tra spei-', 'comision', 'administracion', 'manejo de cuenta',
        'facebook', 'facebk'
    ];
    
    // Check abono patterns
    for (const pattern of abonoPatterns) {
        if (desc.includes(pattern)) {
            return true;
        }
    }
    
    // Check cargo patterns
    for (const pattern of cargoPatterns) {
        if (desc.includes(pattern)) {
            return false;
        }
    }
    
    // Check recipient names (usually outgoing)
    if (desc.includes('natalia') || desc.includes('lupita') || desc.includes('granola') || desc.includes('nueztra')) {
        return false;
    }
    
    return false; // Default to cargo
}

function buildDateFromDay(day, period) {
    try {
        const year = period.year;
        const month = period.month;
        
        const maxDay = new Date(year, month, 0).getDate();
        const validDay = Math.min(Math.max(1, day), maxDay);
        
        const date = new Date(year, month - 1, validDay);
        return date.toISOString().split('T')[0];
    } catch (error) {
        return new Date().toISOString().split('T')[0];
    }
}

function getCategoryFromDescription(description) {
    const desc = description.toLowerCase();
    
    if (desc.includes('comision') || desc.includes('administracion')) {
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
        const shortDesc = transaction.description.substring(0, 50).replace(/\s+/g, ' ').trim();
        const key = `${transaction.transaction_date}-${shortDesc}-${Math.abs(transaction.amount)}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
