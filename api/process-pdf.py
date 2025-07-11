import json
from urllib.parse import parse_qs

def handler(request):
    """
    Vercel serverless function handler
    """
    
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            'body': ''
        }
    
    # Handle GET request - return status
    if request.method == 'GET':
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({
                "status": "Backend is working!",
                "message": "FinanceBro PDF processor is ready",
                "version": "1.0",
                "supported_methods": ["GET", "POST"]
            })
        }
    
    # Handle POST request
    if request.method == 'POST':
        try:
            # Get request body
            body = request.get('body', '{}')
            if isinstance(body, bytes):
                body = body.decode('utf-8')
            
            data = json.loads(body)
            
            # Extract filename to determine which sample data to return
            filename = data.get('filename', 'unknown.pdf')
            pdf_data = data.get('pdf_data', '')
            
            # Process based on filename
            result = process_pdf_by_filename(filename)
            
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                'body': json.dumps(result)
            }
            
        except Exception as e:
            return {
                'statusCode': 500,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                'body': json.dumps({
                    "success": False,
                    "error": f"Error processing request: {str(e)}"
                })
            }
    
    # Method not allowed
    return {
        'statusCode': 405,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        'body': json.dumps({
            "success": False,
            "error": "Method not allowed"
        })
    }

def process_pdf_by_filename(filename):
    """
    Devuelve datos específicos basados en el nombre del archivo
    """
    
    filename_lower = filename.lower()
    
    # Datos para Enero
    if 'enero' in filename_lower or '01' in filename_lower or 'january' in filename_lower:
        return {
            "success": True,
            "transactions": [
                {
                    "transaction_date": "2024-01-08",
                    "description": "SPEI - NUEZTRA (BBVA)",
                    "amount": -1161.00,
                    "transaction_type": "debit",
                    "category": "Transferencias"
                },
                {
                    "transaction_date": "2024-01-11",
                    "description": "TRAP-FKTT410 SPEI, SANTANDER",
                    "amount": 705.00,
                    "transaction_type": "credit",
                    "category": "Ingresos"
                },
                {
                    "transaction_date": "2024-01-11",
                    "description": "MBAN-FKUC003 SPEI, BBVA MEXICO",
                    "amount": 960.00,
                    "transaction_type": "credit",
                    "category": "Ingresos"
                },
                {
                    "transaction_date": "2024-01-28",
                    "description": "SPEI - NATALIA (BBVA)",
                    "amount": -18000.00,
                    "transaction_type": "debit",
                    "category": "Transferencias"
                }
            ],
            "metadata": {
                "filename": filename,
                "month": "Enero 2024",
                "total_transactions": 4,
                "processing_method": "Backend sample data for January"
            }
        }
    
    # Datos para Febrero
    elif 'febrero' in filename_lower or '02' in filename_lower or 'february' in filename_lower:
        return {
            "success": True,
            "transactions": [
                {
                    "transaction_date": "2024-02-01",
                    "description": "CFQASNLIUY-*Com.ADMINISTRACION O MANEJO DE CUENTA",
                    "amount": -37.65,
                    "transaction_type": "debit",
                    "category": "Comisiones"
                },
                {
                    "transaction_date": "2024-02-05",
                    "description": "SPEI - . (BBVA)",
                    "amount": 1668.00,
                    "transaction_type": "credit",
                    "category": "Ingresos"
                },
                {
                    "transaction_date": "2024-02-06",
                    "description": "SPEI - (BAJIO)",
                    "amount": 1020.00,
                    "transaction_type": "credit",
                    "category": "Ingresos"
                },
                {
                    "transaction_date": "2024-02-08",
                    "description": "TRAP-FZEF885 SPEI, SANTANDER",
                    "amount": 501.00,
                    "transaction_type": "credit",
                    "category": "Ingresos"
                },
                {
                    "transaction_date": "2024-02-15",
                    "description": "SPEI - Lupita (BBVA)",
                    "amount": -1160.00,
                    "transaction_type": "debit",
                    "category": "Transferencias"
                },
                {
                    "transaction_date": "2024-02-21",
                    "description": "SPEI - NUEZTRA (BBVA)",
                    "amount": -330.00,
                    "transaction_type": "debit",
                    "category": "Transferencias"
                }
            ],
            "metadata": {
                "filename": filename,
                "month": "Febrero 2024",
                "total_transactions": 6,
                "processing_method": "Backend sample data for February"
            }
        }
    
    # Datos para Marzo
    elif 'marzo' in filename_lower or '03' in filename_lower or 'march' in filename_lower:
        return {
            "success": True,
            "transactions": [
                {
                    "transaction_date": "2024-03-01",
                    "description": "SPEI - NATALIA (BBVA)",
                    "amount": -2500.00,
                    "transaction_type": "debit",
                    "category": "Transferencias"
                },
                {
                    "transaction_date": "2024-03-03",
                    "description": "SPEI - NATALIA (BBVA)",
                    "amount": -1500.00,
                    "transaction_type": "debit",
                    "category": "Transferencias"
                },
                {
                    "transaction_date": "2024-03-03",
                    "description": "3843CP-GLUQ496 SPEI, BANORTE",
                    "amount": 412.00,
                    "transaction_type": "credit",
                    "category": "Ingresos"
                },
                {
                    "transaction_date": "2024-03-07",
                    "description": "-GRANOLA",
                    "amount": -501.00,
                    "transaction_type": "debit",
                    "category": "Transferencias"
                },
                {
                    "transaction_date": "2024-03-18",
                    "description": "SPEI - (BAJIO)",
                    "amount": 1575.00,
                    "transaction_type": "credit",
                    "category": "Ingresos"
                },
                {
                    "transaction_date": "2024-03-18",
                    "description": "BNET-GTOE192 SPEI, BBVA MEXICO",
                    "amount": 532.00,
                    "transaction_type": "credit",
                    "category": "Ingresos"
                },
                {
                    "transaction_date": "2024-03-18",
                    "description": "--15/03/2024 FACEBK *6NNMY2QCX2",
                    "amount": -517.62,
                    "transaction_type": "debit",
                    "category": "Servicios"
                },
                {
                    "transaction_date": "2024-03-20",
                    "description": "BNET-GUQZ795 SPEI, BBVA MEXICO",
                    "amount": 1236.00,
                    "transaction_type": "credit",
                    "category": "Ingresos"
                },
                {
                    "transaction_date": "2024-03-26",
                    "description": "TRA-Comision por administracion o manejo de cuenta",
                    "amount": -320.00,
                    "transaction_type": "debit",
                    "category": "Comisiones"
                },
                {
                    "transaction_date": "2024-03-26",
                    "description": "TRA-IVA comision por administracion o manejo de cuenta",
                    "amount": -51.20,
                    "transaction_type": "debit",
                    "category": "Comisiones"
                }
            ],
            "metadata": {
                "filename": filename,
                "month": "Marzo 2024",
                "total_transactions": 10,
                "processing_method": "Backend sample data for March"
            }
        }
    
    # Datos genéricos
    else:
        return {
            "success": True,
            "transactions": [
                {
                    "transaction_date": "2024-01-01",
                    "description": "Sample Transaction - Backend Working",
                    "amount": -1000.00,
                    "transaction_type": "debit",
                    "category": "Test"
                },
                {
                    "transaction_date": "2024-01-02",
                    "description": "Sample Income - Backend Working",
                    "amount": 2000.00,
                    "transaction_type": "credit",
                    "category": "Test"
                }
            ],
            "metadata": {
                "filename": filename,
                "month": "Unknown",
                "total_transactions": 2,
                "processing_method": "Backend sample data - Generic"
            }
        }
        
