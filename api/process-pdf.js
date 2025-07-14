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
            status: "PDF Processor Ready (CONSERVATIVE FIX)",
            message: "Back to working version, only fixing dates"
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
            
            // Use the working logic but fix dates
            const result = processBanregioPDFConservative(pdfText, filename);
            
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

function processBanregioPDFConservative(pdfText, filename) {
    console.log('Processing Banregio PDF conservatively...');
    
    try {
        // Extract statement period
        const period = extractStatementPeriod(pdfText);
        console.log('Extracted period:', period);
        
        // Use the original working strategy but fix dates
        const transactions = extractTransactionsWorking(pdfText, period);
        
        console.log(`Extracted ${transactions.length} transactions`);
        
        return {
            success: true,
            transactions: transactions,
            metadata: {
                filename: filename,
                statement_period: period,
                total_transactions: transactions.length,
                processing_method: "Conservative fix - working version with correct dates"
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

function extractTransactionsWorking(pdfText, period) {
    const transactions = [];
    const lines = pdfText.split('\n');
    
    console.log('Processing', lines.length, 'lines (working method)');
    
    let i = 0;
    
    while (i < lines.length) {
        const line = lines[i].trim();
        
        // Use the WORKING pattern: look for amount lines "amount1 amount2"
        const amountMatch = line.match(/^\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/);
        
        if (amountMatch) {
            const amount1 = parseFloat(amountMatch[1].replace(/,/g, ''));
            
            console.log('Found amount line:', line, '→', amount1);
            
            // Collect description using the WORKING method
            let description = '';
            let j = i + 1;
            const maxLookAhead = 15;
            
            while (j < lines.length && j < i + maxLookAhead) {
                const nextLine = lines[j].trim();
                
                // Stop if we hit another amount line
                if (nextLine.match(/^\s*[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s*$/)) {
                    break;
                }
                
                // Stop if we hit a standalone day number
                if (nextLine.match(/^\d{1,2}$/) && parseInt(nextLine) <= 31) {
                    j++;
                    break;
                }
                
                // Add description lines
                if (nextLine && nextLine.length > 0 && 
                    !nextLine.match(/^(DIA|CONCEPTO|CARGOS|ABONOS|SALDO)$/i)) {
                    if (description) description += ' ';
                    description += nextLine;
                }
                
                j++;
            }
            
            // Only create transaction if we have description
            if (description && description.length > 10) {
                
                // FIX: Extract correct date from description
                const correctDate = extractCorrectDate(description, period);
                
                // Use the WORKING detection method
                const isAbono = detectIfAbonoWorking(description);
                
                const transaction = {
                    transaction_date: correctDate,
                    description: description.trim(),
                    amount: isAbono ? amount1 : -amount1,
                    transaction_type: isAbono ? 'credit' : 'debit',
                    category: getCategoryFromDescription(description)
                };
                
                transactions.push(transaction);
                
                console.log('Created transaction:', {
                    date: correctDate,
                    amount: transaction.amount,
                    type: transaction.transaction_type,
                    desc: description.substring(0, 40) + '...'
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

function extractCorrectDate(description, period) {
    console.log('Extracting date from:', description.substring(0, 100));
    
    // Look for DD/MM/YYYY pattern in description
    const dateMatches = description.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g);
    
    if (dateMatches && dateMatches.length > 0) {
        // Use the first date found
        const dateMatch = dateMatches[0].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        const day = parseInt(dateMatch[1]);
        const month = parseInt(dateMatch[2]);
        const year = parseInt(dateMatch[3]);
        
        // Validate and create date
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year > 2020) {
            const date = new Date(year, month - 1, day);
            const dateString = date.toISOString().split('T')[0];
            
            console.log(`✅ Found date in description: ${day}/${month}/${year} → ${dateString}`);
            return dateString;
        }
    }
    
    // Look for DD-MM-YYYY pattern as fallback
    const altDateMatch = description.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (altDateMatch) {
        const day = parseInt(altDateMatch[1]);
        const month = parseInt(altDateMatch[2]);
        const year = parseInt(altDateMatch[3]);
        
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year > 2020) {
            const date = new Date(year, month - 1, day);
            const dateString = date.toISOString().split('T')[0];
            
            console.log(`✅ Found alt date in description: ${day}-${month}-${year} → ${dateString}`);
            return dateString;
        }
    }
    
    // Fallback to period start date
    console.log(`⚠️ No date found in description, using period start`);
    return `${period.year}-${String(period.month).padStart(2, '0')}-01`;
}

function detectIfAbonoWorking(description) {
    const desc = description.toLowerCase();
    
    // ABONO patterns (these were working)
    const abonoPatterns = [
        'int ', 'abono', 'deposito', 'pago mr sabor', 'ingreso',
        'insumos', 'multisabor'
    ];
    
    // CARGO patterns (these were working)
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
    
    // Check recipient names (usually outgoing)
    if (desc.includes('natalia') || desc.includes('lupita') || desc.includes('granola') || desc.includes('nueztra')) {
        console.log(`🔴 CARGO detected: recipient name`);
        return false;
    }
    
    // Default to cargo
    console.log(`⚪ Defaulting to CARGO`);
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
