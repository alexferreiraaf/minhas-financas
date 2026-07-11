import * as pdfjsLib from 'pdfjs-dist';

// Configurar o worker do PDF.js para funcionar no navegador
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface ParsedTransaction {
  date: string; // YYYY-MM-DD
  desc: string;
  val: number;
  type: 'receita' | 'despesa';
}

export async function parsePdfToTransactions(file: File): Promise<ParsedTransaction[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async function() {
      try {
        const typedarray = new Uint8Array(this.result as ArrayBuffer);
        const loadingTask = pdfjsLib.getDocument(typedarray);
        const pdf = await loadingTask.promise;
        
        let fullText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          
          // Juntar o texto da página mantendo alguns espaços para separar as colunas
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + ' \n';
        }

        const transactions: ParsedTransaction[] = [];
        
        // Regex para capturar: Data (DD/MM ou DD/MM/AAAA) + Descrição + Valor (X,XX ou R$ X,XX)
        // Evita capturar muito texto na descrição limitando a ocorrência de outra data.
        const regex = /(\d{2}\/\d{2}(?:\/\d{4})?)\s+((?:(?!\d{2}\/\d{2}).)+?)\s+(-?(?:R\$|R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2})/g;
        let match;
        
        while ((match = regex.exec(fullText)) !== null) {
          let dateStr = match[1];
          // Se for só DD/MM, adicionar o ano atual
          if (dateStr.length === 5) {
            dateStr += `/${new Date().getFullYear()}`;
          }
          
          const desc = match[2].trim();
          let valStr = match[3].replace(/R\$/g, '').trim();
          
          let isNegative = false;
          if (valStr.startsWith('-')) {
            isNegative = true;
            valStr = valStr.substring(1).trim();
          }
          
          const valNum = parseFloat(valStr.replace(/\./g, '').replace(',', '.'));
          
          // Ignorar se o valor for 0
          if (valNum === 0 || isNaN(valNum)) continue;

          // Converter a data para YYYY-MM-DD
          const parts = dateStr.split('/');
          const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;

          transactions.push({
            date: isoDate,
            desc: desc,
            val: valNum,
            type: isNegative ? 'despesa' : 'receita'
          });
        }
        
        resolve(transactions);
      } catch (err) {
        console.error("Erro ao analisar o PDF:", err);
        reject(err);
      }
    };
    
    reader.onerror = (err) => {
      reject(err);
    };

    reader.readAsArrayBuffer(file);
  });
}
