import fitz
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Extract guidelines PDF
print("=" * 80)
print("GUIDELINES PDF - EndSem_Notice_May2026.pdf")
print("=" * 80)
doc = fitz.open(r'EndSem_Notice_May2026.pdf')
for i, page in enumerate(doc):
    print(f'\n=== PAGE {i+1} of {len(doc)} ===')
    print(page.get_text())
doc.close()

print("\n\n")
print("=" * 80)
print("SAMPLE SENIOR REPORT - senior sample report.pdf")  
print("=" * 80)
doc2 = fitz.open(r'senior sample report.pdf')
for i, page in enumerate(doc2):
    print(f'\n=== PAGE {i+1} of {len(doc2)} ===')
    text = page.get_text()
    print(text)
doc2.close()
