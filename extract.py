from PyPDF2 import PdfReader

reader = PdfReader('c:/Users/amsh9/OneDrive/Desktop/PV-Bifacial-Sim/btp-2.pdf')
with open('c:/Users/amsh9/OneDrive/Desktop/PV-Bifacial-Sim/btp2_text.txt', 'w', encoding='utf-8') as f:
    for page in reader.pages:
        text = page.extract_text()
        if text:
            f.write(text + '\n')
