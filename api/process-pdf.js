export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }
  
  try {
    const { pdf_data } = req.body;
    
    if (!pdf_data) {
      res.status(400).json({ success: false, error: 'No PDF data provided' });
      return;
    }
    
    // Decode base64 PDF
    const pdfBuffer = Buffer.from(pdf_data, 'base64');
    
    // Extract text from PDF
    let extractedText = '';
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(pdfBuffer);
      extractedText = data.text;
    } catch (error) {
      console.error('PDF parsing failed:', error);
      res.status(500).json({ success: false, error: 'PDF parsing failed: ' + error.message });
      return;
    }
    
    // DEBUG: Return the full extracted text for analysis
    const lines = extractedText.split('\n');
    const debugInfo = {
      totalLines: lines.length,
      fullText: extractedText,
      firstPage: extractedText.substring(0, 2000),
      lastPage: extractedText.substring(extractedText.length - 1000),
      linesWithNumbers: lines.filter(line => line.match(/^\d{1,2}\s+/)).slice(0, 10),
      linesWithDates: lines.filter(line => line.includes('2024') || line.includes('ENERO')),
      linesWithCargosAbonos: lines.filter(line => 
        line.includes('CARGOS') || line.includes('ABONOS') || line.includes('DIA')
      )
    };
    
    // Also try to parse transactions
    const transactions = parseTransactionsDebug(extractedText);
    
    res.status(200).json({
      success: true,
      transactions: transactions,
      count: transactions.length,
      debug: debugInfo
    });
    
  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

function parseTransactionsDebug(text) {
  const transactions = [];
  const lines = text.split('\n');
  
  console.log('=== DEBUGGING PDF PARSING ===');
  console.log('Total lines:', lines.length);
  
  // Show first 50 lines for debugging
  console.log('First 50 lines:');
  lines.slice(0, 50).forEach((line, i) => {
    console.log(`${i}: "${line}"`);
  });
  
  // Look for transaction patterns
  console.log('\n=== LOOKING FOR TRANSACTION PATTERNS ===');
  
  let foundTransactionSection = false;
  let transactionSectionStart = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for transaction section header
    if (line.includes('DIA') && line.includes('CONCEPTO')) {
      foundTransactionSection = true;
      transactionSectionStart = i;
      console.log(`Found transaction section at line ${i}: "${line}"`);
      continue;
    }
    
    // Look for lines that start with numbers (potential transactions)
    if (line.match(/^\d{1,2}\s+/)) {
      console.log(`Potential transaction line ${i}: "${line}"`);
      
      if (foundTransactionSection) {
        const transaction = parseLineDebug(line, i);
        if (transaction) {
          transactions.push(transaction);
        }
      }
    }
  }
  
  console.log(`Found transaction section: ${foundTransactionSection}`);
  console.log(`Transaction section starts at line: ${transactionSectionStart}`);
  console.log(`Total transactions parsed: ${transactions.length}`);
  
  return transactions;
}

function parseLineDebug(line, lineNumber) {
  console.log(`\n--- Parsing line ${lineNumber}: "${line}" ---`);
  
  const dayMatch = line.match(/^(\d{1,2})\s+(.+)/);
  if (!dayMatch) {
    console.log('No day match found');
    return null;
  }
  
  const day = dayMatch[1];
  const content = dayMatch[2];
  
  console.log(`Day: ${day}`);
  console.log(`Content: "${content}"`);
  
  // Find all numbers that look like amounts
  const amounts = content.match(/\d{1,3}(?:,\d{3})*\.?\d{2}/g) || [];
  console.log(`Found amounts: [${amounts.join(', ')}]`);
  
  if (amounts.length < 2) {
    console.log('Not enough amounts found');
    return null;
  }
  
  const transactionAmount = amounts[amounts.length - 2];
  const balance = amounts[amounts.length - 1];
  
  console.log(`Transaction amount: ${transactionAmount}`);
  console.log(`Balance: ${balance}`);
  
  // Get description
  const amountIndex = content.lastIndexOf(transactionAmount);
  const description = content.substring(0, amountIndex).trim();
  
  console.log(`Description: "${description}"`);
  
  // Determine credit/debit
  const isCredit = description.toLowerCase().includes('a genki') || 
                  description.toLowerCase().includes('la fresita') ||
                  description.toLowerCase().includes('deposito');
  
  console.log(`Is credit: ${isCredit}`);
  
  const parsedAmount = parseFloat(transactionAmount.replace(/,/g, ''));
  const finalAmount = isCredit ? parsedAmount : -parsedAmount;
  
  const result = {
    line_number: lineNumber,
    day: day,
    description: description,
    amount: finalAmount,
    transaction_type: isCredit ? 'credit' : 'debit',
    category: 'Debug',
    raw_line: line
  };
  
  console.log(`Result:`, result);
  return result;
}
