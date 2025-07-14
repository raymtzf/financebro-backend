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
            status: "PDF Processor Ready (ULTRA IMPROVED)",
            message: "Fixed dates and enhanced transaction detection"
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
            
            // Process with ultra improved parser
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
        
        // Extract transactions using multiple strategies
        const transactions = extractAllBanregioTransactions(pdfText, period);
        
        console.log(`Extracted ${transactions.length} transactions`);
        
        return {
            success: true,
            transactions: transactions,
            metadata: {
                filename: filename,
                statement_period: period,
                total_transactions: transactions.length,
                processing_method: "Ultra improved Banregio parser v3"
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

function extractAllBanregioTransactions(pdfText, period) {
    const transactions = [];
    const lines = pdfText.split('\n');
    
    console.log('Processing', lines.length, 'lines from Banregio PDF');
    
    // Strategy 1: Look for standard amount patterns
    const strategy1Transactions = extractByAmountPattern(lines, period);
    transactions.push(...strategy1Transactions);
    
    // Strategy 2: Look for transaction keywords
    const strategy2Transactions = extractByKeywordPattern(lines, period);
    transactions.push(...strategy2Transactions);
    
    // Strategy 3: Look for specific Banregio patterns
    const strategy3Transactions = extractByBanregioPattern(lines, period);
    transactions.push(...strategy3Transactions);
    
    console.log(`Strategy 1: ${strategy1Transactions.length} transactions`);
    console.log(`Strategy 2: ${strategy2Transactions.length} transactions`);
    console.log(`Strategy 3: ${strategy3Transactions.length} transactions`);
    console.log(`Total before dedup: ${transactions.length} transactions`);
    
    // Remove duplicates and sort
    const uniqueTransactions = removeDuplicateTransactions(transactions);
    return uniqueTransactions.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
}

function extractByAmountPattern(lines, period) {
    const transactions = [];
    let i = 0;
    
    while (i < lines.length) {
        const line = lines[i].trim();
        
        // Look for amount patterns: "amount1 amount2"
        const amountMatch = line.match(/^\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/);
        
        if (amountMatch) {
            const amount1 = parseFloat(amountMatch[1].replace(/,/g, ''));
            
            // Collect description and day
            const result = collectDescriptionAndDay(lines, i + 1, 20);
            
            if (result.description && result.day) {
                const isAbono = detectIfAbono(result.description);
                
                const transaction = {
                    transaction_date: buildDateImproved(result.day, period),
                    description: result.description.trim(),
                    amount: isAbono ? amount1 : -amount1,
                    transaction_type: isAbono ? 'credit' : 'debit',
                    category: getCategoryFromDescription(result.description)
                };
                
                transactions.push(transaction);
                console.log('Strategy 1 found:', {
                    day: result.day,
                    amount: transaction.amount,
                    desc: transaction.description.substring(0, 30) + '...'
                });
            }
            
            i = result.nextIndex || i + 1;
        } else {
            i++;
        }
    }
    
    return transactions;
}

function extractByKeywordPattern(lines, period) {
    const transactions = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Look for lines starting with transaction keywords
        if (line.match(/^(TRA|INT|SPEI|COMISION|ADMINISTRACION)/i)) {
            // Look for amounts in this line or nearby lines
            const amountInfo = findAmountsNearLine(lines, i, 5);
            const dayInfo = findDayNearLine(lines, i, 5);
            
            if (amountInfo.amount && dayInfo.day) {
                const isAbono = detectIfAbono(line);
                
                const transaction = {
                    transaction_date: buildDateImproved(dayInfo.day, period),
                    description: line,
                    amount: isAbono ? amountInfo.amount : -amountInfo.amount,
                    transaction_type: isAbono ? 'credit' : 'debit',
                    category: getCategoryFromDescription(line)
                };
                
                transactions.push(transaction);
                console.log('Strategy 2 found:', {
                    day: dayInfo.day,
                    amount: transaction.amount,
                    desc: line.substring(0, 30) + '...'
                });
            }
        }
    }
    
    return transactions;
}

function extractByBanregioPattern(lines, period) {
    const transactions = [];
    
    // Look for specific Banregio patterns in the text
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Pattern: line with date in format "XX/XX/XXXX"
        if (line.match(/\d{2}\/\d{2}\/\d{4}/)) {
            const dateMatch = line.match(/(\d{2})\/(\d{2})\/(\d{4})/);
            if (dateMatch) {
                const day = parseInt(dateMatch[1]);
                
                // Look for amounts and description nearby
                const amountInfo = findAmountsNearLine(lines, i, 3);
                const description = collectDescriptionNearLine(lines, i, 3);
                
                if (amountInfo.amount && description) {
                    const isAbono = detectIfAbono(description);
                    
                    const transaction = {
                        transaction_date: buildDateImproved(day, period),
                        description: description,
                        amount: isAbono ? amountInfo.amount : -amountInfo.amount,
                        transaction_type: isAbono ? 'credit' : 'debit',
                        category: getCategoryFromDescription(description)
                    };
                    
                    transactions.push(transaction);
                    console.log('Strategy 3 found:', {
                        day: day,
                        amount: transaction.amount,
                        desc: description.substring(0, 30) + '...'
                    });
                }
            }
        }
    }
    
    return transactions;
}

