export default function handler(req, res) {
    // Solo manejar GET y POST
    if (req.method === 'GET') {
        res.status(200).json({
            status: "Backend working!",
            message: "Node.js API ready"
        });
        return;
    }
    
    if (req.method === 'POST') {
        // Datos de ejemplo directos
        res.status(200).json({
            success: true,
            transactions: [
                {
                    transaction_date: "2024-01-01",
                    description: "Test transaction from Node.js",
                    amount: -1000.00,
                    transaction_type: "debit",
                    category: "Test"
                },
                {
                    transaction_date: "2024-01-02", 
                    description: "Test income from Node.js",
                    amount: 2000.00,
                    transaction_type: "credit",
                    category: "Test"
                }
            ],
            metadata: {
                total_transactions: 2,
                processing_method: "Simple Node.js backend"
            }
        });
        return;
    }
    
    // Otros métodos
    res.status(405).json({ error: "Method not allowed" });
}
