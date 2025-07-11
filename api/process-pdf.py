import json
import base64
import re
from datetime import datetime
from io import BytesIO

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

def handler(request):
    """
    Vercel serverless function handler para procesar PDFs de Banregio
    """
    
    # Handle CORS preflight requests
    if request.method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            'body': ''
        }
    
    # Only allow POST requests
    if request.method != 'POST':
        return {
            'statusCode': 405,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            'body': json.dumps({
                'success': False,
                'error': 'Method not allowed. Use POST.'
            })
        }
    
    try:
        # Parse request body
        if hasattr(request, 'body'):
            body_data = request.body
        else:
            body_data = request.get_json()
        
        if isinstance(body_data, str):
            body_data = json.loads(body_data)
        
        # Extract PDF data
        pdf_data_b64 = body_data.get('pdf_data')
        filename = body_data.get('filename', 'unknown.pdf')
        
        if not pdf_data_b64:
            return {
                'statusCode': 400,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json',
                },
                'body': json.dumps({
                    'success': False,
                    'error': 'No PDF data provided'
                })
            }
        
        # Process PDF
        result = process_banregio_pdf(pdf_data_b64, filename)
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            'body': json.dumps(result)
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            'body': json.dumps({
                'success': False,
                'error': f'Internal server error: {str(e)}'
            })
        }

def process_banregio_pdf(pdf_data_b64, filename):
    """
    Procesa un PDF de estado de cuenta de Banregio
    """
    
    if not pdfplumber:
        # Fallback si pdfplumber no está disponible
        return get_fallback_data()
    
    try:
        # Decode base64 PDF data
        pdf_data = base64.b64decode(pdf_data_b64)
        pdf_stream = BytesIO(pdf_data)
        
        transactions = []
        statement_period = None
        
        # Extract data from PDF
        with pdfplumber.open(pdf_stream) as pdf:
            
            # Extract statement period from first page
            if pdf.pages:
                statement_period = extract_statement_period(pdf.pages[0])
            
            # Extract transactions from all pages
            for page in pdf.pages:
                page_transactions = extract_transactions_from_page(page, statement_period)
                transactions.extend(page_transactions)
        
        # Remove duplicates and sort by date
        unique_transactions = remove_duplicates(transactions)
        sorted_transactions = sorted(unique_transactions, key=lambda x: x.get('transaction_date', ''))
        
        return {
            'success': True,
            'transactions': sorted_transactions,
            'metadata': {
                'filename': filename,
                'statement_period': statement_period,
                'total_transactions': len(sorted_transactions),
                'processing_method': 'Python pdfplumber with CARGOS/ABONOS detection'
            }
        }
        
    except Exception as e:
        # Return fallback data if PDF processing fails
        return get_fallback_data(error=str(e))

def extract_statement_period(page):
    """
    Extrae el período del estado de cuenta
    """
    try:
        text = page.extract_text()
        
        # Buscar patrón: "del 01 al 31 de ENERO 2024"
        period_match = re.search(r'del \d+ al \d+ de (\w+) (\d{4})', text, re.IGNORECASE)
        if period_match:
            month_name = period_match.group(1).lower()
            year = int(period_match.group(2))
            
            months = {
                'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
                'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
                'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
            }
            
            return {
                'month': months.get(month_name, 1),
                'year': year,
                'month_name': month_name.title()
            }
    except:
        pass
    
    return None

def extract_transactions_from_page(page, statement_period):
    """
    Extrae transacciones de una página
    """
    transactions = []
    
    try:
        # Method 1: Try to extract structured tables
        tables = page.extract_tables()
        
        for table in tables:
            if table and len(table) > 1:
                table_transactions = process_transaction_table(table, statement_period)
                transactions.extend(table_transactions)
        
        # Method 2: Extract from text if tables don't work
        if not transactions:
            text_transactions = extract_from_text(page, statement_period)
            transactions.extend(text_transactions)
            
    except Exception as e:
        pass
    
    return transactions

