from http.server import BaseHTTPRequestHandler
import json
import base64
import pdfplumber
import pandas as pd
import io
import re
from datetime import datetime

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # Parse request
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            # Get base64 PDF data
            pdf_base64 = data.get('pdf_data')
            if not pdf_base64:
                self.send_error_response(400, "No PDF data provided")
                return
            
            # Decode PDF
            pdf_bytes = base64.b64decode(pdf_base64)
            pdf_stream = io.BytesIO(pdf_bytes)
            
            # Process PDF
            transactions = self.extract_banregio_transactions(pdf_stream)
            
            # Send response
            self.send_success_response({
                'success': True,
                'transactions': transactions,
                'count': len(transactions)
            })
            
        except Exception as e:
            self.send_error_response(500, str(e))
    
    def extract_banregio_transactions(self, pdf_stream):
        transactions = []
        
        with pdfplumber.open(pdf_stream) as pdf:
            # Extract text from all pages
            full_text = ""
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    full_text += page_text + "\n"
            
            print(f"Extracted text length: {len(full_text)}")
            print(f"First 500 chars: {full_text[:500]}")
            
            # Extract statement period
            period_info = self.extract_statement_period(full_text)
            print(f"Period info: {period_info}")
            
            # Find transaction section
            lines = full_text.split('\n')
            in_transaction_section = False
            
            for i, line in enumerate(lines):
                line = line.strip()
                if not line:
                    continue
                
                # Detect transaction section start
                if 'DIA' in line and 'CONCEPTO' in line and ('CARGOS' in line or 'ABONOS' in line):
                    in_transaction_section = True
                    print(f"Found transaction section at line {i}: {line}")
                    continue
                
                # Detect transaction section end
                if in_transaction_section and ('Total' in line or 'Saldo Mínimo' in line or 'Gráfico' in line):
                    print(f"End of transaction section at line {i}: {line}")
                    break
                
                # Process transaction lines
                if in_transaction_section:
                    transaction = self.parse_banregio_line(line, period_info)
                    if transaction:
                        transactions.append(transaction)
                        print(f"Parsed transaction: {transaction}")
        
        print(f"Total transactions found: {len(transactions)}")
        return transactions
    
    def extract_statement_period(self, text):
        # Extract month and year from "del 01 al 31 de ENERO 2024"
        month_map = {
            'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
            'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
            'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
        }
        
        period_match = re.search(r'de\s+(\w+)\s+(\d{4})', text, re.IGNORECASE)
        if period_match:
            month_name = period_match.group(1).lower()
            year = period_match.group(2)
            month = month_map.get(month_name, '01')
            return {'month': month, 'year': year}
        
        # Fallback to current date
        now = datetime.now()
        return {'month': f"{now.month:02d}", 'year': str(now.year)}
    
    def parse_banregio_line(self, line, period_info):
        # Match lines starting with day number
        day_match = re.match(r'^(\d{1,2})\s+(.+)', line)
        if not day_match:
            return None
        
        day = day_match.group(1)
        content = day_match.group(2)
        
        # Extract amounts (numbers with possible commas and decimals)
        amounts = re.findall(r'\d{1,3}(?:,\d{3})*\.?\d{2}', content)
        if len(amounts) < 2:
            return None
        
        # Transaction amount is typically second-to-last, balance is last
        transaction_amount = amounts[-2]
        balance = amounts[-1]
        
        # Get description (everything before transaction amount)
        amount_index = content.rfind(transaction_amount)
        raw_description = content[:amount_index].strip()
        
        # Clean description
        description = self.clean_description(raw_description)
        
        # Determine credit/debit
        is_credit = self.is_credit_transaction(raw_description)
        
        # Parse amount
        amount_value = float(transaction_amount.replace(',', ''))
        final_amount = amount_value if is_credit else -amount_value
        
        return {
            'transaction_date': f"{period_info['year']}-{period_info['month']}-{day.zfill(2)}",
            'description': description,
            'amount': final_amount,
            'transaction_type': 'credit' if is_credit else 'debit',
            'category': self.categorize_transaction(raw_description)
        }
    
    def clean_description(self, raw_desc):
        # Remove common prefixes and codes
        cleaned = re.sub(r'^(TRA|INT)\s+', '', raw_desc)
        cleaned = re.sub(r'SPEI-\w+\s*', '', cleaned)
        cleaned = re.sub(r'\d{13,}', '', cleaned)
        cleaned = re.sub(r'\d{3}-\d{2}/\d{2}/\d{4}/\d{2}-\d{3}\w+', '', cleaned)
        
        # Extract meaningful parts from SPEI transactions
        if 'SPEI,' in cleaned:
            parts = [p.strip() for p in cleaned.split(',')]
            if len(parts) >= 4:
                bank = parts[1].replace('MEXICO', '').strip()
                person = re.sub(r'\d+', '', parts[3]).strip()
                
                # Get concept from the end if available
                concept = ''
                if len(parts) > 4:
                    last_part = parts[-1].strip()
                    if last_part and len(last_part) > 3 and not last_part.isdigit():
                        concept = last_part
                
                if concept:
                    return f"{concept} - {person} ({bank})"
                else:
                    return f"SPEI - {person} ({bank})"
        
        # General cleanup
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        cleaned = re.sub(r'\d{6,}', '', cleaned)  # Remove long number sequences
        
        return cleaned[:100] if cleaned else raw_desc[:50]
    
    def is_credit_transaction(self, description):
        lower_desc = description.lower()
        
        # Credit patterns (money coming IN to the account)
        credit_patterns = [
            'transferencia a genki',
            'transferencia a',
            'deposito',
            'abono',
            'la fresita',
            'ingreso',
            'recibida'
        ]
        
        for pattern in credit_patterns:
            if pattern in lower_desc:
                return True
        
        # Debit patterns (money going OUT of the account)
        debit_patterns = [
            'transferencia de genki',
            'transferencia de',
            'pago',
            'retiro',
            'cargo',
            'comision'
        ]
        
        for pattern in debit_patterns:
            if pattern in lower_desc:
                return False
        
        # Default to debit for unclear cases
        return False
    
    def categorize_transaction(self, description):
        lower_desc = description.lower()
        
        if 'transferencia' in lower_desc or 'spei' in lower_desc:
            return 'Transferencias'
        elif 'pago' in lower_desc:
            return 'Pagos'
        elif 'deposito' in lower_desc:
            return 'Depositos'
        elif 'retiro' in lower_desc:
            return 'Retiros'
        elif 'comision' in lower_desc:
            return 'Bancarios'
        else:
            return 'Otros'
    
    def send_success_response(self, data):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
    
    def send_error_response(self, status, message):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        error_data = {'success': False, 'error': message}
        self.wfile.write(json.dumps(error_data).encode('utf-8'))
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
