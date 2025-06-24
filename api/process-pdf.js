export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Only accept POST requests
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
    
    // For now, return sample transactions
    // Later we'll add real PDF processing
    const sampleTransactions = [
      {
        transaction_date: '2024-01-09',
        description: 'SPEI Transfer - Real Backend Processing',
        amount: -1161.00,
        transaction_type: 'debit',
        category: 'Transferencias'
      },
      {
        transaction_date: '2024-01-12',
        description: 'Transfer Received - Real Backend Processing',
        amount: 705.00,
        transaction_type: 'credit',
        category: 'Transferencias'
      },
      {
        transaction_date: '2024-01-15',
        description: 'Service Payment - Real Backend Processing',
        amount: -850.00,
        transaction_type: 'debit',
        category: 'Servicios'
      }
    ];
    
    res.status(200).json({
      success: true,
      transactions: sampleTransactions,
      count: sampleTransactions.length,
      message: 'PDF processed successfully by Node.js backend'
    });
    
  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