def process_transaction_table(table, statement_period):
    """
    Procesa una tabla de transacciones
    """
    transactions = []
    
    try:
        # Find header row
        header_row_idx = None
        for i, row in enumerate(table):
            if row and any(cell and ('CONCEPTO' in str(cell).upper() or 'DIA' in str(cell).upper()) for cell in row):
                header_row_idx = i
                break
        
        if header_row_idx is None:
            return []
        
        headers = [str(cell).strip() if cell else '' for cell in table[header_row_idx]]
        
        # Find column indices
        dia_idx = find_column_index(headers, ['DIA', 'FECHA'])
        concepto_idx = find_column_index(headers, ['CONCEPTO', 'DESCRIPCION'])
        cargos_idx = find_column_index(headers, ['CARGOS'])
        abonos_idx = find_column_index(headers, ['ABONOS'])
        
        # Process data rows
        for row in table[header_row_idx + 1:]:
            if not row or len(row) <= max(concepto_idx or 0, cargos_idx or 0, abonos_idx or 0):
                continue
            
            transaction = parse_table_row(row, dia_idx, concepto_idx, cargos_idx, abonos_idx, statement_period)
            if transaction:
                transactions.append(transaction)
    
    except Exception as e:
        pass
    
    return transactions

def parse_table_row(row, dia_idx, concepto_idx, cargos_idx, abonos_idx, statement_period):
    """
    Parsea una fila de la tabla
    """
    try:
        # Extract day
        day = None
        if dia_idx is not None and dia_idx < len(row) and row[dia_idx]:
            day_match = re.search(r'\d+', str(row[dia_idx]))
            if day_match:
                day = int(day_match.group())
        
        # Extract concept
        concept = ''
        if concepto_idx is not None and concepto_idx < len(row) and row[concepto_idx]:
            concept = str(row[concepto_idx]).strip()
        
        if not concept or not day:
            return None
        
        # Extract amounts
        cargo_amount = 0
        abono_amount = 0
        
        if cargos_idx is not None and cargos_idx < len(row) and row[cargos_idx]:
            cargo_amount = parse_amount(str(row[cargos_idx]))
        
        if abonos_idx is not None and abonos_idx < len(row) and row[abonos_idx]:
            abono_amount = parse_amount(str(row[abonos_idx]))
        
        if cargo_amount == 0 and abono_amount == 0:
            return None
        
        # 🎯 CLASIFICACIÓN CORRECTA BASADA EN COLUMNAS CARGOS/ABONOS
        if cargo_amount > 0:
            transaction_type = 'debit'
            amount = -cargo_amount  # Negativo para gastos
            category = get_category_from_description(concept, True)  # True = es gasto
        elif abono_amount > 0:
            transaction_type = 'credit'
            amount = abono_amount   # Positivo para ingresos
            category = get_category_from_description(concept, False)  # False = es ingreso
        else:
            return None
        
        return {
            'transaction_date': build_date(day, statement_period),
            'description': concept,
            'amount': amount,
            'transaction_type': transaction_type,
            'category': category
        }
        
    except Exception as e:
        return None

def extract_from_text(page, statement_period):
    """
    Extrae transacciones del texto cuando las tablas no funcionan
    """
    transactions = []
    
    try:
        text = page.extract_text()
        lines = text.split('\n')
        
        for line in lines:
            line = line.strip()
            
            # Skip empty lines and headers
            if not line or 'CONCEPTO' in line or 'SALDO' in line:
                continue
            
            # Look for transaction patterns
            # Pattern: day + description + amounts
            day_match = re.match(r'^(\d{1,2})\s+(.+)', line)
            if day_match:
                day = int(day_match.group(1))
                rest = day_match.group(2)
                
                # Extract amounts from the line
                amounts = re.findall(r'[\d,]+\.\d{2}', rest)
                
                if amounts:
                    # Determine if it's cargo or abono based on context
                    description = re.sub(r'[\d,]+\.\d{2}', '', rest).strip()
                    main_amount = float(amounts[0].replace(',', ''))
                    
                    # Use description analysis to determine type
                    is_cargo = is_transaction_cargo(description)
                    
                    if is_cargo:
                        transaction_type = 'debit'
                        amount = -main_amount
                        category = get_category_from_description(description, True)
                    else:
                        transaction_type = 'credit'
                        amount = main_amount
                        category = get_category_from_description(description, False)
                    
                    transaction = {
                        'transaction_date': build_date(day, statement_period),
                        'description': description,
                        'amount': amount,
                        'transaction_type': transaction_type,
                        'category': category
                    }
                    
                    transactions.append(transaction)
    
    except Exception as e:
        pass
    
    return transactions

