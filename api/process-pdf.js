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
            status: "PDF Processor Ready (DEFINITIVE)",
            message: "Ultra precise parser - extracts dates from descriptions"
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
            
            // Process with definitive precise parser
            const result = processBanregioPDFDefinitive(pdfText, filename);
            
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

function processBanregioPDFDefinitive(pdfText, filename) {
    console.log('Processing Banregio PDF with definitive parser...');
    
    try {
        // Extract statement period
        const period = extractStatementPeriod(pdfText);
        console.log('Extracted period:', period);
        
        // Extract transactions with single precise strategy
        const transactions = extractTransactionsDefinitive(pdfText, period);
        
        console.log(`Extracted ${transactions.length} transactions`);
        
        return {
            success: true,
            transactions: transactions,
            metadata: {
                filename: filename,
                statement_period: period,
                total_transactions: transactions.length,
                processing_method: "Definitive precise Banregio parser"
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

function extractTransactionsDefinitive(pdfText, period) {
    const transactions = [];
    const lines = pdfText.split('\n');
    
    console.log('Processing', lines.length, 'lines with definitive parser');
    
    let i = 0;
    
    while (i < lines.length) {
        const line = lines[i].trim();
        
        // Look for amount patterns: "amount1 amount2" 
        const amountMatch = line.match(/^\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/);
        
        if (amountMatch) {
            const amount1 = parseFloat(amountMatch[1].replace(/,/g, ''));
            
            console.log(`Found amount line: ${line} → ${amount1}`);
            
            // Collect full description from next lines
            let fullDescription = '';
            let j = i + 1;
            const maxLookAhead = 25; // Look further for complete description
            
            while (j < lines.length && j < i + maxLookAhead) {
                const nextLine = lines[j].trim();
                
                // Stop if we hit another amount line
                if (nextLine.match(/^\s*[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s*$/)) {
                    break;
                }
                
                // Stop if we hit a standalone day number (but collect it if it's part of description)
                if (nextLine.match(/^\d{1,2}$/) && parseInt(nextLine) <= 31) {
                    j++;
                    break;
                }
                
                // Add meaningful description lines
                if (nextLine && nextLine.length > 0 && 
                    !nextLine.match(/^(DIA|CONCEPTO|CARGOS|ABONOS|SALDO|Page \d+ of \d+)$/i)) {
                    if (fullDescription && !fullDescription.endsWith(' ')) {
                        fullDescription += ' ';
                    }
                    fullDescription += nextLine;
                }
                
                j++;
            }
            
            // Only process if we have a meaningful description
            if (fullDescription && fullDescription.length > 10) {
                
                // Extract date from description (look for DD/MM/YYYY pattern)
                const dateFromDesc = extractDateFromDescription(fullDescription, period);
                
                // Determine if it's cargo or abono
                const isAbono = detectIfAbonoDefinitive(fullDescription);
                
                const transaction = {
                    transaction_date: dateFromDesc,
                    description: fullDescription.trim(),
                    amount: isAbono ? amount1 : -amount1,
                    transaction_type: isAbono ? 'credit' : 'debit',
                    category: getCategoryFromDescription(fullDescription)
                };
                
                transactions.push(transaction);
                
                console.log(`✅ Created transaction:`, {
                    date: dateFromDesc,
                    amount: transaction.amount,
                    type: transaction.transaction_type,
                    desc: fullDescription.substring(0, 50) + '...'
                });
            }
            
            i = j;
        } else {
            i++;
        }
    }
    
    // Remove duplicates and sort
    const uniqueTransactions = removeDuplicatesStrict(transactions);
    return uniqueTransactions.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
}

function extractDateFromDescription(description, period) {
    // Look for date pattern DD/MM/YYYY in description
    const dateMatch = description.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    
    if (dateMatch) {
        const day = parseInt(dateMatch[1]);
        const month = parseInt(dateMatch[2]);
        const year = parseInt(dateMatch[3]);
        
        // Validate the extracted date
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year > 2020) {
            const date = new Date(year, month - 1, day);
            const dateString = date.toISOString().split('T')[0];
            
            console.log(`📅 Extracted date from description: ${day}/${month}/${year} → ${dateString}`);
            return dateString;
        }
    }
    
    // Fallback: use period info with day 1
    console.log(`⚠️ No date found in description, using period default`);
    return `${period.year}-${String(period.month).padStart(2, '0')}-01`;
}

function detectIfAbonoDefinitive(description) {
    const desc = description.toLowerCase();
    
    // Very specific patterns for ABONOS (ingresos)
    const abonoPatterns = [
        'int ', // INT transactions are typically credits
        'abono', 
        'deposito',
        'pago mr sabor',
        'insumos y multisabor es mr sabor', // From your examples
        'insumos'
    ];
    
    // Very specific patterns for CARGOS (gastos)
    const cargoPatterns = [
        'tra spei-', // TRA SPEI transactions are typically debits
        'comision',
        'administracion',
        'manejo de cuenta',
        'cargo',
        'retiro',
        'facebook',
        'facebk'
    ];
    
    // Check abono patterns first
    for (const pattern of abonoPatterns) {
        if (desc.includes(pattern)) {
            console.log(`🟢 Detected ABONO by pattern: "${pattern}"`);
            return true;
        }
    }
    
    // Check cargo patterns
    for (const pattern of cargoPatterns) {
        if (desc.includes(pattern)) {
            console.log(`🔴 Detected CARGO by pattern: "${pattern}"`);
            return false;
        }
    }
    
    // Specific recipient names (usually outgoing transfers)
    const outgoingNames = ['natalia', 'lupita', 'granola', 'nueztra', 'sussy'];
    for (const name of outgoingNames) {
        if (desc.includes(name)) {
            console.log(`🔴 Detected CARGO by recipient: "${name}"`);
            return false;
        }
    }
    
    // Default to cargo if uncertain
    console.log(`⚪ Defaulting to CARGO for unclear transaction`);
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

function removeDuplicatesStrict(transactions) {
    const seen = new Set();
    return transactions.filter(transaction => {
        // Use very strict deduplication
        const normalizedDesc = transaction.description.replace(/\s+/g, ' ').trim().substring(0, 60);
        const key = `${transaction.transaction_date}-${normalizedDesc}-${Math.abs(transaction.amount)}`;
        
        if (seen.has(key)) {
            console.log(`🗑️ Removing duplicate: ${normalizedDesc}`);
            return false;
        }
        seen.add(key);
        return true;
    });
}
