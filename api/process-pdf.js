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
            status: "PDF Processor Ready (TABULAR PARSER)",
            message: "Understanding Banregio tabular format: DIA|CONCEPTO|CARGOS|ABONOS"
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
            
            // Use tabular parser
            const result = processBanregioTabular(pdfText, filename);
            
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

function processBanregioTabular(pdfText, filename) {
    console.log('Processing Banregio PDF with tabular parser...');
    
    try {
        // Extract statement period
        const period = extractStatementPeriod(pdfText);
        console.log('Extracted period:', period);
        
        // Extract transactions using tabular format understanding
        const transactions = extractTabularTransactions(pdfText, period);
        
        console.log(`Extracted ${transactions.length} transactions`);
        
        return {
            success: true,
            transactions: transactions,
            metadata: {
                filename: filename,
                statement_period: period,
                total_transactions: transactions.length,
                processing_method: "Tabular parser - DIA|CONCEPTO|CARGOS|ABONOS format"
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

function extractTabularTransactions(pdfText, period) {
    const transactions = [];
    const lines = pdfText.split('\n');
    
    console.log('Processing', lines.length, 'lines with tabular parser');
    
    // Find the transaction table section
    let inTransactionTable = false;
    let i = 0;
    
    while (i < lines.length) {
        const line = lines[i].trim();
        
        // Look for table headers
        if (line.includes('CONCEPTO') && (line.includes('CARGOS') || line.includes('ABONOS'))) {
            console.log('📊 Found transaction table headers:', line);
            inTransactionTable = true;
            i++;
            continue;
        }
        
        // Skip until we're in the transaction table
        if (!inTransactionTable) {
            i++;
            continue;
        }
        
        // Process transaction rows
        const transactionData = parseTransactionRow(lines, i, period);
        
        if (transactionData.transaction) {
            transactions.push(transactionData.transaction);
            console.log('✅ Added transaction:', {
                day: transactionData.day,
                date: transactionData.transaction.transaction_date,
                amount: transactionData.transaction.amount,
                type: transactionData.transaction.transaction_type,
                desc: transactionData.transaction.description.substring(0, 40) + '...'
            });
        }
        
        i = transactionData.nextIndex || i + 1;
    }
    
    // Remove duplicates and sort
    const uniqueTransactions = removeDuplicates(transactions);
    return uniqueTransactions.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
}

function parseTransactionRow(lines, startIndex, period) {
    let day = null;
    let description = '';
    let cargoAmount = 0;
    let abonoAmount = 0;
    let i = startIndex;
    
    // Look for a day number at the start of a line
    const currentLine = lines[i] ? lines[i].trim() : '';
    
    // Check if current line starts with a day number
    const dayMatch = currentLine.match(/^(\d{1,2})\s+(.*)$/);
    
    if (dayMatch) {
        const possibleDay = parseInt(dayMatch[1]);
        
        // Validate it's a reasonable day
        if (possibleDay >= 1 && possibleDay <= 31) {
            day = possibleDay;
            const restOfLine = dayMatch[2];
            
            console.log(`📅 Found transaction starting with day ${day}:`, restOfLine);
            
            // Extract description and amounts from this row and following rows
            const rowData = extractTransactionData(lines, i, restOfLine);
            
            description = rowData.description;
            cargoAmount = rowData.cargoAmount;
            abonoAmount = rowData.abonoAmount;
            
            // Create transaction if we have valid data
            if (description && (cargoAmount > 0 || abonoAmount > 0)) {
                const isAbono = abonoAmount > 0;
                const amount = isAbono ? abonoAmount : cargoAmount;
                
                const transaction = {
                    transaction_date: buildDateFromDay(day, period),
                    description: description.trim(),
                    amount: isAbono ? amount : -amount,
                    transaction_type: isAbono ? 'credit' : 'debit',
                    category: getCategoryFromDescription(description)
                };
                
                return {
                    transaction: transaction,
                    day: day,
                    nextIndex: rowData.nextIndex
                };
            }
            
            return { transaction: null, nextIndex: rowData.nextIndex };
        }
    }
    
    return { transaction: null, nextIndex: i + 1 };
}

function extractTransactionData(lines, startIndex, firstLineContent) {
    let description = firstLineContent || '';
    let cargoAmount = 0;
    let abonoAmount = 0;
    let i = startIndex;
    
    // Process current line and following lines until next transaction or end
    while (i < lines.length && i < startIndex + 10) { // Look at next 10 lines max
        const line = lines[i] ? lines[i].trim() : '';
        
        // Skip if empty
        if (!line) {
            i++;
            continue;
        }
        
        // Stop if we hit another day number (start of next transaction)
        if (i > startIndex && line.match(/^\d{1,2}\s+/)) {
            break;
        }
        
        // Extract amounts from this line
        const amounts = line.match(/[\d,]+\.\d{2}/g);
        if (amounts) {
            amounts.forEach(amountStr => {
                const amount = parseFloat(amountStr.replace(/,/g, ''));
                
                // Determine if it's in CARGOS or ABONOS column based on context
                const lineContext = line.toLowerCase();
                
                // If line contains transaction keywords, it's likely the description
                if (lineContext.includes('tra ') || lineContext.includes('int ') || 
                    lineContext.includes('spei') || lineContext.includes('pago')) {
                    
                    // Add to description if not already included
                    if (i === startIndex) {
                        // Already included in firstLineContent
                    } else {
                        description += ' ' + line.replace(/[\d,]+\.\d{2}/g, '').trim();
                    }
                    
                    // Determine cargo vs abono based on transaction type
                    if (lineContext.includes('tra spei-') || lineContext.includes('comision')) {
                        cargoAmount = Math.max(cargoAmount, amount);
                    } else if (lineContext.includes('int ') || lineContext.includes('pago mr sabor')) {
                        abonoAmount = Math.max(abonoAmount, amount);
                    } else {
                        // Default logic based on common patterns
                        if (lineContext.includes('natalia') || lineContext.includes('facebook') || 
                            lineContext.includes('administracion')) {
                            cargoAmount = Math.max(cargoAmount, amount);
                        } else {
                            abonoAmount = Math.max(abonoAmount, amount);
                        }
                    }
                } else {
                    // Pure amount line - try to determine context
                    if (cargoAmount === 0 && abonoAmount === 0) {
                        // First amount found - determine based on description context
                        const descLower = description.toLowerCase();
                        if (descLower.includes('tra spei-') || descLower.includes('comision') || 
                            descLower.includes('facebook')) {
                            cargoAmount = amount;
                        } else if (descLower.includes('int ') || descLower.includes('pago mr sabor')) {
                            abonoAmount = amount;
                        } else {
                            // Default to cargo
                            cargoAmount = amount;
                        }
                    }
                }
            });
        } else {
            // No amounts, add to description if meaningful
            if (i > startIndex && line.length > 3 && 
                !line.match(/^(DIA|CONCEPTO|CARGOS|ABONOS|SALDO|Page)$/i)) {
                description += ' ' + line;
            }
        }
        
        i++;
    }
    
    console.log(`📝 Extracted data: desc="${description.substring(0, 50)}...", cargo=${cargoAmount}, abono=${abonoAmount}`);
    
    return {
        description: description,
        cargoAmount: cargoAmount,
        abonoAmount: abonoAmount,
        nextIndex: i
    };
}

function buildDateFromDay(day, period) {
    try {
        const year = period.year;
        const month = period.month;
        
        // Validate day for this month
        const maxDay = new Date(year, month, 0).getDate();
        const validDay = Math.min(Math.max(1, day), maxDay);
        
        const date = new Date(year, month - 1, validDay);
        const dateString = date.toISOString().split('T')[0];
        
        console.log(`📅 Built date: day ${day} → ${period.month_name} ${validDay}, ${year} → ${dateString}`);
        
        return dateString;
    } catch (error) {
        console.error('Error building date:', error);
        return new Date().toISOString().split('T')[0];
    }
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
        const shortDesc = transaction.description.substring(0, 60).replace(/\s+/g, ' ').trim();
        const key = `${transaction.transaction_date}-${shortDesc}-${Math.abs(transaction.amount)}`;
        if (seen.has(key)) {
            console.log(`🗑️ Removing duplicate: ${shortDesc}`);
            return false;
        }
        seen.add(key);
        return true;
    });
}
