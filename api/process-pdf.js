export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  try {
    // FORCED TEST TRANSACTIONS - if you see these, the code IS updating
    const testTransactions = [
      {
        transaction_date: '2024-01-09',
        description: '🔥 THIS IS A TEST - CODE IS UPDATING! 🔥',
        amount: 999999.99,
        transaction_type: 'credit',
        category: 'TEST'
      },
      {
        transaction_date: '2024-01-10',
        description: '🔥 SECOND TEST TRANSACTION 🔥',
        amount: -888888.88,
        transaction_type: 'debit',
        category: 'TEST'
      }
    ];
    
    res.status(200).json({
      success: true,
      transactions: testTransactions,
      count: testTransactions.length,
      message: '🔥 IF YOU SEE THIS, THE CODE IS WORKING! 🔥'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