def is_transaction_cargo(description):
    """
    Determina si una transacción es cargo basándose en la descripción
    """
    desc_lower = description.lower()
    
    # Patrones que indican CARGOS (gastos)
    cargo_patterns = [
        'tra spei-', 'spei -', 'comision', 'administracion', 'manejo de cuenta',
        'retiro', 'cargo', 'transferencia', 'pago'
    ]
    
    for pattern in cargo_patterns:
        if pattern in desc_lower:
            return True
    
    return False

def get_category_from_description(description, is_cargo):
    """
    Determina la categoría basándose en la descripción
    """
    desc_lower = description.lower()
    
    if 'comision' in desc_lower or 'administracion' in desc_lower:
        return 'Comisiones'
    elif 'spei' in desc_lower or 'transferencia' in desc_lower:
        return 'Transferencias'
    elif is_cargo:
        return 'Gastos'
    else:
        return 'Ingresos'

def find_column_index(headers, possible_names):
    """
    Encuentra el índice de una columna por nombre
    """
    for i, header in enumerate(headers):
        if header:
            header_upper = header.upper()
            for name in possible_names:
                if name in header_upper:
                    return i
    return None

def parse_amount(amount_str):
    """
    Parsea un string de monto a float
    """
    if not amount_str:
        return 0
    
    # Remove spaces and non-numeric characters except comma and period
    cleaned = re.sub(r'[^\d,.]', '', str(amount_str))
    
    if not cleaned:
        return 0
    
    # Handle comma as thousands separator
    if ',' in cleaned and '.' in cleaned:
        # Format: 1,234.56
        cleaned = cleaned.replace(',', '')
    elif ',' in cleaned and len(cleaned.split(',')[1]) == 2:
        # Format: 1234,56 (European format)
        cleaned = cleaned.replace(',', '.')
    elif ',' in cleaned:
        # Format: 1,234 (thousands separator)
        cleaned = cleaned.replace(',', '')
    
    try:
        return float(cleaned)
    except:
        return 0

def build_date(day, statement_period):
    """
    Construye fecha completa usando el día y el período del estado
    """
    if not day or not statement_period:
        return datetime.now().isoformat()
    
    try:
        year = statement_period['year']
        month = statement_period['month']
        
        # Handle edge cases
        if day > 31:
            day = 31
        
        date = datetime(year, month, day)
        return date.isoformat()
    except:
        return datetime.now().isoformat()

def remove_duplicates(transactions):
    """
    Elimina transacciones duplicadas
    """
    seen = set()
    unique_transactions = []
    
    for transaction in transactions:
        # Create a unique key
        key = (
            transaction.get('transaction_date'),
            transaction.get('description'),
            transaction.get('amount')
        )
        
        if key not in seen:
            seen.add(key)
            unique_transactions.append(transaction)
    
    return unique_transactions

def get_fallback_data(error=None):
    """
    Datos de fallback cuando el procesamiento falla
    """
    return {
        'success': False,
        'transactions': [
            {
                'transaction_date': '2024-03-01',
                'description': 'Sample transaction - PDF processing not available',
                'amount': -1000.00,
                'transaction_type': 'debit',
                'category': 'Test'
            }
        ],
        'error': error or 'PDF processing not available. Install pdfplumber.',
        'metadata': {
            'processing_method': 'Fallback data',
            'note': 'Real PDF processing requires pdfplumber library'
        }
    }

# For Vercel serverless functions
def main(request):
    return handler(request)

# Default export for Vercel
if __name__ == "__main__":
    # This allows local testing
    class MockRequest:
        def __init__(self):
            self.method = 'POST'
            self.body = {
                'pdf_data': '',
                'filename': 'test.pdf'
            }
    
    result = handler(MockRequest())
    print(json.dumps(result, indent=2))
  
