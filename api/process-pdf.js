export default function handler(req, res) {
  res.status(200).json({
    success: true,
    transactions: [
      {
        transaction_date: '2024-01-09',
        description: 'Simple test transaction 1',
        amount: -1000.00,
        transaction_type: 'debit',
        category: 'Test'
      },
      {
        transaction_date: '2024-01-10', 
        description: 'Simple test transaction 2',
        amount: 500.00,
        transaction_type: 'credit',
        category: 'Test'
      }
    ],
    count: 2,
    message: 'Simple version working'
  });
}
