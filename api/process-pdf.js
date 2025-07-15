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
            status: "PDF Processor Working",
            message: "Back to the version that actually worked"
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
            
            const result = processPDF(pdfText, filename);
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

function processPDF(pdfText, filename) {
    const period = { month: 3, year: 2024, month_name: 'Marzo' };
    const transactions = [];
    const lines = pdfText.split('\n');
    
    let i = 0;
    while (i < lines.length) {
        const line = lines[i].trim();
        
        // EXACTLY the pattern that was working: two amounts
        const amountMatch = line.match(/^\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/);
        
        if (amountMatch) {
            const amount1 = parseFloat(amountMatch[1].replace(/,/g, ''));
            
            // Collect description - EXACTLY like before
            let description = '';
            let day = null;
            let j = i + 1;
            
            while (j < lines.length && j < i + 15) {
                const nextLine = lines[j].trim();
                
                if (nextLine.match(/^\s*[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s*$/)) {
                    break;
                }
                
                if (nextLine.match(/^\d{1,2}$/) && parseInt(nextLine) <= 31) {
                    day = parseInt(nextLine);
                    j++;
                    break;
                }
                
                if (nextLine && nextLine.length > 0 && 
                    !nextLine.match(/^(DIA|CONCEPTO|CARGOS|ABONOS|SALDO)$/i)) {
                    if (description) description += ' ';
                    description += nextLine;
                }
                j++;
            }
            
            if (description && description.length > 10) {
                // SIMPLE date logic - use day if found, otherwise extract from description
                let finalDate;
                
                const dateMatch = description.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                if (dateMatch) {
                    const d = parseInt(dateMatch[1]);
                    const m = parseInt(dateMatch[2]);
                    const y = parseInt(dateMatch[3]);
                    finalDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                } else if (day) {
                    finalDate = `2024-03-${String(day).padStart(2, '0')}`;
                } else {
                    finalDate = '2024-03-01';
                }
                
                // SIMPLE cargo/abono detection
                const desc = description.toLowerCase();
                const isAbono = desc.includes('int ') || desc.includes('pago mr sabor') || desc.includes('insumos');
                
                transactions.push({
                    transaction_date: finalDate,
                    description: description.trim(),
                    amount: isAbono ? amount1 : -amount1,
                    transaction_type: isAbono ? 'credit' : 'debit',
                    category: isAbono ? 'Ingresos' : 'Transferencias'
                });
            }
            i = j;
        } else {
            i++;
        }
    }
    
    return {
        success: true,
        transactions: transactions,
        metadata: {
            filename: filename,
            total_transactions: transactions.length,
            processing_method: "Back to working version"
        }
    };
}