function collectDescriptionAndDay(lines, startIndex, maxLines) {
    let description = '';
    let day = null;
    let i = startIndex;
    
    while (i < lines.length && i < startIndex + maxLines) {
        const line = lines[i].trim();
        
        // Stop if we hit another amount line
        if (line.match(/^\s*[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s*$/)) {
            break;
        }
        
        // If it's a day number
        if (line.match(/^\d{1,2}$/) && parseInt(line) <= 31 && parseInt(line) >= 1) {
            day = parseInt(line);
            i++;
            break;
        }
        
        // If it's a description line
        if (line && line.length > 0 && !line.match(/^(DIA|CONCEPTO|CARGOS|ABONOS|SALDO)$/i)) {
            if (description) description += ' ';
            description += line;
        }
        
        i++;
    }
    
    return { description, day, nextIndex: i };
}

function findAmountsNearLine(lines, centerIndex, range) {
    for (let i = Math.max(0, centerIndex - range); i <= Math.min(lines.length - 1, centerIndex + range); i++) {
        const line = lines[i].trim();
        const amountMatch = line.match(/([\d,]+\.\d{2})/);
        if (amountMatch) {
            return { amount: parseFloat(amountMatch[1].replace(/,/g, '')), lineIndex: i };
        }
    }
    return { amount: null, lineIndex: null };
}

function findDayNearLine(lines, centerIndex, range) {
    for (let i = Math.max(0, centerIndex - range); i <= Math.min(lines.length - 1, centerIndex + range); i++) {
        const line = lines[i].trim();
        if (line.match(/^\d{1,2}$/) && parseInt(line) <= 31 && parseInt(line) >= 1) {
            return { day: parseInt(line), lineIndex: i };
        }
    }
    return { day: null, lineIndex: null };
}

function collectDescriptionNearLine(lines, centerIndex, range) {
    let description = '';
    for (let i = Math.max(0, centerIndex - range); i <= Math.min(lines.length - 1, centerIndex + range); i++) {
        const line = lines[i].trim();
        if (line && line.length > 3 && !line.match(/^\d{1,2}$/) && !line.match(/[\d,]+\.\d{2}/)) {
            if (description) description += ' ';
            description += line;
        }
    }
    return description;
}

function buildDateImproved(day, period) {
    try {
        if (!period || !period.year || !period.month) {
            console.log('⚠️ No period info, using defaults');
            return new Date().toISOString().split('T')[0];
        }
        
        const year = period.year;
        const month = period.month;
        
        // Validate day
        if (day < 1 || day > 31) {
            console.log(`⚠️ Invalid day: ${day}, using day 1`);
            day = 1;
        }
        
        // Get max days in this month
        const maxDay = new Date(year, month, 0).getDate();
        if (day > maxDay) {
            console.log(`⚠️ Day ${day} > max ${maxDay} for ${period.month_name}, adjusting`);
            day = maxDay;
        }
        
        // Create date (month is 0-indexed)
        const date = new Date(year, month - 1, day);
        const dateString = date.toISOString().split('T')[0];
        
        console.log(`📅 Built date: ${day}/${month}/${year} → ${dateString}`);
        
        return dateString;
    } catch (error) {
        console.error('❌ Error building date:', error);
        return new Date().toISOString().split('T')[0];
    }
}

function detectIfAbono(description) {
    const desc = description.toLowerCase();
    
    // ABONO patterns
    const abonoPatterns = [
        'int ', 'abono', 'deposito', 'pago mr sabor', 'ingreso',
        'transferencia a favor', 'acreditacion', 'devolucion'
    ];
    
    // CARGO patterns
    const cargoPatterns = [
        'tra spei-', 'comision', 'administracion', 'manejo de cuenta',
        'cargo', 'retiro', 'transferencia de', 'pago a'
    ];
    
    for (const pattern of abonoPatterns) {
        if (desc.includes(pattern)) return true;
    }
    
    for (const pattern of cargoPatterns) {
        if (desc.includes(pattern)) return false;
    }
    
    // Specific names usually indicate outgoing transfers
    if (desc.includes('natalia') || desc.includes('lupita') || desc.includes('granola')) {
        return false;
    }
    
    return false; // Default to cargo
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

function removeDuplicateTransactions(transactions) {
    const seen = new Set();
    return transactions.filter(transaction => {
        // Use shorter description for dedup to catch variations
        const shortDesc = transaction.description.substring(0, 40);
        const key = `${transaction.transaction_date}-${shortDesc}-${transaction.amount}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
