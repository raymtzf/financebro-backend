import pdf from 'pdf-parse';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method === 'GET') {
        res.status(200).json({
            status: "PDF Processor Enhanced",
            message: "Working version + better detection"
        });
        return;
    }
    
    if (req.method === 'POST') {
        try {
            const { pdf_data, filename } = req.body;
            
            if (!pdf_data) {
                return res.status(400).json({
                    success: false,
                    error: "No PDF data provided"
                });
            }

            const pdfBuffer = Buffer.from(pdf_data, 'base64');
            const pdfData = await pdf(pdfBuffer);
            const pdfText = pdfData.text;
            
            const result = processPDFEnhanced(pdfText, filename);
            res.status(200).json(result);
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: `Error: ${error.message}`
            });
        }
        return;
    }
    
    res.status(405).json({ error: "Method not allowed" });
}

function processPDFEnhanced(pdfText, filename) {
    const period = { month: 3, year: 2024, month_name: 'Marzo' };
    const transactions = [];
    const lines = pdfText.split('\n');
    
    console.log(`Processing ${lines.length} lines`);
    
    let i = 0;
    while (i < lines.length) {
        const line = lines[i].trim();
        
        // STRATEGY 1: The working pattern (two amounts)
        const amountMatch = line.match(/^\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/);
        
        if (amountMatch) {
            const amount1 = parseFloat(amountMatch[1].replace(/,/g, ''));
            console.log(`Found amount pattern: ${line} → ${amount1}`);
            
            const transactionData = collectTransactionData(lines, i + 1, 15);
            
            if (transactionData.description && transactionData.description.length > 10) {
                const transaction = createTransaction(transactionData.description, amount1, transactionData.day, period);
                if (transaction) {
                    transactions.push(transaction);
                    console.log(`✅ Added: ${transaction.description.substring(0, 30)}... → ${transaction.amount}`);
                }
            }
            i = transactionData.nextIndex || i + 1;
        }
        
        // STRATEGY 2: Lines starting with day + transaction content
        else {
            const dayTransactionMatch = line.match(/^(\d{1,2})\s+(TRA|INT)\s+(.+)/);
            
            if (dayTransactionMatch) {
                const day = parseInt(dayTransactionMatch[1]);
                const transactionContent = dayTransactionMatch[2] + ' ' + dayTransactionMatch[3];
                
                if (day >= 1 && day <= 31) {
                    console.log(`Found day transaction: Day ${day}, ${transactionContent.substring(0, 30)}...`);
                    
                    const extendedData = collectTransactionData(lines, i, 5);
                    const fullDescription = transactionContent + ' ' + extendedData.description;
                    
                    // Look for amounts in the extended description
                    const amounts = fullDescription.match(/[\d,]+\.\d{2}/g);
                    if (amounts) {
                        const amount = parseFloat(amounts[0].replace(/,/g, ''));
                        const transaction = createTransaction(fullDescription, amount, day, period);
                        if (transaction) {
                            transactions.push(transaction);
                            console.log(`✅ Added day transaction: ${transaction.description.substring(0, 30)}... → ${transaction.amount}`);
                        }
                    }
                }
            }
            i++;
        }
    }
    
    // Remove duplicates and clean up
    const cleanTransactions = removeDuplicatesAndClean(transactions);
    
    console.log(`Final result: ${cleanTransactions.length} transactions`);
    
    return {
        success: true,
        transactions: cleanTransactions,
        metadata: {
            filename: filename,
            total_transactions: cleanTransactions.length,
            processing_method: "Enhanced working version"
        }
    };
}

function collectTransactionData(lines, startIndex, maxLines) {
    let description = '';
    let day = null;
    let j = startIndex;
    
    while (j < lines.length && j < startIndex + maxLines) {
        const nextLine = lines[j].trim();
        
        // Stop if we hit another amount line
        if (nextLine.match(/^\s*[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s*$/)) {
            break;
        }
        
        // Capture standalone day
        if (nextLine.match(/^\d{1,2}$/) && parseInt(nextLine) <= 31) {
            day = parseInt(nextLine);
            j++;
            break;
        }
        
        // Add meaningful content
        if (nextLine && nextLine.length > 0 && 
            !nextLine.match(/^(DIA|CONCEPTO|CARGOS|ABONOS|SALDO|Page \d+ of \d+)$/i)) {
            if (description) description += ' ';
            description += nextLine;
        }
        j++;
    }
    
    return { description: description.trim(), day: day, nextIndex: j };
}

function createTransaction(description, amount, day, period) {
    // Skip if description is too short or looks like header
    if (!description || description.length < 8) {
        return null;
    }
    
    // Skip obvious non-transactions
    const desc = description.toLowerCase();
    if (desc.includes('concepto') || desc.includes('saldo') || desc.includes('total')) {
        return null;
    }
    
    // Determine date
    let finalDate;
    const dateMatch = description.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dateMatch) {
        const d = parseInt(dateMatch[1]);
        const m = parseInt(dateMatch[2]);
        const y = parseInt(dateMatch[3]);
        if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y > 2020) {
            finalDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
    }
    
    if (!finalDate && day) {
        finalDate = `2024-03-${String(day).padStart(2, '0')}`;
    }
    
    if (!finalDate) {
        finalDate = '2024-03-01';
    }
    
    // Determine transaction type
    const isAbono = desc.includes('int ') || desc.includes('pago mr sabor') || 
                    desc.includes('insumos') || desc.includes('multisabor');
    
    const isCleanAmount = amount > 0 && amount < 1000000; // Reasonable amount range
    
    if (!isCleanAmount) {
        return null;
    }
    
    return {
        transaction_date: finalDate,
        description: description.trim(),
        amount: isAbono ? amount : -amount,
        transaction_type: isAbono ? 'credit' : 'debit',
        category: isAbono ? 'Ingresos' : (desc.includes('comision') ? 'Comisiones' : 
                 (desc.includes('facebook') ? 'Servicios' : 'Transferencias'))
    };
}

function removeDuplicatesAndClean(transactions) {
    const seen = new Set();
    const cleaned = [];
    
    for (const transaction of transactions) {
        // Create a unique key for deduplication
        const normalizedDesc = transaction.description.substring(0, 50).replace(/\s+/g, ' ').trim();
        const key = `${transaction.transaction_date}-${normalizedDesc}-${Math.abs(transaction.amount)}`;
        
        if (!seen.has(key)) {
            seen.add(key);
            cleaned.push(transaction);
        } else {
            console.log(`🗑️ Removed duplicate: ${normalizedDesc}`);
        }
    }
    
    // Sort by date
    return cleaned.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
}
